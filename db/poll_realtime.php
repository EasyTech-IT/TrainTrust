<?php
declare(strict_types=1);

// Aktualisiert die Echtzeitdaten aller Favoriten-Bahnhöfe und legt Hinweise an.
// Alle 2 Minuten per Aufgabenplanung/Cron ausführen: php db/poll_realtime.php
require __DIR__ . '/../api/bootstrap.php';
require __DIR__ . '/../api/timetable.php';
require __DIR__ . '/../api/realtime.php';

if (!realtime_enabled()) {
    fwrite(STDERR, "Keine DB_TIMETABLES_*-Schlüssel in .env.\n");
    exit(1);
}
$stations = q(
    'SELECT DISTINCT s.id, s.name FROM stations s JOIN favorites f ON f.from_station_id = s.id'
)->fetchAll();
$before = (int) q('SELECT COUNT(*) FROM notifications')->fetchColumn();
foreach ($stations as $s) {
    refresh_realtime((int) $s['id'], $s['name'], service_date());
}
$new = (int) q('SELECT COUNT(*) FROM notifications')->fetchColumn() - $before;
echo count($stations) . " Bahnhöfe aktualisiert, $new neue Hinweise.\n";
