<?php
declare(strict_types=1);

// Usage: php db/import_gtfs.php [--dir=PFAD] [--date=YYYY-MM-DD]
// Imports all German stops and the selected day's nationwide timetable.
require __DIR__ . '/../api/bootstrap.php';
require __DIR__ . '/../api/timetable.php';

ini_set('memory_limit', '2G');

$opt = [];
foreach (array_slice($argv, 1) as $arg) {
    if (preg_match('/^--(\w+)=(.*)$/', $arg, $match)) {
        $opt[$match[1]] = $match[2];
    }
}
$defaultBase = (getenv('LOCALAPPDATA') ?: sys_get_temp_dir()) . '/TrainTrust/gtfs';
$dir = $opt['dir'] ?? "$defaultBase/full";
$date = $opt['date'] ?? date('Y-m-d');
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
    fwrite(STDERR, "Ungültiges Datum: $date\n");
    exit(1);
}
foreach (['stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt'] as $required) {
    if (!is_file("$dir/$required")) {
        fwrite(STDERR, "GTFS-Datei fehlt: $dir/$required\n");
        exit(1);
    }
}

function rows(string $file): Generator
{
    $handle = fopen($file, 'r');
    if (!$handle) {
        throw new RuntimeException("Datei kann nicht geöffnet werden: $file");
    }
    try {
        $header = fgetcsv($handle, 0, ',', '"', '');
        if (!$header) {
            throw new RuntimeException("GTFS-Datei ist leer: $file");
        }
        $header[0] = ltrim($header[0], "\xEF\xBB\xBF");
        while (($row = fgetcsv($handle, 0, ',', '"', '')) !== false) {
            if (count($row) === count($header)) {
                yield array_combine($header, $row);
            }
        }
    } finally {
        fclose($handle);
    }
}

function to_min(string $time): ?int
{
    return preg_match('/^(\d+):(\d{2})/', $time, $match) ? (int) $match[1] * 60 + (int) $match[2] : null;
}

function active_services(string $dir, string $date): array
{
    $ymd = str_replace('-', '', $date);
    $weekday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][(int) date('w', strtotime($date))];
    $services = [];
    if (is_file("$dir/calendar.txt")) {
        foreach (rows("$dir/calendar.txt") as $row) {
            if (($row[$weekday] ?? '0') === '1' && $row['start_date'] <= $ymd && $row['end_date'] >= $ymd) {
                $services[$row['service_id']] = true;
            }
        }
    }
    if (is_file("$dir/calendar_dates.txt")) {
        foreach (rows("$dir/calendar_dates.txt") as $row) {
            if ($row['date'] === $ymd) {
                if ($row['exception_type'] === '1') {
                    $services[$row['service_id']] = true;
                } else {
                    unset($services[$row['service_id']]);
                }
            }
        }
    }
    return $services;
}

$services = active_services($dir, $date);
if (!$services) {
    fwrite(STDERR, "Der GTFS-Feed enthält für $date keine aktiven Fahrten. Die Datenbank bleibt unverändert.\n");
    exit(1);
}
$routeNames = [];
foreach (rows("$dir/routes.txt") as $row) {
    $routeNames[$row['route_id']] = trim($row['route_short_name'] ?: $row['route_long_name']);
}

