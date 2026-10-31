<?php
declare(strict_types=1);

// Usage: php tests/run.php   (unit tests + end-to-end API smoke test on a temporary database)
require __DIR__ . '/../api/trust.php';
date_default_timezone_set('Europe/Berlin');

$failures = 0;
function check(string $name, bool $ok): void
{
    global $failures;
    echo ($ok ? '  OK   ' : '  FAIL ') . $name . "\n";
    if (!$ok) {
        $failures++;
    }
}

echo "Unit tests: Vertrauensregeln\n";
$stops = [['lat' => 50.1071, 'lon' => 8.6638], ['lat' => 49.8725, 'lon' => 8.6305]];
check('Position auf der Strecke ist plausibel', location_plausible(50.0, 8.65, $stops, null, 1000));
check('Position weit weg wird abgelehnt', !location_plausible(48.1, 11.5, $stops, null, 1000));
check('Unmögliche Geschwindigkeit wird abgelehnt', !location_plausible(50.0, 8.65, $stops, ['lat' => 52.5, 'lon' => 13.4, 't' => 940], 1000));

$base = ['created_at' => 1000, 'user_id' => 1, 'locked' => 0, 'status' => 'unconfirmed'];
$sup = fn(int $uid, int $t, int $loc = 1) => ['user_id' => $uid, 'created_at' => $t, 'location_ok' => $loc, 'trust' => 1.0];
check('Einzelne Meldung bleibt unbestätigt', evaluate_report($base, true, 1.0, [], []) === 'unconfirmed');
check('3 unabhängige Fahrgäste bestätigen', evaluate_report($base, true, 1.0, [$sup(2, 1100), $sup(3, 1200)], []) === 'confirmed');
check('Zu späte Bestätigung zählt nicht', evaluate_report($base, true, 1.0, [$sup(2, 1100), $sup(3, 1500)], []) === 'unconfirmed');
check('Bestätigung ohne Standort zählt nicht', evaluate_report($base, true, 1.0, [$sup(2, 1100), $sup(3, 1200, 0)], []) === 'unconfirmed');
check('Gleicher Nutzer zählt nur einmal', evaluate_report($base, true, 1.0, [$sup(2, 1100), $sup(2, 1150)], []) === 'unconfirmed');
check('Wenig Vertrauen zählt weniger', evaluate_report($base, true, 0.2, [['user_id' => 2, 'created_at' => 1100, 'location_ok' => 1, 'trust' => 0.2], $sup(3, 1200)], []) === 'unconfirmed');
check('Widerspruch von 2 Fahrgästen', evaluate_report($base, true, 1.0, [], [['user_id' => 2, 'created_at' => 1100, 'trust' => 1.0], ['user_id' => 3, 'created_at' => 1100, 'trust' => 1.0]]) === 'disputed');

echo "\nEnd-to-End: API auf temporärer Datenbank\n";
$port = 8099;
$tmp = sys_get_temp_dir() . '/tt_test_' . bin2hex(random_bytes(4));
mkdir($tmp);
$env = ['DB_PATH' => "$tmp/test.sqlite", 'DEV_SKIP_LOCATION' => '1', 'ADMIN_EMAIL' => 'admin@test.local', 'ADMIN_PASSWORD' => 'AdminPass-123', 'PAYMENTS_MODE' => 'demo', 'ALLOWED_ORIGINS' => ''] + getenv();
$root = realpath(__DIR__ . '/..');
$init = proc_open([PHP_BINARY, "$root/db/init.php"], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $p, $root, $env);
stream_get_contents($p[1]);
proc_close($init);
$srv = proc_open([PHP_BINARY, '-S', "127.0.0.1:$port", '-t', "$root/public", "$root/router.php"], [1 => ['file', "$tmp/out.log", 'w'], 2 => ['file', "$tmp/err.log", 'w']], $sp, $root, $env);
for ($i = 0; $i < 30; $i++) {
    if (@fsockopen('127.0.0.1', $port)) {
        break;
    }
    usleep(200000);
}

