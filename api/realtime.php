<?php
declare(strict_types=1);

// Echtzeit-Schicht: gleicht die geplanten Fahrten mit der DB-Timetables-API ab (Verspätung, Ausfall, Gleis)
// und erzeugt Hinweise für Nutzer, die den Bahnhof oder die Strecke als Favorit gespeichert haben.
// Ohne Schlüssel in .env bleibt alles bei den geplanten Zeiten.

const RT_BASE = 'https://apis.deutschebahn.com/db-api-marketplace/apis/timetables/v1';
const RT_TTL = 60;
const NOTIFY_MIN_DELAY = 5;

function realtime_enabled(): bool
{
    return env('DB_TIMETABLES_CLIENT_ID', '') !== '' && env('DB_TIMETABLES_API_KEY', '') !== '';
}

function rt_get(string $path): ?SimpleXMLElement
{
    $ctx = stream_context_create(['http' => [
        'method' => 'GET', 'timeout' => 6, 'ignore_errors' => true,
        'header' => "DB-Client-Id: " . env('DB_TIMETABLES_CLIENT_ID', '') . "\r\nDB-Api-Key: " . env('DB_TIMETABLES_API_KEY', '') . "\r\nAccept: application/xml\r\n",
    ]]);
    $body = @file_get_contents(RT_BASE . $path, false, $ctx);
    $status = 0;
    foreach ($http_response_header ?? [] as $h) {
        if (preg_match('#^HTTP/\S+ (\d{3})#', $h, $m)) {
            $status = (int) $m[1];
        }
    }
    if ($body === false || $status !== 200) {
        return null;
    }
    $prev = libxml_use_internal_errors(true);
    $xml = simplexml_load_string($body, 'SimpleXMLElement', LIBXML_NONET);
    libxml_use_internal_errors($prev);
    return $xml ?: null;
}

