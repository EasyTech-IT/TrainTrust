<?php
declare(strict_types=1);

// Demo timetable for the launch region Rhein-Main / Rhein-Neckar.
// Replace with a GTFS import (see README) once real data access is clarified.

function demo_stations(): array
{
    return [
        'Frankfurt (Main) Hbf' => [50.1071, 8.6638],
        'Darmstadt Hbf' => [49.8725, 8.6305],
        'Heidelberg Hbf' => [49.4036, 8.6757],
        'Mannheim Hbf' => [49.4793, 8.4686],
        'Mainz Hbf' => [50.0012, 8.2589],
        'Wiesbaden Hbf' => [50.0709, 8.2431],
        'Hanau Hbf' => [50.1206, 8.9294],
        'Aschaffenburg Hbf' => [49.9807, 9.1427],
        'Worms Hbf' => [49.6341, 8.3569],
    ];
}

// [line, [station => minutes after start], interval minutes]
function demo_lines(): array
{
    return [
        ['RE 1', ['Frankfurt (Main) Hbf' => 0, 'Darmstadt Hbf' => 18, 'Heidelberg Hbf' => 45, 'Mannheim Hbf' => 57], 30],
        ['RE 2', ['Frankfurt (Main) Hbf' => 0, 'Mainz Hbf' => 25, 'Wiesbaden Hbf' => 40], 30],
        ['RE 3', ['Frankfurt (Main) Hbf' => 0, 'Hanau Hbf' => 15, 'Aschaffenburg Hbf' => 35], 60],
        ['RB 4', ['Mainz Hbf' => 0, 'Worms Hbf' => 30, 'Mannheim Hbf' => 50, 'Heidelberg Hbf' => 62], 60],
    ];
}

function seed_stations(): void
{
    foreach (demo_stations() as $name => [$lat, $lon]) {
        $stationId = q('SELECT id FROM stations WHERE name = ? AND lat = ? AND lon = ? LIMIT 1', [$name, $lat, $lon])->fetchColumn();
        if (!$stationId) {
            q('INSERT INTO stations (name, lat, lon, search_name) VALUES (?,?,?,?)', [$name, $lat, $lon, station_search_key($name)]);
            $stationId = (int) db()->lastInsertId();
        }
        foreach (array_unique(explode(' ', station_search_key($name))) as $term) {
            if ($term !== '') {
                q('INSERT OR IGNORE INTO station_search_terms (station_id, term) VALUES (?,?)', [$stationId, $term]);
            }
        }
    }
}

function service_date(?int $ts = null): string
{
    return date('Y-m-d', $ts ?? now());
}

function data_source(): string
{
    return (string) (q('SELECT value FROM meta WHERE key = \'data_source\'')->fetchColumn() ?: env('DATA_SOURCE', 'demo'));
}

function ensure_trips(string $date): void
{
    $has = q('SELECT 1 FROM trips WHERE service_date = ? LIMIT 1', [$date])->fetchColumn();
    if ($has || data_source() === 'gtfs') {
        return;
    }
    seed_stations();
    $ids = q('SELECT name, id FROM stations')->fetchAll(PDO::FETCH_KEY_PAIR);
    $pdo = db();
    $pdo->beginTransaction();
    try {
        foreach (demo_lines() as $li => [$line, $stops, $interval]) {
            foreach ([false, true] as $reverse) {
                $names = array_keys($stops);
                $offs = array_values($stops);
                $total = end($offs);
                if ($reverse) {
                    $names = array_reverse($names);
                    $offs = array_map(fn($o) => $total - $o, array_reverse($offs));
                }
                $head = end($names);
                $n = 0;
                for ($start = 5 * 60 + ($reverse ? 10 : 0); $start < 23 * 60; $start += $interval) {
                    $h = crc32("$date|$line|$reverse|$start") % 100;
                    $delay = $h < 70 ? 0 : ($h < 80 ? 3 : ($h < 90 ? 7 : 12));
                    $cancel = $h === 99 ? 1 : 0;
                    q(
                        'INSERT INTO trips (line, headsign, service_date, official_delay_min, cancelled) VALUES (?,?,?,?,?)',
                        [$line, $head, $date, $cancel ? 0 : $delay, $cancel]
                    );
                    $tripId = (int) $pdo->lastInsertId();
                    foreach ($names as $i => $name) {
                        $t = $start + $offs[$i];
                        $first = $i === 0;
                        $last = $i === count($names) - 1;
                        q(
                            'INSERT INTO trip_stops (trip_id, seq, station_id, planned_arr, planned_dep, platform) VALUES (?,?,?,?,?,?)',
                            [$tripId, $i, $ids[$name], $first ? null : $t - 1, $last ? null : $t, (string) (1 + (crc32($name . $line . $reverse) % 9))]
                        );
                    }
                    $n++;
                }
            }
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    // keep the database small: drop old demo days (cascades to their reports)
    q('DELETE FROM trips WHERE service_date < ?', [date('Y-m-d', strtotime($date . ' -2 days'))]);
}

function fmt_min(?int $m): ?string
{
    if ($m === null) {
        return null;
    }
    $m = ($m % 1440 + 1440) % 1440;
    return sprintf('%02d:%02d', intdiv($m, 60), $m % 60);
}

function now_minutes(): int
{
    return (int) date('G') * 60 + (int) date('i');
}
