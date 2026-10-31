<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/trust.php';
require __DIR__ . '/timetable.php';
require __DIR__ . '/realtime.php';

const REPORT_TYPES = ['delay', 'cancelled', 'on_time', 'crowded', 'defect', 'climate', 'no_wifi', 'toilet', 'platform_change', 'other'];

function user_public(array $u): array
{
    return [
        'id' => (int) $u['id'],
        'email' => $u['email'],
        'display_name' => $u['display_name'],
        'role' => $u['role'],
        'trust_score' => round((float) $u['trust_score'], 2),
        'premium' => is_premium((int) $u['id']),
    ];
}

function str_field(array $b, string $key, int $min, int $max, string $label): string
{
    $v = trim((string) ($b[$key] ?? ''));
    $len = mb_strlen($v);
    if ($len < $min || $len > $max) {
        fail(422, 'invalid_' . $key, "$label muss zwischen $min und $max Zeichen lang sein.");
    }
    return $v;
}

function get_trip(int $id): array
{
    $t = q('SELECT * FROM trips WHERE id = ?', [$id])->fetch();
    if (!$t) {
        fail(404, 'not_found', 'Zug nicht gefunden.');
    }
    return $t;
}

function trip_stops(int $tripId): array
{
    return q(
        'SELECT ts.seq, ts.station_id, s.name, s.lat, s.lon, ts.planned_arr, ts.planned_dep, ts.platform, ts.delay_min
         FROM trip_stops ts JOIN stations s ON s.id = ts.station_id WHERE ts.trip_id = ? ORDER BY ts.seq',
        [$tripId]
    )->fetchAll();
}

function check_location(int $userId, array $stops, ?float $lat, ?float $lon): bool
{
    if ($lat === null || $lon === null || abs($lat) > 90 || abs($lon) > 180) {
        return false;
    }
    if (env('DEV_SKIP_LOCATION') === '1') {
        return true;
    }
    $prev = q('SELECT lat, lon, created_at AS t FROM report_locations WHERE user_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1', [$userId, now() - 3600])->fetch() ?: null;
    return location_plausible($lat, $lon, $stops, $prev, now());
}