function rt_eva(int $stationId, string $name): ?string
{
    $key = 'eva:' . $stationId;
    $cached = q('SELECT value FROM meta WHERE key = ?', [$key])->fetchColumn();
    if ($cached !== false) {
        return $cached === '' ? null : (string) $cached;
    }
    $xml = rt_get('/station/' . rawurlencode($name));
    if (!$xml) {
        return null;
    }
    $eva = '';
    foreach ($xml->station as $s) {
        if (strcasecmp((string) $s['name'], $name) === 0) {
            $eva = (string) $s['eva'];
            break;
        }
    }
    if ($eva === '' && count($xml->station) === 1) {
        $eva = (string) $xml->station[0]['eva'];
    }
    q('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [$key, $eva]);
    return $eva === '' ? null : $eva;
}

// "2610292310" (JJMMTTHHMM) -> Minuten seit Mitternacht
function rt_minutes(string $ts): ?int
{
    return preg_match('/^\d{6}(\d{2})(\d{2})$/', $ts, $m) ? (int) $m[1] * 60 + (int) $m[2] : null;
}

function rt_line(SimpleXMLElement $s, SimpleXMLElement $evt): string
{
    $l = (string) $evt['l'];
    $c = (string) ($s->tl['c'] ?? '');
    $line = preg_match('/^[A-Za-z]/', $l) ? $l : $c . $l;
    return strtoupper(str_replace(' ', '', $line));
}

function trip_label(array $trip): string
{
    return trim($trip['line'] . ' nach ' . $trip['headsign']);
}

function notify_user(int $userId, int $tripId, string $kind, string $title, string $body, string $key): void
{
    q(
        'INSERT OR IGNORE INTO notifications (user_id, trip_id, kind, title, body, dedupe_key, created_at) VALUES (?,?,?,?,?,?,?)',
        [$userId, $tripId, $kind, $title, $body, $key, now()]
    );
}

// Wer soll von einer Änderung an dieser Fahrt erfahren? Favoriten-Bahnhof oder Favoriten-Strecke, Abfahrt bald.
function trip_watchers(int $tripId): array
{
    $from = now_minutes() - 5;
    $to = now_minutes() + 120;
    $users = q(
        'SELECT DISTINCT f.user_id FROM favorites f JOIN trip_stops a ON a.trip_id = ? AND a.station_id = f.from_station_id
         WHERE f.kind = \'station\' AND a.planned_dep BETWEEN ? AND ?',
        [$tripId, $from, $to]
    )->fetchAll(PDO::FETCH_COLUMN);
    $routes = q(
        'SELECT DISTINCT f.user_id FROM favorites f
         JOIN trip_stops a ON a.trip_id = ? AND a.station_id = f.from_station_id
         JOIN trip_stops b ON b.trip_id = a.trip_id AND b.seq > a.seq AND b.station_id = f.to_station_id
         WHERE f.kind = \'route\' AND a.planned_dep BETWEEN ? AND ?',
        [$tripId, $from, $to]
    )->fetchAll(PDO::FETCH_COLUMN);
    return array_map('intval', array_unique(array_merge($users, $routes)));
}

// Vergleicht alten und neuen Stand und legt Hinweise an. Doppelte Hinweise verhindert dedupe_key.
function notify_changes(array $trip, string $stationName, ?int $plannedMin, array $old, array $new): void
{
    $events = [];
    $label = trip_label($trip);
    $when = $plannedMin !== null ? fmt_min($plannedMin) : '';
    if ($new['cancelled'] && !$old['cancelled']) {
        $events[] = ['cancelled', 'Ausfall: ' . $label, "Die Fahrt um $when ab $stationName fällt aus.", 'cancel:' . $trip['id']];
    }
    if (!$new['cancelled'] && $new['delay'] !== null && $new['delay'] >= NOTIFY_MIN_DELAY && $new['delay'] !== $old['delay']) {
        $step = intdiv($new['delay'], NOTIFY_MIN_DELAY) * NOTIFY_MIN_DELAY;
        $events[] = ['delay', 'Verspätung: ' . $label, "Abfahrt ab $stationName statt $when ca. " . $new['delay'] . ' Min. später.', 'delay:' . $trip['id'] . ':' . $step];
    }
    if ($new['platform'] !== null && $old['platform'] !== null && $new['platform'] !== $old['platform']) {
        $events[] = ['platform', 'Gleisänderung: ' . $label, "Ab $stationName jetzt Gleis " . $new['platform'] . ' (vorher ' . $old['platform'] . ').', 'plat:' . $trip['id'] . ':' . $new['platform']];
    }
    if (!$events) {
        return;
    }
    foreach (trip_watchers((int) $trip['id']) as $uid) {
        foreach ($events as [$kind, $title, $body, $key]) {
            notify_user($uid, (int) $trip['id'], $kind, $title, $body, $key);
        }
    }
}

function refresh_realtime(int $stationId, string $name, string $date): void
{
    if (!realtime_enabled() || data_source() !== 'gtfs') {
        return;
    }
    $stamp = 'rt:' . $stationId;
    $last = (int) q('SELECT value FROM meta WHERE key = ?', [$stamp])->fetchColumn();
    if (now() - $last < RT_TTL) {
        return;
    }
    q('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [$stamp, (string) now()]);
    $eva = rt_eva($stationId, $name);
    if (!$eva) {
        return;
    }

    $plan = [];
    $ymd = date('ymd', now());
    $hour = (int) date('G', now());
    for ($h = $hour; $h <= min(23, $hour + 1); $h++) {
        $xml = rt_get(sprintf('/plan/%s/%s/%02d', $eva, $ymd, $h));
        foreach ($xml ? $xml->s : [] as $s) {
            $dp = isset($s->dp) ? $s->dp : null;
            $ar = isset($s->ar) ? $s->ar : null;
            $evt = $dp ?? $ar;
            if ($evt !== null) {
                $plan[(string) $s['id']] = [
                    'line' => rt_line($s, $evt),
                    'dep' => $dp !== null ? rt_minutes((string) $dp['pt']) : null,
                    'arr' => $ar !== null ? rt_minutes((string) $ar['pt']) : null,
                ];
            }
        }
    }
    $changes = rt_get('/fchg/' . $eva);
    if (!$plan || !$changes) {
        return;
    }
    foreach ($changes->s as $s) {
        $id = (string) $s['id'];
        if (!isset($plan[$id])) {
            continue;
        }
        $p = $plan[$id];
        $useDep = $p['dep'] !== null && isset($s->dp);
        $evt = $useDep ? $s->dp : (isset($s->ar) ? $s->ar : null);
        $planned = $useDep ? $p['dep'] : $p['arr'];
        if ($evt === null || $planned === null) {
            continue;
        }
        $cancelled = (string) $evt['cs'] === 'c';
        $ct = rt_minutes((string) $evt['ct']);
        $delay = $ct !== null ? max(0, $ct - $planned) : null;
        $cp = (string) ($evt['cp'] ?? '');
        if (!$cancelled && $delay === null && $cp === '') {
            continue;
        }
        $col = $useDep ? 'planned_dep' : 'planned_arr';
        $line = $p['line'];
        $sql = 'SELECT t.id, t.line, t.headsign, t.cancelled, ts.id AS ts_id, ts.delay_min, ts.platform FROM trips t JOIN trip_stops ts ON ts.trip_id = t.id
                WHERE ts.station_id = ? AND t.service_date = ? AND ts.' . $col . ' = ? AND ';
        $sql .= preg_match('/\d/', $line) ? 'UPPER(REPLACE(t.line, \' \', \'\')) = ?' : 'UPPER(t.line) LIKE ?';
        $trip = q($sql, [$stationId, $date, $planned, preg_match('/\d/', $line) ? $line : $line . '%'])->fetch();
        if (!$trip) {
            continue;
        }
        $old = ['cancelled' => (bool) $trip['cancelled'], 'delay' => $trip['delay_min'] !== null ? (int) $trip['delay_min'] : null, 'platform' => $trip['platform']];
        $new = ['cancelled' => $cancelled, 'delay' => $cancelled ? null : $delay, 'platform' => $cp !== '' ? $cp : $trip['platform']];
        q('UPDATE trip_stops SET delay_min = ?, platform = ? WHERE id = ?', [$new['delay'], $new['platform'], (int) $trip['ts_id']]);
        q('UPDATE trips SET cancelled = ?, official_delay_min = COALESCE(?, official_delay_min) WHERE id = ?', [$cancelled ? 1 : 0, $new['delay'], (int) $trip['id']]);
        notify_changes($trip, $name, $planned, $old, $new);
    }
}

// Aktualisiert die nächsten Halte einer Fahrt, damit die Verspätung entlang der Strecke stimmt.
function refresh_trip_realtime(int $tripId, string $date, int $maxStations = 3): void
{
    if (!realtime_enabled() || data_source() !== 'gtfs') {
        return;
    }
    $from = now_minutes() - 10;
    $rows = q(
        'SELECT ts.station_id, s.name FROM trip_stops ts JOIN stations s ON s.id = ts.station_id
         WHERE ts.trip_id = ? AND COALESCE(ts.planned_dep, ts.planned_arr) >= ? ORDER BY ts.seq LIMIT ?',
        [$tripId, $from, $maxStations]
    )->fetchAll();
    foreach ($rows as $r) {
        refresh_realtime((int) $r['station_id'], $r['name'], $date);
    }
}
