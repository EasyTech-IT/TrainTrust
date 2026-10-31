<?php
declare(strict_types=1);

// Serves the static frontend from /public and routes /api/* to api/index.php
// Start with: php -S 127.0.0.1:8080 -t public router.php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if (str_starts_with($path, '/api/') || $path === '/api') {
    require __DIR__ . '/api/index.php';
    return true;
}
return false;