$pdo = db();
$pdo->exec(file_get_contents(__DIR__ . '/schema.sql'));
migrate_db($pdo);
$pdo->beginTransaction();
try {
    $pdo->exec('CREATE TEMP TABLE active_feed_stops (stop_id TEXT PRIMARY KEY, station_id INTEGER NOT NULL, platform TEXT)');
    $pdo->exec('CREATE TEMP TABLE active_feed_trips (trip_id INTEGER PRIMARY KEY, source_trip_id TEXT NOT NULL UNIQUE)');
    $pdo->prepare(
        'DELETE FROM trips
         WHERE service_date = ? AND source_trip_id IS NULL
           AND NOT EXISTS (SELECT 1 FROM reports WHERE reports.trip_id = trips.id)'
    )->execute([$date]);
    $markStop = $pdo->prepare('INSERT INTO active_feed_stops (stop_id, station_id, platform) VALUES (?, ?, ?)');
    $findStop = $pdo->prepare('SELECT id, search_name FROM stations WHERE gtfs_stop_id = ?');
    $findLegacyStop = $pdo->prepare('SELECT id, search_name FROM stations WHERE gtfs_stop_id IS NULL AND name = ? AND lat = ? AND lon = ? LIMIT 1');
    $insertStop = $pdo->prepare('INSERT INTO stations (gtfs_stop_id, name, lat, lon, location_type, search_name) VALUES (?, ?, ?, ?, ?, ?)');
    $updateStop = $pdo->prepare('UPDATE stations SET name = ?, lat = ?, lon = ?, location_type = ?, search_name = ? WHERE id = ?');
    $assignStopId = $pdo->prepare('UPDATE stations SET gtfs_stop_id = ?, name = ?, lat = ?, lon = ?, location_type = ?, search_name = ? WHERE id = ?');
    $deleteTerms = $pdo->prepare('DELETE FROM station_search_terms WHERE station_id = ?');
    $addTerm = $pdo->prepare('INSERT OR IGNORE INTO station_search_terms (station_id, term) VALUES (?, ?)');
    $stopsCount = 0;

    foreach (rows("$dir/stops.txt") as $row) {
        $stopId = (string) $row['stop_id'];
        $name = trim((string) $row['stop_name']);
        if ($stopId === '' || $name === '' || !is_numeric($row['stop_lat']) || !is_numeric($row['stop_lon'])) {
            continue;
        }
        $lat = (float) $row['stop_lat'];
        $lon = (float) $row['stop_lon'];
        if (abs($lat) > 90 || abs($lon) > 180) {
            continue;
        }
        $type = (int) ($row['location_type'] ?? 0);
        $searchName = station_search_key($name);
        $findStop->execute([$stopId]);
        $existing = $findStop->fetch();
        if (!$existing) {
            $findLegacyStop->execute([$name, $lat, $lon]);
            $existing = $findLegacyStop->fetch();
        }
        $previousSearchName = $existing ? (string) $existing['search_name'] : '';
        if ($existing) {
            $stationId = (int) $existing['id'];
            if ($previousSearchName !== $searchName) {
                $deleteTerms->execute([$stationId]);
            }
            if ($previousSearchName === '') {
                $assignStopId->execute([$stopId, $name, $lat, $lon, $type, $searchName, $stationId]);
            } else {
                $updateStop->execute([$name, $lat, $lon, $type, $searchName, $stationId]);
                $pdo->prepare('UPDATE stations SET gtfs_stop_id = ? WHERE id = ? AND gtfs_stop_id IS NULL')->execute([$stopId, $stationId]);
            }
        } else {
            $insertStop->execute([$stopId, $name, $lat, $lon, $type, $searchName]);
            $stationId = (int) $pdo->lastInsertId();
        }
        if ($previousSearchName !== $searchName) {
            foreach (array_unique(explode(' ', $searchName)) as $term) {
                if ($term !== '') {
                    $addTerm->execute([$stationId, $term]);
                }
            }
        }
        $markStop->execute([$stopId, $stationId, trim((string) ($row['platform_code'] ?? '')) ?: null]);
        $stopsCount++;
    }

    $pdo->prepare('DELETE FROM trip_stops WHERE trip_id IN (SELECT id FROM trips WHERE service_date = ? AND source_trip_id IS NOT NULL)')
        ->execute([$date]);
    $insertTrip = $pdo->prepare(
        'INSERT INTO trips (line, headsign, service_date, official_delay_min, cancelled, source_trip_id)
         VALUES (?, ?, ?, 0, 0, ?)
         ON CONFLICT(service_date, source_trip_id) WHERE source_trip_id IS NOT NULL
         DO UPDATE SET line = excluded.line, headsign = excluded.headsign, official_delay_min = 0, cancelled = 0
         RETURNING id'
    );
    $markTrip = $pdo->prepare('INSERT INTO active_feed_trips (trip_id, source_trip_id) VALUES (?, ?)');
    $tripsCount = 0;
    foreach (rows("$dir/trips.txt") as $row) {
        if (!isset($services[$row['service_id']])) {
            continue;
        }
        $sourceId = (string) $row['trip_id'];
        $line = $routeNames[$row['route_id']] ?? 'ÖPNV';
        $headsign = trim((string) ($row['trip_headsign'] ?? '')) ?: $line;
        $insertTrip->execute([$line, $headsign, $date, $sourceId]);
        $tripId = (int) $insertTrip->fetchColumn();
        $insertTrip->closeCursor();
        $markTrip->execute([$tripId, $sourceId]);
        $tripsCount++;
    }

    $insertStopTime = $pdo->prepare(
        'INSERT INTO trip_stops (trip_id, seq, station_id, planned_arr, planned_dep, platform)
         SELECT t.trip_id, ?, s.station_id, ?, ?, s.platform
         FROM active_feed_trips t JOIN active_feed_stops s ON s.stop_id = ?
         WHERE t.source_trip_id = ?'
    );
    $stopTimesCount = 0;
    foreach (rows("$dir/stop_times.txt") as $row) {
        $insertStopTime->execute([
            (int) $row['stop_sequence'],
            to_min((string) ($row['arrival_time'] ?? '')),
            to_min((string) ($row['departure_time'] ?? '')),
            (string) $row['stop_id'],
            (string) $row['trip_id'],
        ]);
        $stopTimesCount += $insertStopTime->rowCount();
        if ($stopTimesCount > 0 && $stopTimesCount % 1000000 === 0) {
            echo "  $stopTimesCount Haltezeiten verarbeitet …\n";
        }
    }

    $pdo->exec(
        'CREATE TEMP TABLE active_trip_bounds AS
         SELECT ts.trip_id, MIN(ts.seq) AS first_seq, MAX(ts.seq) AS last_seq
         FROM trip_stops ts JOIN active_feed_trips a ON a.trip_id = ts.trip_id
         GROUP BY ts.trip_id'
    );
    $pdo->exec('CREATE UNIQUE INDEX idx_active_trip_bounds ON active_trip_bounds(trip_id)');
    $pdo->exec(
        'UPDATE trip_stops SET planned_arr = NULL
         WHERE EXISTS (SELECT 1 FROM active_trip_bounds b WHERE b.trip_id = trip_stops.trip_id AND b.first_seq = trip_stops.seq)'
    );
    $pdo->exec(
        'UPDATE trip_stops SET planned_dep = NULL
         WHERE EXISTS (SELECT 1 FROM active_trip_bounds b WHERE b.trip_id = trip_stops.trip_id AND b.last_seq = trip_stops.seq)'
    );
    $pdo->exec(
        'DELETE FROM trips
         WHERE service_date = ' . $pdo->quote($date) . ' AND source_trip_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM active_feed_trips a WHERE a.source_trip_id = trips.source_trip_id)'
    );
    $cutoffDate = date('Y-m-d', strtotime($date . ' -2 days'));
    $pdo->prepare(
        'DELETE FROM trips
         WHERE service_date < ?
           AND NOT EXISTS (SELECT 1 FROM reports WHERE reports.trip_id = trips.id)'
    )->execute([$cutoffDate]);
    $pdo->exec(
        'DELETE FROM stations
         WHERE gtfs_stop_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM active_feed_stops a WHERE a.stop_id = stations.gtfs_stop_id)
           AND NOT EXISTS (SELECT 1 FROM trip_stops ts WHERE ts.station_id = stations.id)
           AND NOT EXISTS (SELECT 1 FROM favorites f WHERE f.from_station_id = stations.id OR f.to_station_id = stations.id)'
    );
    q('INSERT OR REPLACE INTO meta (key, value) VALUES (\'data_source\', \'gtfs\')');
    $pdo->commit();
    echo "  Deutschland gesamt: $stopsCount Haltestellen, $tripsCount Fahrten, $stopTimesCount Haltezeiten für $date importiert.\n";
} catch (Throwable $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    throw $error;
}