function call(string $m, string $path, ?array $body = null, ?string $token = null): array
{
    global $port;
    $h = "Content-Type: application/json\r\n" . ($token ? "Authorization: Bearer $token\r\n" : '');
    $ctx = stream_context_create(['http' => ['method' => $m, 'header' => $h, 'content' => $body !== null ? json_encode($body) : '', 'ignore_errors' => true]]);
    $raw = file_get_contents("http://127.0.0.1:$port/api$path", false, $ctx);
    preg_match('#HTTP/\S+ (\d+)#', $http_response_header[0], $mm);
    return [(int) $mm[1], json_decode($raw, true) ?? []];
}

try {
    [$s, $r] = call('GET', '/stations?q=Mainz');
    check('Bahnhofssuche findet Mainz', $s === 200 && count($r['stations']) === 1);
    $mainz = $r['stations'][0]['id'];
    [$s, $r] = call('GET', "/stations/$mainz/departures");
    check('Abfahrtstafel liefert Daten', $s === 200 && is_array($r['items']));
    $users = [];
    foreach ([1, 2, 3, 4] as $n) {
        [$s, $r] = call('POST', '/auth/register', ['email' => "u$n@test.local", 'display_name' => "Fahrgast $n", 'password' => 'Passwort123', 'accept_terms' => true]);
        $users[$n] = $r['token'] ?? '';
        check("Registrierung $n", $s === 200 && $users[$n] !== '');
    }
    [$s] = call('POST', '/auth/register', ['email' => 'u1@test.local', 'display_name' => 'Doppelt', 'password' => 'Passwort123', 'accept_terms' => true]);
    check('Doppelte E-Mail wird abgelehnt', $s === 409);
    [$s] = call('POST', '/auth/login', ['email' => 'u1@test.local', 'password' => 'falsch']);
    check('Falsches Passwort wird abgelehnt', $s === 401);

    $trip = null;
    for ($id = 1; $id < 300 && !$trip; $id++) {
        [$s, $r] = call('GET', "/trips/$id");
        if ($s === 200 && !$r['trip']['cancelled']) {
            $trip = $id;
        }
    }
    check('Zugdetail lädt', $trip !== null);
    [$s] = call('POST', '/reports', ['trip_id' => $trip, 'type' => 'delay', 'minutes' => 5, 'lat' => 50.0, 'lon' => 8.6]);
    check('Meldung ohne Login wird abgelehnt', $s === 401);
    [$s, $r] = call('POST', '/reports', ['trip_id' => $trip, 'type' => 'delay', 'minutes' => 5, 'lat' => 50.0, 'lon' => 8.6], $users[1]);
    check('Meldung wird angelegt (unbestätigt)', $s === 200 && $r['reports'][0]['status'] === 'unconfirmed');
    $rid = $r['id'];
    [$s] = call('POST', "/reports/$rid/vote", ['value' => 1], $users[1]);
    check('Eigene Meldung kann nicht bestätigt werden', $s === 422);
    call('POST', "/reports/$rid/vote", ['value' => 1, 'lat' => 50.0, 'lon' => 8.6], $users[2]);
    [$s, $r] = call('POST', "/reports/$rid/vote", ['value' => 1, 'lat' => 50.0, 'lon' => 8.6], $users[3]);
    check('3 Fahrgäste bestätigen die Meldung', $s === 200 && $r['reports'][0]['status'] === 'confirmed');
    [$s, $r] = call('POST', '/reports', ['trip_id' => $trip, 'type' => 'crowded'], $users[1]);
    check('Zweite Meldung erlaubt', $s === 200);
    [$s] = call('POST', '/reports', ['trip_id' => $trip, 'type' => 'crowded'], $users[1]);
    [$s2] = call('POST', '/reports', ['trip_id' => $trip, 'type' => 'toilet'], $users[1]);
    check('Rate-Limit pro Zug greift', $s === 429 || $s2 === 429);

    [$s, $r] = call('POST', '/reports', ['trip_id' => $trip, 'type' => 'other', 'comment' => str_repeat('x', 281)], $users[4]);
    check('Zu langer Kommentar wird abgelehnt', $s === 422);
    call('POST', "/reports/$rid/flag", ['reason' => 'Test'], $users[4]);
    [$s] = call('GET', '/admin/reports', null, $users[4]);
    check('Normale Nutzer haben keinen Admin-Zugriff', $s === 403);
    [$s, $r] = call('POST', '/auth/login', ['email' => 'admin@test.local', 'password' => 'AdminPass-123']);
    $admin = $r['token'] ?? '';
    [$s, $r] = call('GET', '/admin/reports?filter=flagged', null, $admin);
    check('Admin sieht gemeldete Beiträge', $s === 200 && count($r['reports']) === 1);
    [$s] = call('POST', "/admin/reports/$rid/action", ['action' => 'remove', 'note' => 'Test'], $admin);
    [$s2, $r] = call('GET', '/admin/log', null, $admin);
    check('Moderation wird protokolliert', $s === 200 && $s2 === 200 && count($r['log']) >= 1);

    [$s, $r] = call('GET', '/connections?from=' . $mainz . '&to=' . call('GET', '/stations?q=Mannheim')[1]['stations'][0]['id'] . '&time=05:00');
    check('Verbindungssuche liefert Ergebnisse', $s === 200 && count($r['connections']) > 0);
    $frankfurt = call('GET', '/stations?q=Frankfurt')[1]['stations'][0]['id'];
    $darmstadt = call('GET', '/stations?q=Darmstadt')[1]['stations'][0]['id'];
    $mannheim = call('GET', '/stations?q=Mannheim')[1]['stations'][0]['id'];
    [$s, $r] = call('GET', "/connections?from=$frankfurt&to=$mannheim&via=$darmstadt&time=05:00");
    check('Verbindungssuche berücksichtigt Zwischenstopp', $s === 200 && count($r['connections']) > 0);
    [$s, $r] = call('GET', "/connections?from=$frankfurt&to=$mannheim&via=$mainz&time=05:00");
    check('Zwischenstopp am Umstieg wird berücksichtigt', $s === 200 && count($r['connections']) > 0 && max(array_column($r['connections'], 'transfers')) > 0);
    $worms = call('GET', '/stations?q=Worms')[1]['stations'][0]['id'];
    [$s, $r] = call('GET', "/connections?from=$frankfurt&to=$mannheim&via=$worms&time=05:00");
    check('Zwischenstopp im zweiten Abschnitt wird berücksichtigt', $s === 200 && count($r['connections']) > 0 && max(array_column($r['connections'], 'transfers')) > 0);
    $aschaffenburg = call('GET', '/stations?q=Aschaffenburg')[1]['stations'][0]['id'];
    [$s, $r] = call('GET', "/connections?from=$frankfurt&to=$mannheim&via=$aschaffenburg&time=05:00");
    check('Zwischenstopp ohne passende Verbindung liefert keine Treffer', $s === 200 && $r['connections'] === []);
    [$s] = call('GET', "/connections?from=$frankfurt&to=$mannheim&via=$frankfurt");
    check('Start kann nicht zugleich Zwischenstopp sein', $s === 422);
    [$s] = call('GET', '/notifications');
    check('Hinweise brauchen Login', $s === 401);
    [$s, $r] = call('GET', '/notifications', null, $users[1]);
    check('Hinweise-Liste lädt', $s === 200 && is_array($r['items']) && $r['unread'] === 0);
    [$s] = call('POST', '/notifications/read', [], $users[1]);
    check('Hinweise als gelesen markieren', $s === 200);
    [$s, $r] = call('GET', "/trips/$trip?fast=1");
    check('Zugdetail hat Verspätung je Halt', $s === 200 && array_key_exists('delay', $r['stops'][0] ?? ['delay' => 0]));
    [$s, $r] = call('GET', '/community');
    $mineItem = array_values(array_filter($r['items'] ?? [], fn ($i) => $i['id'] === $rid));
    check('Community-Feed ist öffentlich und anonym', $s === 200 && count($r['items']) >= 1 && !isset($r['items'][0]['author']) && !isset($r['items'][0]['user_id']));
    [$s, $r] = call('GET', '/community?mine=1', null, $users[1]);
    check('Community-Filter „Favoriten“ funktioniert', $s === 200 && is_array($r['items']));
    [$s, $r] = call('GET', "/trips/$trip?fast=1");
    check('Verfasser im Zugdetail anonym', $s === 200 && array_reduce($r['reports'], fn ($c, $x) => $c && $x['author'] === 'Anonym', true));
    $ms = call('GET', "/stations?id=$mainz")[1]['stations'][0];
    [$s, $r] = call('GET', '/stations?lat=' . $ms['lat'] . '&lon=' . $ms['lon']);
    check('Bahnhöfe in der Nähe (nach Entfernung)', $s === 200 && count($r['stations']) >= 1 && isset($r['stations'][0]['distance_m']) && $r['stations'][0]['id'] === $mainz);
    [$s] = call('GET', '/stations?lat=500&lon=8');
    check('Ungültiger Standort wird abgelehnt', $s === 422);
    [$s, $r] = call('GET', '/stations?q=MAINZ');
    check('Suche findet Bahnhof (Großbuchstaben egal)', $s === 200 && ($r['stations'][0]['id'] ?? 0) === $mainz);
    [$s, $r] = call('GET', '/stations?q=');
    check('Ohne Suchbegriff kommen die beliebtesten Bahnhöfe', $s === 200 && count($r['stations']) >= 1);
    [$s, $r] = call('GET', '/stations?q=' . rawurlencode('zzzqqq'));
    check('Unbekannter Bahnhof liefert leere Liste', $s === 200 && $r['stations'] === []);
    [$s, $r] = call('GET', '/stations?bbox=' . ($ms['lat'] - 0.2) . ',' . ($ms['lon'] - 0.2) . ',' . ($ms['lat'] + 0.2) . ',' . ($ms['lon'] + 0.2));
    check('Kartenausschnitt liefert Bahnhöfe ohne Kürzung', $s === 200 && count($r['stations']) >= 1 && $r['truncated'] === false);
    [$s] = call('GET', '/stations?bbox=1,2,0,1');
    check('Ungültiger Kartenausschnitt wird abgelehnt', $s === 422);
    [$s] = call('POST', "/trips/$trip/wagons", ['wagons' => 6]);
    check('Wagenzahl melden braucht Login', $s === 401);
    [$s] = call('POST', "/trips/$trip/wagons", ['wagons' => 99, 'lat' => $ms['lat'], 'lon' => $ms['lon']], $users[1]);
    check('Unsinnige Wagenzahl wird abgelehnt', $s === 422);
    [$s] = call('POST', "/trips/$trip/wagons", ['wagons' => 6], $users[1]);
    check('Wagenzahl ohne Standort wird abgelehnt', $s === 403);
    [$s, $r] = call('POST', "/trips/$trip/wagons", ['wagons' => 6, 'lat' => $ms['lat'], 'lon' => $ms['lon']], $users[1]);
    check('Wagenzahl wird gespeichert', $s === 200 && $r['wagons']['count'] === 6);
    [$s, $r] = call('GET', "/trips/$trip?fast=1");
    check('Zugdetail zeigt Wagenzahl der Community', $s === 200 && $r['wagons']['count'] === 6 && $r['wagons']['votes'] === 1);
    [$s, $r] = call('GET', '/disruptions');
    check('Einschränkungen laden', $s === 200 && is_array($r['items']));
    [$s, $r] = call('POST', '/premium/activate', [], $users[2]);
    check('Premium (Demo) aktivierbar', $s === 200 && $r['user']['premium'] === true);
    $demoStart = call('GET', '/stations?q=' . rawurlencode('Frankfurt (Main) Hbf'))[1]['stations'][0]['id'] ?? 0;
    $demoEnd = call('GET', '/stations?q=' . rawurlencode('Darmstadt Hbf'))[1]['stations'][0]['id'] ?? 0;

    $fixture = "$tmp/gtfs";
    mkdir($fixture);
    $today = date('Y-m-d');
    $gtfsFiles = [
        'stops.txt' => "stop_id,stop_name,stop_lat,stop_lon,location_type,platform_code,parent_station\nfeed-start-parent,Feed Test Start,50.1,8.6,1,,\nfeed-start,Feed Test Start,50.1,8.6,0,1,feed-start-parent\nfeed-via,Feed Test Via,50.2,8.7,0,2,\nfeed-end,Feed Test End,50.3,8.8,0,3,\n",
        'routes.txt' => "route_id,route_short_name,route_long_name\nfeed-route-1,F 1,Testlinie 1\nfeed-route-2,F 2,Testlinie 2\n",
        'trips.txt' => "route_id,service_id,trip_id,trip_headsign\nfeed-route-1,feed-service,feed-trip-1,Feed Test End\nfeed-route-2,feed-service,feed-trip-2,Feed Test Via\nfeed-route-2,feed-service,feed-trip-3,Feed Test End\n",
        'calendar_dates.txt' => "service_id,date,exception_type\nfeed-service," . str_replace('-', '', $today) . ",1\n",
        'stop_times.txt' => "trip_id,arrival_time,departure_time,stop_id,stop_sequence\nfeed-trip-1,,08:00:00,feed-start,1\nfeed-trip-1,08:45:00,,feed-end,2\nfeed-trip-2,,09:00:00,feed-start,1\nfeed-trip-2,09:25:00,09:26:00,feed-via,2\nfeed-trip-3,,09:35:00,feed-via,1\nfeed-trip-3,10:00:00,,feed-end,2\n",
    ];
    foreach ($gtfsFiles as $name => $contents) {
        file_put_contents("$fixture/$name", $contents);
    }
    $import = proc_open(
        [PHP_BINARY, "$root/db/import_gtfs.php", "--dir=$fixture", "--date=$today"],
        [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
        $ip,
        $root,
        $env
    );
    $importOut = stream_get_contents($ip[1]) . stream_get_contents($ip[2]);
    $importStatus = proc_close($import);
    if ($importStatus !== 0) {
        echo "  GTFS-Import-Ausgabe: " . trim($importOut) . "\n";
    }
    check('GTFS-Import verarbeitet Feed-Dateien', $importStatus === 0 && str_contains($importOut, '4 Haltestellen'));
    [$s, $r] = call('GET', '/stations?q=' . rawurlencode('Feed Test Start'));
    $feedStart = $r['stations'][0]['id'] ?? 0;
    check('GTFS-Suche blendet nicht fahrplanfähige Bahnhofs-Eltern aus', $s === 200 && count($r['stations']) === 1);
    [$s, $r] = call('GET', '/stations?bbox=50.099,8.599,50.101,8.601');
    check('Karte zeigt nur fahrplanfähige Haltepunkte', $s === 200 && count($r['stations']) === 1 && $r['stations'][0]['id'] === $feedStart);
    $feedVia = call('GET', '/stations?q=' . rawurlencode('Feed Test Via'))[1]['stations'][0]['id'] ?? 0;
    $feedEnd = call('GET', '/stations?q=' . rawurlencode('Feed Test End'))[1]['stations'][0]['id'] ?? 0;
    [$s, $r] = call('GET', "/connections?from=$feedStart&to=$feedEnd&time=06:00");
    if ($s !== 200 || count($r['connections'] ?? []) === 0) {
        echo "  GTFS-Verbindungsausgabe: " . json_encode([$feedStart, $feedVia, $feedEnd, $s, $r]) . "\n";
    }
    check('GTFS-Fahrten sind durchsuchbar', $s === 200 && count($r['connections'] ?? []) > 0);
    [$s, $r] = call('GET', "/connections?from=$feedStart&to=$feedEnd&via=$feedVia&time=06:00");
    check('GTFS-Zwischenstopp wird berücksichtigt', $s === 200 && count($r['connections'] ?? []) > 0);
    [$s, $r] = call('GET', "/trips/$trip?fast=1");
    check('Vorhandene Community-Meldungen bleiben erhalten', $s === 200 && (int) $r['trip']['id'] === $trip);
    [$s, $r] = call('GET', "/connections?from=$demoStart&to=$demoEnd&time=06:00");
    check('Demo-Fahrten werden im GTFS-Modus ausgeblendet', $s === 200 && ($r['connections'] ?? []) === []);

    [$s] = call('POST', '/me/delete', ['password' => 'falsch'], $users[2]);
    check('Konto löschen braucht richtiges Passwort', $s === 403);
    [$s] = call('POST', '/me/delete', ['password' => 'Passwort123'], $users[2]);
    [$s2] = call('GET', '/me', null, $users[2]);
    check('Konto wird gelöscht', $s === 200 && $s2 === 401);
} finally {
    proc_terminate($srv);
    proc_close($srv);
    usleep(300000);
    foreach (glob("$tmp/*") ?: [] as $f) {
        if (is_file($f)) {
            @unlink($f);
        } elseif (is_dir($f)) {
            foreach (glob("$f/*") ?: [] as $nested) {
                @unlink($nested);
            }
            @rmdir($f);
        }
    }
    @rmdir($tmp);
}

echo $failures === 0 ? "\nAlle Tests bestanden.\n" : "\n$failures Test(s) fehlgeschlagen.\n";
exit($failures === 0 ? 0 : 1);