function recompute(int $tripId, string $type): void
{
    $reports = q(
        'SELECT r.*, u.trust_score FROM reports r JOIN users u ON u.id = r.user_id
         WHERE r.trip_id = ? AND r.type = ? AND r.status NOT IN (\'rejected\',\'removed\')',
        [$tripId, $type]
    )->fetchAll();
    foreach ($reports as $r) {
        if ((int) $r['locked'] === 1) {
            continue;
        }
        $supports = [];
        foreach ($reports as $o) {
            if ((int) $o['user_id'] !== (int) $r['user_id']) {
                $supports[] = ['user_id' => (int) $o['user_id'], 'created_at' => (int) $o['created_at'], 'location_ok' => (int) $o['location_ok'], 'trust' => (float) $o['trust_score']];
            }
        }
        $votes = q(
            'SELECT v.user_id, v.value, v.location_ok, v.created_at, u.trust_score FROM report_votes v JOIN users u ON u.id = v.user_id WHERE v.report_id = ?',
            [$r['id']]
        )->fetchAll();
        $disputes = [];
        foreach ($votes as $v) {
            $row = ['user_id' => (int) $v['user_id'], 'created_at' => (int) $v['created_at'], 'location_ok' => (int) $v['location_ok'], 'trust' => (float) $v['trust_score']];
            if ((int) $v['value'] === 1) {
                $supports[] = $row;
            } else {
                $disputes[] = $row;
            }
        }
        $new = evaluate_report(
            ['created_at' => (int) $r['created_at'], 'user_id' => (int) $r['user_id'], 'locked' => 0, 'status' => $r['status']],
            (bool) $r['location_ok'],
            (float) $r['trust_score'],
            $supports,
            $disputes
        );
        if ($new !== $r['status']) {
            q('UPDATE reports SET status = ? WHERE id = ?', [$new, $r['id']]);
            if ($new === 'confirmed') {
                q('UPDATE users SET trust_score = MIN(2.0, trust_score + 0.1) WHERE id = ?', [$r['user_id']]);
            }
        }
    }
}

function report_rows(int $tripId, ?int $viewerId): array
{
    $sql = 'SELECT r.id, r.type, r.minutes, r.comment, r.status, r.created_at, r.user_id, u.display_name,
              (SELECT COUNT(*) FROM report_votes v WHERE v.report_id = r.id AND v.value = 1) AS confirms,
              (SELECT COUNT(*) FROM report_votes v WHERE v.report_id = r.id AND v.value = -1) AS disputes,
              ' . ($viewerId ? '(SELECT value FROM report_votes v WHERE v.report_id = r.id AND v.user_id = :me)' : 'NULL') . ' AS my_vote
            FROM reports r JOIN users u ON u.id = r.user_id
            WHERE r.trip_id = :trip AND r.status NOT IN (\'rejected\',\'removed\')'
        . ($viewerId ? ' AND r.user_id NOT IN (SELECT blocked_id FROM user_blocks WHERE blocker_id = :me)' : '')
        . ' ORDER BY r.created_at DESC LIMIT 50';
    $params = ['trip' => $tripId] + ($viewerId ? ['me' => $viewerId] : []);
    $out = [];
    foreach (q($sql, $params)->fetchAll() as $r) {
        $out[] = [
            'id' => (int) $r['id'],
            'type' => $r['type'],
            'minutes' => $r['minutes'] !== null ? (int) $r['minutes'] : null,
            'comment' => $r['comment'],
            'status' => $r['status'],
            'age_sec' => now() - (int) $r['created_at'],
            'author' => 'Anonym',
            'author_id' => (int) $r['user_id'],
            'confirms' => (int) $r['confirms'],
            'disputes' => (int) $r['disputes'],
            'mine' => $viewerId !== null && (int) $r['user_id'] === $viewerId,
            'my_vote' => $r['my_vote'] !== null ? (int) $r['my_vote'] : null,
        ];
    }
    return $out;
}

function connections(int $from, int $to, int $afterMin, ?int $via = null): array
{
    $date = service_date();
    $gtfsOnly = data_source() === 'gtfs';
    $direct = q(
        'SELECT t1.id AS trip1, t1.line AS line1, t1.headsign AS headsign1,
                sa.name AS from1, sb.name AS to1, a.station_id AS from_id1, b.station_id AS to_id1,
                a.planned_dep AS dep1, b.planned_arr AS arr1, a.platform AS platform1,
                COALESCE(a.delay_min, t1.official_delay_min) AS delay1
         FROM trips t1
         JOIN trip_stops a ON a.trip_id = t1.id AND a.station_id = ?
         JOIN trip_stops b ON b.trip_id = t1.id AND b.station_id = ? AND b.seq > a.seq
         JOIN stations sa ON sa.id = a.station_id
         JOIN stations sb ON sb.id = b.station_id
         WHERE t1.service_date = ? AND t1.cancelled = 0
           AND (? = 0 OR t1.source_trip_id IS NOT NULL)
           AND a.planned_dep IS NOT NULL AND b.planned_arr IS NOT NULL
           AND a.planned_dep + COALESCE(a.delay_min, t1.official_delay_min) >= ?
           AND (? IS NULL OR EXISTS (
             SELECT 1 FROM trip_stops v
             WHERE v.trip_id = t1.id AND v.station_id = ? AND v.seq BETWEEN a.seq AND b.seq
           ))
         ORDER BY b.planned_arr + COALESCE(a.delay_min, t1.official_delay_min),
                  a.planned_dep + COALESCE(a.delay_min, t1.official_delay_min)
         LIMIT 80',
        [$from, $to, $date, (int) $gtfsOnly, $afterMin, $via, $via]
    )->fetchAll();
    $transfers = q(
        'SELECT t1.id AS trip1, t1.line AS line1, t1.headsign AS headsign1,
                sa.name AS from1, sx.name AS to1, a.station_id AS from_id1, x.station_id AS to_id1,
                a.planned_dep AS dep1, x.planned_arr AS arr1, a.platform AS platform1,
                COALESCE(a.delay_min, t1.official_delay_min) AS delay1,
                t2.id AS trip2, t2.line AS line2, t2.headsign AS headsign2,
                sx.name AS from2, sb.name AS to2, c.station_id AS from_id2, b.station_id AS to_id2,
                c.planned_dep AS dep2, b.planned_arr AS arr2, c.platform AS platform2,
                COALESCE(c.delay_min, t2.official_delay_min) AS delay2
         FROM trips t1
         JOIN trip_stops a ON a.trip_id = t1.id AND a.station_id = ?
         JOIN trip_stops x ON x.trip_id = t1.id AND x.seq > a.seq
         JOIN trips t2 ON t2.service_date = t1.service_date AND t2.cancelled = 0 AND t2.id <> t1.id
           AND (? = 0 OR t2.source_trip_id IS NOT NULL)
         JOIN trip_stops c ON c.trip_id = t2.id AND c.station_id = x.station_id AND c.planned_dep IS NOT NULL
         JOIN trip_stops b ON b.trip_id = t2.id AND b.station_id = ? AND b.seq > c.seq
         JOIN stations sa ON sa.id = a.station_id
         JOIN stations sx ON sx.id = x.station_id
         JOIN stations sb ON sb.id = b.station_id
         WHERE t1.service_date = ? AND t1.cancelled = 0 AND x.station_id <> ?
           AND (? = 0 OR t1.source_trip_id IS NOT NULL)
           AND a.planned_dep IS NOT NULL AND x.planned_arr IS NOT NULL AND b.planned_arr IS NOT NULL
           AND a.planned_dep + COALESCE(a.delay_min, t1.official_delay_min) >= ?
           AND c.planned_dep + COALESCE(c.delay_min, t2.official_delay_min)
               >= x.planned_arr + COALESCE(a.delay_min, t1.official_delay_min) + 4
           AND (? IS NULL OR EXISTS (
             SELECT 1 FROM trip_stops v
             WHERE v.station_id = ? AND (
               (v.trip_id = t1.id AND v.seq BETWEEN a.seq AND x.seq) OR
               (v.trip_id = t2.id AND v.seq BETWEEN c.seq AND b.seq)
             )
           ))
         ORDER BY b.planned_arr + COALESCE(c.delay_min, t2.official_delay_min),
                  a.planned_dep + COALESCE(a.delay_min, t1.official_delay_min)
         LIMIT 80',
        [$from, (int) $gtfsOnly, $to, $date, $to, (int) $gtfsOnly, $afterMin, $via, $via]
    )->fetchAll();
    $leg = static function (array $row, int $number): array {
        $d = (int) $row["delay$number"];
        $dep = (int) $row["dep$number"];
        $arr = (int) $row["arr$number"];
        return [
            'trip_id' => (int) $row["trip$number"], 'line' => $row["line$number"], 'headsign' => $row["headsign$number"],
            'from' => $row["from$number"], 'to' => $row["to$number"],
            'from_id' => (int) $row["from_id$number"], 'to_id' => (int) $row["to_id$number"],
            'dep' => fmt_min($dep), 'arr' => fmt_min($arr),
            'dep_actual' => fmt_min($dep + $d), 'arr_actual' => fmt_min($arr + $d),
            'dep_m' => $dep + $d, 'arr_m' => $arr + $d,
            'platform' => $row["platform$number"], 'delay' => $d,
        ];
    };
    $results = [];
    foreach ($direct as $row) {
        $results[] = [$leg($row, 1)];
    }
    foreach ($transfers as $row) {
        $results[] = [$leg($row, 1), $leg($row, 2)];
    }
    usort($results, function ($p, $q2) {
        $ap = end($p)['arr_m'];
        $aq = end($q2)['arr_m'];
        return [$ap, count($p), $p[0]['dep_m']] <=> [$aq, count($q2), $q2[0]['dep_m']];
    });
    $seen = [];
    $out = [];
    foreach ($results as $r) {
        $key = implode('-', array_map(fn($l) => $l['trip_id'], $r));
        if (isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $out[] = ['transfers' => count($r) - 1, 'dep' => $r[0]['dep_actual'], 'arr' => end($r)['arr_actual'], 'legs' => $r];
        if (count($out) >= 8) {
            break;
        }
    }
    return $out;
}

// ---------------------------------------------------------------- routes

$routes = [];
function route(string $method, string $pattern, callable $fn): void
{
    global $routes;
    $routes[] = [$method, '#^' . $pattern . '$#', $fn];
}

route('GET', '/config', fn() => [
    'app' => 'Train Trust',
    'data_source' => data_source(),
    'payments_mode' => env('PAYMENTS_MODE', 'demo'),
    'social_login' => false,
    'report_types' => REPORT_TYPES,
]);

route('POST', '/auth/register', function () {
    rate_limit('register:' . client_ip(), 10, 3600, 'Zu viele Registrierungen. Bitte versuche es später erneut.');
    $b = body();
    $email = strtolower(trim((string) ($b['email'] ?? '')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 120) {
        fail(422, 'invalid_email', 'Bitte gib eine gültige E-Mail-Adresse ein.');
    }
    $name = str_field($b, 'display_name', 2, 40, 'Dein Name');
    $pw = (string) ($b['password'] ?? '');
    if (strlen($pw) < 8 || strlen($pw) > 200) {
        fail(422, 'invalid_password', 'Das Passwort braucht mindestens 8 Zeichen.');
    }
    if (empty($b['accept_terms'])) {
        fail(422, 'terms', 'Bitte akzeptiere Datenschutz und Nutzungsbedingungen.');
    }
    if (q('SELECT 1 FROM users WHERE email = ?', [$email])->fetchColumn()) {
        fail(409, 'email_taken', 'Mit dieser E-Mail gibt es schon ein Konto.');
    }
    q('INSERT INTO users (email, display_name, password_hash) VALUES (?,?,?)', [$email, $name, password_hash($pw, PASSWORD_DEFAULT)]);
    $id = (int) db()->lastInsertId();
    $user = q('SELECT * FROM users WHERE id = ?', [$id])->fetch();
    return ['token' => create_session($id), 'user' => user_public($user)];
});

route('POST', '/auth/login', function () {
    $ip = 'loginfail:' . client_ip();
    $fails = (int) q('SELECT COUNT(*) FROM rate_events WHERE bucket = ? AND created_at > ?', [$ip, now() - 600])->fetchColumn();
    if ($fails >= 10) {
        fail(429, 'rate_limited', 'Zu viele Versuche. Bitte warte ein paar Minuten.');
    }
    $b = body();
    $u = q('SELECT * FROM users WHERE email = ?', [strtolower(trim((string) ($b['email'] ?? '')))])->fetch();
    $hash = $u['password_hash'] ?? '$2y$10$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuvwxyzABCDE';
    $ok = password_verify((string) ($b['password'] ?? ''), $hash) && $u;
    if (!$ok) {
        q('INSERT INTO rate_events (bucket, created_at) VALUES (?, ?)', [$ip, now()]);
        fail(401, 'bad_login', 'E-Mail oder Passwort stimmt nicht.');
    }
    if ((int) $u['banned'] === 1) {
        fail(403, 'banned', 'Dein Konto ist gesperrt.');
    }
    return ['token' => create_session((int) $u['id']), 'user' => user_public($u)];
});

route('POST', '/auth/logout', function () {
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/^Bearer\s+([a-f0-9]{64})$/i', $h, $m)) {
        q('DELETE FROM sessions WHERE token_hash = ?', [hash('sha256', strtolower($m[1]))]);
    }
    return ['ok' => true];
});

route('GET', '/me', fn() => ['user' => user_public(current_user())]);

// FR-2: delete account and personal data in the app.
route('POST', '/me/delete', function () {
    $u = current_user();
    if (!password_verify((string) (body()['password'] ?? ''), $u['password_hash'])) {
        fail(403, 'bad_password', 'Das Passwort stimmt nicht.');
    }
    q('DELETE FROM users WHERE id = ?', [$u['id']]);
    return ['ok' => true];
});

function norm_name(string $s): string
{
    return station_search_key($s);
}

function station_service_filter(string $alias): array
{
    if (data_source() !== 'gtfs') {
        return ['1=1', []];
    }
    return [
        "EXISTS (SELECT 1 FROM trip_stops ts JOIN trips t ON t.id = ts.trip_id
                WHERE ts.station_id = $alias.id AND t.service_date = ? AND t.source_trip_id IS NOT NULL)",
        [service_date()],
    ];
}

// Bahnhofssuche: Wortanfänge zuerst, dann beliebte Bahnhöfe. Ohne Suchbegriff: die meistgesuchten.
function search_stations(string $term, int $limit): array
{
    $needle = norm_name($term);
    $tokens = $needle === '' ? [] : explode(' ', $needle);
    [$serviceFilter, $serviceParams] = station_service_filter('s');
    $select = 'SELECT s.id, s.name, s.lat, s.lon, s.location_type, s.search_name, COALESCE(h.n, 0) AS hits
               FROM stations s LEFT JOIN station_hits h ON h.station_id = s.id';
    if (!$tokens) {
        return array_map(
            static fn ($r) => [
                'id' => (int) $r['id'], 'name' => $r['name'], 'lat' => (float) $r['lat'], 'lon' => (float) $r['lon'],
                'popular' => (int) $r['hits'] > 0 || (int) $r['location_type'] === 1,
            ],
            q("$select WHERE $serviceFilter ORDER BY hits DESC, (s.location_type = 1) DESC, s.name LIMIT ?", [...$serviceParams, $limit])->fetchAll()
        );
    }

    $where = [$serviceFilter];
    $params = $serviceParams;
    foreach ($tokens as $token) {
        $where[] = 'EXISTS (SELECT 1 FROM station_search_terms x WHERE x.station_id = s.id AND x.term LIKE ?)';
        $params[] = $token . '%';
    }
    $params[] = $needle;
    $params[] = $needle . '%';
    $rows = q(
        "$select WHERE " . implode(' AND ', $where)
            . ' ORDER BY CASE WHEN s.search_name = ? THEN 0 WHEN s.search_name LIKE ? THEN 1 ELSE 2 END, hits DESC, s.name LIMIT 1000',
        $params
    )->fetchAll();
    $scored = [];
    foreach ($rows as $r) {
        $score = 0.0;
        if (str_starts_with($r['search_name'], $needle)) {
            $score += 50;
        }
        if ($r['search_name'] === $needle) {
            $score += 100;
        }
        $score += log(1 + (int) $r['hits']) * 5 + ((int) $r['location_type'] === 1 ? 3 : 0);
        $r['_s'] = $score;
        $scored[] = $r;
    }
    usort($scored, fn ($a, $b) => [$b['_s'], $a['name']] <=> [$a['_s'], $b['name']]);
    return array_map(
        fn ($r) => ['id' => (int) $r['id'], 'name' => $r['name'], 'lat' => (float) $r['lat'], 'lon' => (float) $r['lon'], 'popular' => (int) $r['hits'] > 0 || (int) $r['location_type'] === 1],
        array_slice($scored, 0, $limit)
    );
}

route('GET', '/stations', function () {
    if (isset($_GET['lat'], $_GET['lon']) && is_numeric($_GET['lat']) && is_numeric($_GET['lon'])) {
        $lat = (float) $_GET['lat'];
        $lon = (float) $_GET['lon'];
        if (abs($lat) > 90 || abs($lon) > 180) {
            fail(422, 'invalid_position', 'Ungültiger Standort.');
        }
        [$serviceFilter, $serviceParams] = station_service_filter('s');
        $rows = q(
            "SELECT s.id, s.name, s.lat, s.lon FROM stations s
             WHERE s.lat BETWEEN ? AND ? AND s.lon BETWEEN ? AND ? AND $serviceFilter",
            array_merge([$lat - 0.1, $lat + 0.1, $lon - 0.15, $lon + 0.15], $serviceParams)
        )->fetchAll();
        foreach ($rows as &$r) {
            $r['distance_m'] = (int) round(haversine_km($lat, $lon, (float) $r['lat'], (float) $r['lon']) * 1000);
        }
        unset($r);
        usort($rows, fn ($a, $b) => $a['distance_m'] <=> $b['distance_m']);
        return ['stations' => array_slice($rows, 0, 5)];
    }
    if (isset($_GET['id'])) {
        return ['stations' => q('SELECT id, name, lat, lon FROM stations WHERE id = ?', [(int) $_GET['id']])->fetchAll()];
    }
    if (isset($_GET['bbox'])) {
        $p = array_map('floatval', explode(',', (string) $_GET['bbox']));
        if (count($p) !== 4 || $p[0] >= $p[2] || $p[1] >= $p[3] || abs($p[0]) > 90 || abs($p[2]) > 90 || abs($p[1]) > 180 || abs($p[3]) > 180) {
            fail(422, 'invalid_bbox', 'Ungültiger Kartenausschnitt.');
        }
        [$serviceFilter, $serviceParams] = station_service_filter('s');
        $rows = q(
            'SELECT s.id, s.name, s.lat, s.lon FROM stations s LEFT JOIN station_hits h ON h.station_id = s.id
             WHERE s.lat BETWEEN ? AND ? AND s.lon BETWEEN ? AND ? AND ' . $serviceFilter . '
             ORDER BY COALESCE(h.n, 0) DESC, s.name LIMIT 10001',
            array_merge([$p[0], $p[2], $p[1], $p[3]], $serviceParams)
        )->fetchAll();
        $truncated = count($rows) > 10000;
        return ['stations' => array_slice($rows, 0, 10000), 'truncated' => $truncated];
    }
    return ['stations' => search_stations(trim((string) ($_GET['q'] ?? '')), 15)];
});

route('GET', '/stations/(\d+)/departures', function ($id) {
    ensure_trips(service_date());
    $st = q('SELECT id, name FROM stations WHERE id = ?', [$id])->fetch();
    if (!$st) {
        fail(404, 'not_found', 'Bahnhof nicht gefunden.');
    }
    if (empty($_GET['fast'])) {
        q('INSERT INTO station_hits (station_id, n) VALUES (?, 1) ON CONFLICT(station_id) DO UPDATE SET n = n + 1', [(int) $st['id']]);
        refresh_realtime((int) $st['id'], $st['name'], service_date());
    }
    $from = now_minutes() - 3;
    $rows = q(
        'SELECT t.id, t.line, t.headsign, COALESCE(ts.delay_min, t.official_delay_min) AS delay, t.cancelled, ts.planned_dep, ts.platform
         FROM trip_stops ts JOIN trips t ON t.id = ts.trip_id
         WHERE ts.station_id = ? AND t.service_date = ? AND ts.planned_dep IS NOT NULL AND ts.planned_dep + COALESCE(ts.delay_min, t.official_delay_min) >= ?
           AND (? = 0 OR t.source_trip_id IS NOT NULL)
         ORDER BY ts.planned_dep LIMIT 30',
        [$id, service_date(), $from, (int) (data_source() === 'gtfs')]
    )->fetchAll();
    $items = [];
    foreach ($rows as $r) {
        $badge = q(
            'SELECT type, status, COUNT(*) AS n FROM reports WHERE trip_id = ? AND status IN (\'confirmed\',\'unconfirmed\')
             GROUP BY type, status ORDER BY (status = \'confirmed\') DESC, n DESC LIMIT 1',
            [$r['id']]
        )->fetch() ?: null;
        $items[] = [
            'trip_id' => (int) $r['id'], 'line' => $r['line'], 'headsign' => $r['headsign'],
            'planned' => fmt_min($r['planned_dep']), 'actual' => fmt_min($r['planned_dep'] + $r['delay']),
            'delay' => (int) $r['delay'], 'cancelled' => (bool) $r['cancelled'], 'platform' => $r['platform'],
            'badge' => $badge ? ['type' => $badge['type'], 'status' => $badge['status'], 'count' => (int) $badge['n']] : null,
        ];
    }
    return ['station' => $st, 'updated' => date('H:i'), 'items' => $items];
});

route('GET', '/trips/(\d+)', function ($id) {
    $t = get_trip((int) $id);
    if (empty($_GET['fast'])) {
        refresh_trip_realtime((int) $id, $t['service_date']);
        $t = get_trip((int) $id);
    }
    $viewer = current_user(false);
    $rows = trip_stops((int) $id);
    $anyKnown = count(array_filter($rows, fn($s) => $s['delay_min'] !== null)) > 0;
    $carry = $anyKnown ? null : (int) $t['official_delay_min'];
    $stops = [];
    foreach ($rows as $s) {
        $known = $s['delay_min'] !== null;
        if ($known) {
            $carry = (int) $s['delay_min'];
        }
        $d = $carry ?? 0;
        $stops[] = [
            'station_id' => (int) $s['station_id'], 'name' => $s['name'], 'platform' => $s['platform'],
            'arr' => fmt_min($s['planned_arr']), 'dep' => fmt_min($s['planned_dep']),
            'arr_actual' => $s['planned_arr'] !== null ? fmt_min($s['planned_arr'] + $d) : null,
            'dep_actual' => $s['planned_dep'] !== null ? fmt_min($s['planned_dep'] + $d) : null,
            'delay' => $d, 'estimated' => !$known && $carry !== null && $anyKnown,
        ];
    }
    $wag = q('SELECT wagons FROM wagon_reports WHERE trip_id = ? ORDER BY wagons', [(int) $id])->fetchAll(PDO::FETCH_COLUMN);
    $myWag = $viewer ? q('SELECT wagons FROM wagon_reports WHERE trip_id = ? AND user_id = ?', [(int) $id, (int) $viewer['id']])->fetchColumn() : false;
    return [
        'trip' => ['id' => (int) $t['id'], 'line' => $t['line'], 'headsign' => $t['headsign'], 'date' => $t['service_date'],
            'delay' => (int) $t['official_delay_min'], 'cancelled' => (bool) $t['cancelled']],
        'wagons' => ['count' => $wag ? (int) $wag[intdiv(count($wag), 2)] : null, 'votes' => count($wag), 'mine' => $myWag !== false ? (int) $myWag : null],
        'stops' => $stops,
        'reports' => report_rows((int) $id, $viewer ? (int) $viewer['id'] : null),
    ];
});

route('POST', '/trips/(\d+)/wagons', function ($id) {
    $u = current_user();
    $uid = (int) $u['id'];
    $trip = get_trip((int) $id);
    $b = body();
    $n = (int) ($b['wagons'] ?? 0);
    if ($n < 1 || $n > 30) {
        fail(422, 'invalid_wagons', 'Bitte gib die Zahl der Wagen an (1 bis 30).');
    }
    rate_limit("wagons:u$uid", 20, 600, 'Bitte warte ein paar Minuten.');
    $lat = isset($b['lat']) && is_numeric($b['lat']) ? (float) $b['lat'] : null;
    $lon = isset($b['lon']) && is_numeric($b['lon']) ? (float) $b['lon'] : null;
    if (!check_location($uid, trip_stops((int) $trip['id']), $lat, $lon)) {
        fail(403, 'location_required', 'Die Wagenzahl kannst du nur melden, wenn du im Zug oder am Bahnsteig bist.');
    }
    q('INSERT INTO wagon_reports (trip_id, user_id, wagons, created_at) VALUES (?,?,?,?)
       ON CONFLICT(trip_id, user_id) DO UPDATE SET wagons = excluded.wagons, created_at = excluded.created_at', [$trip['id'], $uid, $n, now()]);
    $wag = q('SELECT wagons FROM wagon_reports WHERE trip_id = ? ORDER BY wagons', [$trip['id']])->fetchAll(PDO::FETCH_COLUMN);
    return ['wagons' => ['count' => (int) $wag[intdiv(count($wag), 2)], 'votes' => count($wag), 'mine' => $n]];
});

// Einschränkungen heute: Ausfälle und größere Verspätungen, dazu bestätigte Fahrgast-Meldungen.
route('GET', '/disruptions', function () {
    ensure_trips(service_date());
    $items = [];
    $rows = q(
        'SELECT id, line, headsign, official_delay_min AS delay, cancelled FROM trips
         WHERE service_date = ? AND (cancelled = 1 OR official_delay_min >= 10)
         ORDER BY cancelled DESC, official_delay_min DESC LIMIT 40',
        [service_date()]
    )->fetchAll();
    foreach ($rows as $r) {
        $items[] = ['trip_id' => (int) $r['id'], 'line' => $r['line'], 'headsign' => $r['headsign'],
            'kind' => (int) $r['cancelled'] ? 'cancelled' : 'delay', 'delay' => (int) $r['delay'], 'source' => 'official'];
    }
    $crowd = q(
        'SELECT DISTINCT t.id, t.line, t.headsign, r.type, r.minutes FROM reports r JOIN trips t ON t.id = r.trip_id
         WHERE r.status = \'confirmed\' AND r.type IN (\'delay\',\'cancelled\',\'defect\') AND r.created_at >= ? ORDER BY r.created_at DESC LIMIT 20',
        [now() - 3 * 3600]
    )->fetchAll();
    foreach ($crowd as $r) {
        $items[] = ['trip_id' => (int) $r['id'], 'line' => $r['line'], 'headsign' => $r['headsign'],
            'kind' => $r['type'], 'delay' => (int) ($r['minutes'] ?? 0), 'source' => 'community'];
    }
    return ['items' => $items];
});

route('GET', '/connections', function () {
    ensure_trips(service_date());
    $from = (int) ($_GET['from'] ?? 0);
    $to = (int) ($_GET['to'] ?? 0);
    $via = isset($_GET['via']) ? (int) $_GET['via'] : null;
    if (!$from || !$to || $from === $to || ($via && ($via === $from || $via === $to))) {
        fail(422, 'invalid_stations', 'Bitte wähle zwei verschiedene Bahnhöfe.');
    }
    if ($via && !q('SELECT 1 FROM stations WHERE id = ?', [$via])->fetchColumn()) {
        fail(422, 'invalid_stations', 'Der Zwischenstopp wurde nicht gefunden.');
    }
    $after = now_minutes();
    if (preg_match('/^(\d{1,2}):(\d{2})$/', (string) ($_GET['time'] ?? ''), $m)) {
        $after = min(1439, (int) $m[1] * 60 + (int) $m[2]);
    }
    return ['connections' => connections($from, $to, $after, $via ?: null)];
});

// Community-Feed: aktuelle Meldungen aller Züge, ohne Namen der Verfasser.
route('GET', '/community', function () {
    $viewer = current_user(false);
    $me = $viewer ? (int) $viewer['id'] : 0;
    $mine = !empty($_GET['mine']) && $me;
    $sql = 'SELECT r.id, r.type, r.minutes, r.comment, r.status, r.created_at, r.user_id, t.id AS trip_id, t.line, t.headsign,
              (SELECT COUNT(*) FROM report_votes v WHERE v.report_id = r.id AND v.value = 1) AS confirms,
              (SELECT COUNT(*) FROM report_votes v WHERE v.report_id = r.id AND v.value = -1) AS disputes
            FROM reports r JOIN trips t ON t.id = r.trip_id
            WHERE r.created_at >= :since AND r.status NOT IN (\'rejected\',\'removed\')'
        . ($me ? ' AND r.user_id NOT IN (SELECT blocked_id FROM user_blocks WHERE blocker_id = :me)' : '')
        . ($mine ? ' AND r.trip_id IN (SELECT ts.trip_id FROM trip_stops ts JOIN favorites f ON f.user_id = :me
              AND (f.from_station_id = ts.station_id OR f.to_station_id = ts.station_id))' : '')
        . ' ORDER BY r.created_at DESC LIMIT 30';
    $params = ['since' => now() - 4 * 3600] + ($me ? ['me' => $me] : []);
    $items = [];
    foreach (q($sql, $params)->fetchAll() as $r) {
        $items[] = [
            'id' => (int) $r['id'], 'trip_id' => (int) $r['trip_id'], 'line' => $r['line'], 'headsign' => $r['headsign'],
            'type' => $r['type'], 'minutes' => $r['minutes'] !== null ? (int) $r['minutes'] : null, 'comment' => $r['comment'],
            'status' => $r['status'], 'age_sec' => now() - (int) $r['created_at'],
            'confirms' => (int) $r['confirms'], 'disputes' => (int) $r['disputes'],
            'mine' => $me !== 0 && (int) $r['user_id'] === $me,
        ];
    }
    return ['items' => $items];
});

route('POST', '/reports', function () {
    $u = current_user();
    $b = body();
    $uid = (int) $u['id'];
    $trip = get_trip((int) ($b['trip_id'] ?? 0));
    $type = (string) ($b['type'] ?? '');
    if (!in_array($type, REPORT_TYPES, true)) {
        fail(422, 'invalid_type', 'Unbekannte Meldungsart.');
    }
    $minutes = null;
    if ($type === 'delay') {
        $minutes = (int) ($b['minutes'] ?? 0);
        if ($minutes < 1 || $minutes > 600) {
            fail(422, 'invalid_minutes', 'Bitte gib die Verspätung in Minuten an (1 bis 600).');
        }
    }
    $comment = trim((string) ($b['comment'] ?? ''));
    if (mb_strlen($comment) > 280) {
        fail(422, 'invalid_comment', 'Der Kommentar darf höchstens 280 Zeichen haben.');
    }
    rate_limit("report:u$uid", 5, 600, 'Du hast gerade viele Meldungen gesendet. Bitte warte ein paar Minuten.');
    rate_limit("report:u$uid:t{$trip['id']}", 2, 600, 'Für diesen Zug hast du gerade schon gemeldet.');

    $lat = isset($b['lat']) && is_numeric($b['lat']) ? (float) $b['lat'] : null;
    $lon = isset($b['lon']) && is_numeric($b['lon']) ? (float) $b['lon'] : null;
    $locOk = check_location($uid, trip_stops((int) $trip['id']), $lat, $lon);

    q(
        'INSERT INTO reports (trip_id, user_id, type, minutes, comment, location_ok, created_at) VALUES (?,?,?,?,?,?,?)',
        [$trip['id'], $uid, $type, $minutes, $comment !== '' ? $comment : null, (int) $locOk, now()]
    );
    $rid = (int) db()->lastInsertId();
    if ($lat !== null && $lon !== null) {
        q('INSERT INTO report_locations (report_id, user_id, lat, lon, created_at) VALUES (?,?,?,?,?)', [$rid, $uid, $lat, $lon, now()]);
    }
    recompute((int) $trip['id'], $type);
    return ['id' => $rid, 'location_ok' => $locOk, 'reports' => report_rows((int) $trip['id'], $uid)];
});

route('POST', '/reports/(\d+)/vote', function ($id) {
    $u = current_user();
    $uid = (int) $u['id'];
    $b = body();
    $r = q('SELECT * FROM reports WHERE id = ? AND status NOT IN (\'rejected\',\'removed\')', [$id])->fetch();
    if (!$r) {
        fail(404, 'not_found', 'Meldung nicht gefunden.');
    }
    if ((int) $r['user_id'] === $uid) {
        fail(422, 'own_report', 'Die eigene Meldung kannst du nicht bewerten.');
    }
    $value = (int) ($b['value'] ?? 0);
    if (!in_array($value, [1, -1], true)) {
        fail(422, 'invalid_vote', 'Ungültige Bewertung.');
    }
    rate_limit("vote:u$uid", 30, 600);
    $lat = isset($b['lat']) && is_numeric($b['lat']) ? (float) $b['lat'] : null;
    $lon = isset($b['lon']) && is_numeric($b['lon']) ? (float) $b['lon'] : null;
    $locOk = check_location($uid, trip_stops((int) $r['trip_id']), $lat, $lon);
    q(
        'INSERT INTO report_votes (report_id, user_id, value, location_ok, created_at) VALUES (?,?,?,?,?)
         ON CONFLICT(report_id, user_id) DO UPDATE SET value = excluded.value, location_ok = excluded.location_ok',
        [$id, $uid, $value, (int) $locOk, now()]
    );
    recompute((int) $r['trip_id'], $r['type']);
    return ['reports' => report_rows((int) $r['trip_id'], $uid)];
});

route('POST', '/reports/(\d+)/flag', function ($id) {
    $u = current_user();
    if (!q('SELECT 1 FROM reports WHERE id = ?', [$id])->fetchColumn()) {
        fail(404, 'not_found', 'Meldung nicht gefunden.');
    }
    rate_limit('flag:u' . $u['id'], 20, 3600);
    q('INSERT OR IGNORE INTO content_flags (report_id, user_id, reason, created_at) VALUES (?,?,?,?)',
        [$id, $u['id'], mb_substr(trim((string) (body()['reason'] ?? '')), 0, 200), now()]);
    return ['ok' => true];
});

route('POST', '/users/(\d+)/block', function ($id) {
    $u = current_user();
    if ((int) $id === (int) $u['id'] || !q('SELECT 1 FROM users WHERE id = ?', [$id])->fetchColumn()) {
        fail(422, 'invalid_user', 'Dieser Nutzer kann nicht blockiert werden.');
    }
    q('INSERT OR IGNORE INTO user_blocks (blocker_id, blocked_id) VALUES (?,?)', [$u['id'], $id]);
    return ['ok' => true];
});

route('DELETE', '/users/(\d+)/block', function ($id) {
    q('DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?', [current_user()['id'], $id]);
    return ['ok' => true];
});

route('GET', '/blocks', fn() => ['users' => q(
    'SELECT u.id, u.display_name FROM user_blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ?',
    [current_user()['id']]
)->fetchAll()]);

route('GET', '/favorites', function () {
    $rows = q(
        'SELECT f.id, f.kind, f.from_station_id, f.to_station_id, a.name AS from_name, b.name AS to_name
         FROM favorites f JOIN stations a ON a.id = f.from_station_id LEFT JOIN stations b ON b.id = f.to_station_id
         WHERE f.user_id = ? ORDER BY f.id DESC',
        [current_user()['id']]
    )->fetchAll();
    return ['favorites' => $rows];
});

route('POST', '/favorites', function () {
    $u = current_user();
    $b = body();
    $kind = (string) ($b['kind'] ?? '');
    $from = (int) ($b['from_station_id'] ?? 0);
    $to = $kind === 'route' ? (int) ($b['to_station_id'] ?? 0) : null;
    if (!in_array($kind, ['station', 'route'], true) || !q('SELECT 1 FROM stations WHERE id = ?', [$from])->fetchColumn()
        || ($kind === 'route' && (!$to || $to === $from || !q('SELECT 1 FROM stations WHERE id = ?', [$to])->fetchColumn()))) {
        fail(422, 'invalid_favorite', 'Ungültiger Favorit.');
    }
    rate_limit('fav:u' . $u['id'], 60, 3600);
    $exists = q('SELECT 1 FROM favorites WHERE user_id = ? AND kind = ? AND from_station_id = ? AND to_station_id IS ?', [$u['id'], $kind, $from, $to])->fetchColumn();
    if (!$exists) {
        q('INSERT INTO favorites (user_id, kind, from_station_id, to_station_id) VALUES (?,?,?,?)', [$u['id'], $kind, $from, $to]);
    }
    return ['ok' => true];
});

route('DELETE', '/favorites/(\d+)', function ($id) {
    q('DELETE FROM favorites WHERE id = ? AND user_id = ?', [$id, current_user()['id']]);
    return ['ok' => true];
});

route('GET', '/notifications', function () {
    $uid = current_user()['id'];
    $items = q('SELECT id, trip_id, kind, title, body, created_at, read_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 50', [$uid])->fetchAll();
    $unread = 0;
    foreach ($items as &$n) {
        $n['id'] = (int) $n['id'];
        $n['trip_id'] = $n['trip_id'] !== null ? (int) $n['trip_id'] : null;
        $n['read'] = $n['read_at'] !== null;
        $n['age_sec'] = now() - (int) $n['created_at'];
        $unread += $n['read'] ? 0 : 1;
        unset($n['read_at'], $n['created_at']);
    }
    return ['items' => $items, 'unread' => $unread];
});

route('POST', '/notifications/read', function () {
    q('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', [now(), current_user()['id']]);
    return ['ok' => true];
});

route('POST', '/push-token', function () {
    $u = current_user();
    $token = str_field(body(), 'token', 10, 500, 'Token');
    $platform = in_array(body()['platform'] ?? '', ['android', 'ios', 'web'], true) ? body()['platform'] : 'web';
    q('INSERT INTO push_tokens (user_id, token, platform) VALUES (?,?,?) ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id', [$u['id'], $token, $platform]);
    return ['ok' => true];
});

// Premium. Demo mode only. Real money goes through Google Play Billing in the APK (see README).
route('POST', '/premium/activate', function () {
    $u = current_user();
    if (env('PAYMENTS_MODE', 'demo') !== 'demo') {
        fail(501, 'payments_not_configured', 'Zahlungen sind noch nicht eingerichtet.');
    }
    if (!is_premium((int) $u['id'])) {
        q('INSERT INTO subscriptions (user_id, provider, expires_at) VALUES (?, \'demo\', datetime(\'now\', \'+30 days\'))', [$u['id']]);
    }
    return ['user' => user_public($u)];
});

route('POST', '/premium/cancel', function () {
    $u = current_user();
    q('UPDATE subscriptions SET status = \'cancelled\' WHERE user_id = ?', [$u['id']]);
    return ['user' => user_public($u)];
});

// ---------------------------------------------------------------- admin

route('GET', '/admin/reports', function () {
    require_role(['moderator', 'admin']);
    $filter = $_GET['filter'] ?? 'flagged';
    $where = match ($filter) {
        'flagged' => 'WHERE r.id IN (SELECT report_id FROM content_flags) AND r.status NOT IN (\'rejected\',\'removed\')',
        'unconfirmed' => 'WHERE r.status IN (\'unconfirmed\',\'disputed\')',
        default => '',
    };
    $rows = q(
        "SELECT r.id, r.type, r.minutes, r.comment, r.status, r.location_ok, r.created_at, u.id AS user_id, u.display_name, u.trust_score, u.banned,
                t.line, t.headsign, (SELECT COUNT(*) FROM content_flags f WHERE f.report_id = r.id) AS flags,
                (SELECT COUNT(*) FROM report_votes v WHERE v.report_id = r.id AND v.value = 1) AS confirms,
                (SELECT COUNT(*) FROM report_votes v WHERE v.report_id = r.id AND v.value = -1) AS disputes
         FROM reports r JOIN users u ON u.id = r.user_id JOIN trips t ON t.id = r.trip_id $where
         ORDER BY flags DESC, r.created_at DESC LIMIT 100"
    )->fetchAll();
    return ['reports' => $rows];
});

route('POST', '/admin/reports/(\d+)/action', function ($id) {
    $actor = require_role(['moderator', 'admin']);
    $b = body();
    $action = (string) ($b['action'] ?? '');
    $r = q('SELECT * FROM reports WHERE id = ?', [$id])->fetch();
    if (!$r || !in_array($action, ['approve', 'reject', 'remove'], true)) {
        fail(422, 'invalid_action', 'Ungültige Aktion.');
    }
    $status = ['approve' => 'confirmed', 'reject' => 'rejected', 'remove' => 'removed'][$action];
    q('UPDATE reports SET status = ?, locked = 1 WHERE id = ?', [$status, $id]);
    q('DELETE FROM content_flags WHERE report_id = ?', [$id]);
    if ($action !== 'approve') {
        q('UPDATE users SET trust_score = MAX(0.2, trust_score - 0.3) WHERE id = ?', [$r['user_id']]);
    }
    log_action((int) $actor['id'], $action, 'report', (int) $id, mb_substr((string) ($b['note'] ?? ''), 0, 200));
    return ['ok' => true];
});

route('GET', '/admin/users', function () {
    require_role(['moderator', 'admin']);
    $term = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], trim((string) ($_GET['q'] ?? ''))) . '%';
    return ['users' => q(
        'SELECT id, email, display_name, role, trust_score, banned, created_at FROM users
         WHERE email LIKE ? ESCAPE \'\\\' OR display_name LIKE ? ESCAPE \'\\\' ORDER BY id DESC LIMIT 100',
        [$term, $term]
    )->fetchAll()];
});

route('POST', '/admin/users/(\d+)/(ban|unban)', function ($id, $what) {
    $actor = require_role(['moderator', 'admin']);
    $t = q('SELECT * FROM users WHERE id = ?', [$id])->fetch();
    if (!$t || (int) $id === (int) $actor['id']) {
        fail(422, 'invalid_user', 'Diese Aktion ist hier nicht möglich.');
    }
    if ($t['role'] !== 'user' && $actor['role'] !== 'admin') {
        fail(403, 'forbidden', 'Nur Admins dürfen Teammitglieder sperren.');
    }
    q('UPDATE users SET banned = ? WHERE id = ?', [$what === 'ban' ? 1 : 0, $id]);
    if ($what === 'ban') {
        q('DELETE FROM sessions WHERE user_id = ?', [$id]);
    }
    log_action((int) $actor['id'], $what, 'user', (int) $id, mb_substr((string) (body()['note'] ?? ''), 0, 200));
    return ['ok' => true];
});

route('POST', '/admin/users/(\d+)/role', function ($id) {
    $actor = require_role(['admin']);
    $role = (string) (body()['role'] ?? '');
    if (!in_array($role, ['user', 'moderator', 'admin'], true) || (int) $id === (int) $actor['id']) {
        fail(422, 'invalid_role', 'Ungültige Rolle.');
    }
    q('UPDATE users SET role = ? WHERE id = ?', [$role, $id]);
    log_action((int) $actor['id'], 'role:' . $role, 'user', (int) $id);
    return ['ok' => true];
});

route('GET', '/admin/log', function () {
    require_role(['moderator', 'admin']);
    return ['log' => q(
        'SELECT m.id, m.action, m.target_type, m.target_id, m.note, m.created_at, u.display_name AS actor
         FROM moderation_actions m LEFT JOIN users u ON u.id = m.actor_id ORDER BY m.id DESC LIMIT 100'
    )->fetchAll()];
});

route('GET', '/admin/health', function () {
    require_role(['moderator', 'admin']);
    ensure_trips(service_date());
    $c = fn(string $sql) => (int) q($sql)->fetchColumn();
    return [
        'database' => 'ok',
        'data_source' => data_source(),
        'trips_today' => (int) q('SELECT COUNT(*) FROM trips WHERE service_date = ?', [service_date()])->fetchColumn(),
        'users' => $c('SELECT COUNT(*) FROM users'),
        'reports' => $c('SELECT COUNT(*) FROM reports'),
        'open_flags' => $c('SELECT COUNT(DISTINCT report_id) FROM content_flags'),
        'stored_locations' => $c('SELECT COUNT(*) FROM report_locations'),
        'last_cleanup' => (int) (q('SELECT value FROM meta WHERE key = \'last_cleanup\'')->fetchColumn() ?: 0),
    ];
});

// ---------------------------------------------------------------- dispatch

if (PHP_SAPI !== 'cli') {
    cors_and_security_headers();
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
    try {
        maybe_cleanup();
        $path = '/' . trim(preg_replace('#^.*?/api#', '', parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH)), '/');
        $method = $_SERVER['REQUEST_METHOD'];
        foreach ($routes as [$m, $re, $fn]) {
            if ($m === $method && preg_match($re, $path, $mm)) {
                array_shift($mm);
                respond($fn(...$mm));
            }
        }
        fail(404, 'not_found', 'Diese Adresse gibt es nicht.');
    } catch (ApiError $e) {
        respond(['error' => $e->errorCode, 'message' => $e->getMessage()], $e->status);
    } catch (Throwable $e) {
        error_log((string) $e);
        respond(['error' => 'server', 'message' => 'Es ist ein Fehler passiert. Bitte versuche es später noch einmal.'], 500);
    }
}
