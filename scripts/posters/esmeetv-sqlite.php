<?php
/**
 * MoonTV home feed cache backed by SQLite.
 *
 * Place this file on the CONFIGJSON site under /posters/esmeetv-sqlite.php
 * and ensure the web server can write to the database path.
 *
 * Supports:
 *   GET  ?key=home-merged   -> returns JSON payload
 *   PUT/POST (JSON body)    -> upserts payload (optional token)
 *
 * Env:
 *   MOONTV_SQLITE_PATH  - full path to sqlite db (default: this dir /esmeetv.sqlite)
 *   MOONTV_HOME_TOKEN   - optional write token; if set, required for PUT/POST
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function respond_json($status, $payload) {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function get_request_token() {
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/Bearer\\s+(.+)/i', $auth, $matches)) {
        return trim($matches[1]);
    }
    if (isset($_GET['token'])) return trim($_GET['token']);
    if (isset($_POST['token'])) return trim($_POST['token']);
    return '';
}

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$key = isset($_GET['key']) ? trim($_GET['key']) : 'home-merged';
if ($key === '') {
    $key = 'home-merged';
}

$dbPath = getenv('MOONTV_SQLITE_PATH');
if (!$dbPath) {
    $dbPath = __DIR__ . '/esmeetv.sqlite';
}

$dbDir = dirname($dbPath);
if (!is_dir($dbDir)) {
    @mkdir($dbDir, 0755, true);
}

try {
    $db = new SQLite3($dbPath, SQLITE3_OPEN_READWRITE | SQLITE3_OPEN_CREATE);
} catch (Throwable $e) {
    respond_json(500, ['ok' => false, 'error' => 'SQLite unavailable']);
}

$db->exec('PRAGMA journal_mode=WAL;');
$db->exec('PRAGMA synchronous=NORMAL;');
$db->exec('CREATE TABLE IF NOT EXISTS home_cache (
    key TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at INTEGER NOT NULL
)');

if ($method === 'GET') {
    $stmt = $db->prepare('SELECT payload, updated_at FROM home_cache WHERE key = :key LIMIT 1');
    $stmt->bindValue(':key', $key, SQLITE3_TEXT);
    $row = $stmt->execute()->fetchArray(SQLITE3_ASSOC);
    if (!$row) {
        respond_json(404, ['ok' => false, 'error' => 'Not found']);
    }
    header('Content-Type: application/json; charset=utf-8');
    echo $row['payload'];
    exit;
}

if ($method === 'PUT' || $method === 'POST') {
    $token = getenv('MOONTV_HOME_TOKEN') ?: '';
    if ($token !== '') {
        $reqToken = get_request_token();
        if ($reqToken === '' || !hash_equals($token, $reqToken)) {
            respond_json(401, ['ok' => false, 'error' => 'Unauthorized']);
        }
    }

    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        respond_json(400, ['ok' => false, 'error' => 'Empty body']);
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        respond_json(400, ['ok' => false, 'error' => 'Invalid JSON']);
    }

    $payload = json_encode($decoded, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $now = time();
    $stmt = $db->prepare(
        'INSERT INTO home_cache (key, payload, updated_at)
         VALUES (:key, :payload, :updated_at)
         ON CONFLICT(key) DO UPDATE SET payload = :payload, updated_at = :updated_at'
    );
    $stmt->bindValue(':key', $key, SQLITE3_TEXT);
    $stmt->bindValue(':payload', $payload, SQLITE3_TEXT);
    $stmt->bindValue(':updated_at', $now, SQLITE3_INTEGER);
    $ok = $stmt->execute();
    if (!$ok) {
        respond_json(500, ['ok' => false, 'error' => 'Write failed']);
    }
    respond_json(200, ['ok' => true, 'key' => $key, 'updated_at' => $now]);
}

respond_json(405, ['ok' => false, 'error' => 'Method not allowed']);
