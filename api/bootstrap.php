<?php
declare(strict_types=1);

date_default_timezone_set('Europe/Berlin');

const ROOT = __DIR__ . '/..';

function env(string $key, ?string $default = null): ?string
{
    static $vars = null;
    if ($vars === null) {
        $vars = [];
        $file = ROOT . '/.env';
        if (is_file($file)) {
            foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                $line = trim($line);
                if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
                    continue;
                }
                [$k, $v] = explode('=', $line, 2);
                $vars[trim($k)] = trim($v, " \t\"'");
            }
        }
    }
    $fromEnv = getenv($key);
    return $fromEnv !== false ? $fromEnv : ($vars[$key] ?? $default);
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $path = env('DB_PATH') ?: ROOT . '/db/train_trust.sqlite';
        $dir = dirname($path);
        if (!is_dir($dir)) {
            mkdir($dir, 0777, true);
        }
        $pdo = new PDO('sqlite:' . $path, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $pdo->exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
        $pdo->exec('PRAGMA journal_mode = WAL;');
        migrate_db($pdo);
    }
    return $pdo;
}

function station_search_key(string $name): string
{
    $name = mb_strtolower($name);
    $name = strtr($name, ['ä' => 'a', 'ö' => 'o', 'ü' => 'u', 'ß' => 'ss', 'é' => 'e', 'è' => 'e']);
    $name = preg_replace('/hauptbahnhof/', 'hbf', $name) ?? $name;
    return trim(preg_replace('/[^a-z0-9]+/', ' ', $name) ?? $name);
}

// Ergänzt ältere Datenbanken um neue Spalten und Tabellen.
function migrate_db(?PDO $pdo = null): void
{
    static $done = false;
    $pdo ??= db();
    if ($done) {
        return;
    }
    $cols = array_column($pdo->query('PRAGMA table_info(trip_stops)')->fetchAll(), 'name');
    if ($cols && !in_array('delay_min', $cols, true)) {
        $pdo->exec('ALTER TABLE trip_stops ADD COLUMN delay_min INTEGER');
    }
    $stationCols = array_column($pdo->query('PRAGMA table_info(stations)')->fetchAll(), 'name');
    if (!$stationCols) {
        return;
    }
    if ($stationCols && !in_array('gtfs_stop_id', $stationCols, true)) {
        $pdo->exec('PRAGMA foreign_keys = OFF');
        try {
            $pdo->exec(
                'CREATE TABLE stations_rebuild (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  gtfs_stop_id TEXT UNIQUE,
                  name TEXT NOT NULL,
                  lat REAL NOT NULL,
                  lon REAL NOT NULL,
                  location_type INTEGER NOT NULL DEFAULT 0,
                  search_name TEXT NOT NULL DEFAULT \'\'
                );
                INSERT INTO stations_rebuild (id, name, lat, lon) SELECT id, name, lat, lon FROM stations;
                DROP TABLE stations;
                ALTER TABLE stations_rebuild RENAME TO stations'
            );
        } finally {
            $pdo->exec('PRAGMA foreign_keys = ON');
        }
    }
    $stationCols = array_column($pdo->query('PRAGMA table_info(stations)')->fetchAll(), 'name');
    if ($stationCols && !in_array('search_name', $stationCols, true)) {
        $pdo->exec('ALTER TABLE stations ADD COLUMN search_name TEXT NOT NULL DEFAULT \'\'');
    }
    if ($stationCols && !in_array('location_type', $stationCols, true)) {
        $pdo->exec('ALTER TABLE stations ADD COLUMN location_type INTEGER NOT NULL DEFAULT 0');
    }
    $tripCols = array_column($pdo->query('PRAGMA table_info(trips)')->fetchAll(), 'name');
    if ($tripCols && !in_array('source_trip_id', $tripCols, true)) {
        $pdo->exec('ALTER TABLE trips ADD COLUMN source_trip_id TEXT');
    }
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS station_search_terms (
          station_id INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
          term TEXT NOT NULL,
          PRIMARY KEY (station_id, term)
        );
        CREATE INDEX IF NOT EXISTS idx_station_search_term ON station_search_terms(term, station_id);
        CREATE INDEX IF NOT EXISTS idx_stations_lat_lon ON stations(lat, lon);
        CREATE INDEX IF NOT EXISTS idx_stations_search_name ON stations(search_name);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_trips_source ON trips(service_date, source_trip_id) WHERE source_trip_id IS NOT NULL'
    );
    $stationCols = array_column($pdo->query('PRAGMA table_info(stations)')->fetchAll(), 'name');
    if ($stationCols && in_array('search_name', $stationCols, true)) {
        $updateName = $pdo->prepare('UPDATE stations SET search_name = ? WHERE id = ?');
        $addTerm = $pdo->prepare('INSERT OR IGNORE INTO station_search_terms (station_id, term) VALUES (?, ?)');
        $pending = $pdo->query('SELECT id, name FROM stations WHERE search_name = \'\'');
        while ($station = $pending->fetch()) {
            $key = station_search_key($station['name']);
            $updateName->execute([$key, $station['id']]);
            foreach (array_unique(explode(' ', $key)) as $term) {
                if ($term !== '') {
                    $addTerm->execute([$station['id'], $term]);
                }
            }
        }
    }
    if ($cols) {
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS notifications (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
              kind TEXT NOT NULL,
              title TEXT NOT NULL,
              body TEXT NOT NULL,
              dedupe_key TEXT NOT NULL,
              created_at INTEGER NOT NULL,
              read_at INTEGER,
              UNIQUE (user_id, dedupe_key)
            );
            CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at)'
        );
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS station_hits (
              station_id INTEGER PRIMARY KEY REFERENCES stations(id) ON DELETE CASCADE,
              n INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS wagon_reports (
              trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
              user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              wagons INTEGER NOT NULL CHECK (wagons BETWEEN 1 AND 30),
              created_at INTEGER NOT NULL,
              PRIMARY KEY (trip_id, user_id)
            )'
        );
        $done = true;
    }
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_stations_lat_lon ON stations(lat, lon)');
}

