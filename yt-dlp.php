<?php
/**
 * Server-side yt-dlp resolver for MoonTV downloads.
 *
 * Place this file on the CONFIGJSON site under /posters/yt-dlp.php
 * and ensure yt-dlp is installed on the host.
 *
 * Accepts POST/GET:
 *   url   - required target URL
 *   token - optional shared secret (set YTDLP_SHARED_TOKEN env)
 *   format - optional yt-dlp format string (default: best[ext=mp4]/best)
 *
 * Outputs JSON: { ok: true, url } or { ok: false, error }.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function respond($status, $payload) {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

$sharedToken = getenv('YTDLP_SHARED_TOKEN') ?: '';
$requestToken = $_POST['token'] ?? $_GET['token'] ?? '';

$payload = $_POST;
if (empty($payload)) {
    $raw = file_get_contents('php://input');
    $decoded = json_decode($raw, true);
    if (is_array($decoded)) {
        $payload = $decoded;
    }
    if ($requestToken === '' && is_array($decoded) && isset($decoded['token'])) {
        $requestToken = $decoded['token'];
    }
}

if ($sharedToken !== '' && $requestToken !== $sharedToken) {
    respond(401, ['ok' => false, 'error' => 'Unauthorized']);
}

$url = $payload['url'] ?? $_GET['url'] ?? '';
$url = trim($url);
if ($url === '' || !preg_match('#^https?://#i', $url)) {
    respond(400, ['ok' => false, 'error' => 'Invalid url']);
}

$format = $payload['format'] ?? $_GET['format'] ?? 'best[ext=mp4]/best';
$format = trim($format) ?: 'best[ext=mp4]/best';

$ytdlp = getenv('YTDLP_PATH') ?: 'yt-dlp';
$timeoutSec = intval(getenv('YTDLP_TIMEOUT_SEC') ?: 60);

$cmd = sprintf(
    '%s --no-playlist --no-warnings --format %s --get-url %s',
    escapeshellcmd($ytdlp),
    escapeshellarg($format),
    escapeshellarg($url)
);

if ($timeoutSec > 0) {
    $cmd = sprintf('timeout %d %s', $timeoutSec, $cmd);
}

$log = [];
$exitCode = 0;
exec($cmd . ' 2>&1', $log, $exitCode);

if ($exitCode !== 0 || empty($log)) {
    respond(500, [
        'ok' => false,
        'error' => 'yt-dlp failed',
        'exit' => $exitCode,
        'log' => $log,
    ]);
}

$downloadUrl = '';
foreach ($log as $line) {
    $line = trim($line);
    if ($line !== '') {
        $downloadUrl = $line;
        break;
    }
}

if ($downloadUrl === '') {
    respond(500, ['ok' => false, 'error' => 'yt-dlp returned no URL']);
}

respond(200, ['ok' => true, 'url' => $downloadUrl]);
