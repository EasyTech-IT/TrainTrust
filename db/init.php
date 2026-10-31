<?php
declare(strict_types=1);

// Usage: php db/init.php [--reset]
require __DIR__ . '/../api/bootstrap.php';
require __DIR__ . '/../api/timetable.php';

$path = env('DB_PATH') ?: ROOT . '/db/train_trust.sqlite';
if (in_array('--reset', $argv ?? [], true)) {
    foreach ([$path, $path . '-wal', $path . '-shm'] as $f) {
        if (is_file($f)) {
            unlink($f);
        }
    }
    echo "Datenbank zurückgesetzt.\n";
}

db()->exec(file_get_contents(__DIR__ . '/schema.sql'));
seed_stations();
ensure_trips(service_date());

$email = strtolower(env('ADMIN_EMAIL', 'admin@traintrust.local'));
if (!q('SELECT 1 FROM users WHERE email = ?', [$email])->fetchColumn()) {
    $pw = env('ADMIN_PASSWORD') ?: bin2hex(random_bytes(6));
    q('INSERT INTO users (email, display_name, password_hash, role) VALUES (?,?,?,\'admin\')', [$email, 'Admin', password_hash($pw, PASSWORD_DEFAULT)]);
    echo "Admin angelegt: $email / $pw\n";
    echo "(Passwort jetzt notieren oder in .env als ADMIN_PASSWORD setzen und --reset ausführen.)\n";
}

echo "Datenbank bereit: $path\n";
echo 'Fahrten heute: ' . q('SELECT COUNT(*) FROM trips WHERE service_date = ?', [service_date()])->fetchColumn() . "\n";