function q(string $sql, array $params = []): PDOStatement
{
    $st = db()->prepare($sql);
    foreach ($params as $k => $v) {
        $type = is_int($v) ? PDO::PARAM_INT : (is_null($v) ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $st->bindValue(is_int($k) ? $k + 1 : ':' . ltrim((string) $k, ':'), $v, $type);
    }
    $st->execute();
    return $st;
}

function now(): int
{
    return time();
}

class ApiError extends Exception
{
    public function __construct(public int $status, public string $errorCode, string $message)
    {
        parent::__construct($message);
    }
}

function fail(int $status, string $code, string $message): never
{
    throw new ApiError($status, $code, $message);
}

function respond($data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function body(): array
{
    static $data = null;
    if ($data === null) {
        $raw = file_get_contents('php://input');
        $data = $raw ? json_decode($raw, true) : [];
        if (!is_array($data)) {
            fail(400, 'bad_json', 'Ungültige Anfrage.');
        }
    }
    return $data;
}

function client_ip(): string
{
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

function rate_limit(string $bucket, int $max, int $windowSec, string $message = 'Bitte warte kurz, du machst das zu schnell.'): void
{
    $since = now() - $windowSec;
    $count = (int) q('SELECT COUNT(*) FROM rate_events WHERE bucket = ? AND created_at > ?', [$bucket, $since])->fetchColumn();
    if ($count >= $max) {
        fail(429, 'rate_limited', $message);
    }
    q('INSERT INTO rate_events (bucket, created_at) VALUES (?, ?)', [$bucket, now()]);
}

function cors_and_security_headers(): void
{
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    header('Cache-Control: no-store');
    $allowed = array_filter(array_map('trim', explode(',', env('ALLOWED_ORIGINS', '') ?? '')));
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '' && in_array($origin, $allowed, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Headers: Authorization, Content-Type');
        header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
    }
}

function current_user(bool $required = true): ?array
{
    static $cache = false;
    if ($cache === false) {
        $cache = null;
        $h = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
        if (preg_match('/^Bearer\s+([a-f0-9]{64})$/i', $h, $m)) {
            $row = q(
                'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
                 WHERE s.token_hash = ? AND s.expires_at > datetime(\'now\')',
                [hash('sha256', strtolower($m[1]))]
            )->fetch();
            if ($row) {
                $cache = $row;
            }
        }
    }
    if ($cache === null && $required) {
        fail(401, 'auth_required', 'Bitte melde dich an.');
    }
    if ($cache !== null && (int) $cache['banned'] === 1) {
        fail(403, 'banned', 'Dein Konto ist gesperrt.');
    }
    return $cache;
}

function require_role(array $roles): array
{
    $u = current_user();
    if (!in_array($u['role'], $roles, true)) {
        fail(403, 'forbidden', 'Dafür fehlt die Berechtigung.');
    }
    return $u;
}

function create_session(int $userId): string
{
    $token = bin2hex(random_bytes(32));
    q(
        'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime(\'now\', \'+30 days\'))',
        [hash('sha256', $token), $userId]
    );
    return $token;
}

function log_action(?int $actor, string $action, string $type, int $id, ?string $note = null): void
{
    q(
        'INSERT INTO moderation_actions (actor_id, action, target_type, target_id, note, created_at) VALUES (?,?,?,?,?,?)',
        [$actor, $action, $type, $id, $note, now()]
    );
}

function is_premium(int $userId): bool
{
    return (bool) q(
        'SELECT 1 FROM subscriptions WHERE user_id = ? AND status = \'active\'
         AND (expires_at IS NULL OR expires_at > datetime(\'now\'))',
        [$userId]
    )->fetchColumn();
}

// Privacy job: reporter locations are only kept for validation (24 h).
function cleanup(): array
{
    $loc = q('DELETE FROM report_locations WHERE created_at < ?', [now() - 86400])->rowCount();
    $rate = q('DELETE FROM rate_events WHERE created_at < ?', [now() - 7200])->rowCount();
    $ses = q('DELETE FROM sessions WHERE expires_at < datetime(\'now\')')->rowCount();
    q('DELETE FROM notifications WHERE created_at < ?', [now() - 7 * 86400]);
    q('INSERT OR REPLACE INTO meta (key, value) VALUES (\'last_cleanup\', ?)', [(string) now()]);
    return ['locations' => $loc, 'rate_events' => $rate, 'sessions' => $ses];
}

function maybe_cleanup(): void
{
    $last = (int) (q('SELECT value FROM meta WHERE key = \'last_cleanup\'')->fetchColumn() ?: 0);
    if (now() - $last > 3600) {
        cleanup();
    }
}
