<?php
/**
 * Server-side mux helper for MoonTV.
 *
 * Place this file on the CONFIGJSON site under /posters/mux.php
 * and ensure ffmpeg is installed on the host. It accepts POST:
 *   url   - required .m3u8 URL
 *   name  - optional target filename (will be sanitized)
 *   title - optional title for logging
 *   token - optional shared secret (set MUX_SHARED_TOKEN env or edit below)
 *
 * Outputs JSON: { ok: true, url, size, command, log } or { ok: false, error }.
 */

header('Content-Type: application/json; charset=utf-8');

$sharedToken = getenv('MUX_SHARED_TOKEN') ?: ''; // Set on server if you want auth
$requestToken = $_POST['token'] ?? $_GET['token'] ?? '';
if ($sharedToken !== '' && $requestToken !== $sharedToken) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Unauthorized']);
    exit;
}

function respond($status, $payload) {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function sanitize_filename($name) {
    $name = basename($name);
    $name = preg_replace('/[^\w\-.\\x{4e00}-\\x{9fff}]+/u', '_', $name);
    if ($name === '' || $name === '.' || $name === '..') {
        $name = 'video';
    }
    return $name;
}

$m3u8 = $_POST['url'] ?? $_GET['url'] ?? '';
$m3u8 = trim($m3u8);
if ($m3u8 === '' || !preg_match('#^https?://#i', $m3u8)) {
    respond(400, ['ok' => false, 'error' => 'Invalid url']);
}

$rawName = $_POST['name'] ?? $_GET['name'] ?? 'video-' . time() . '.mp4';
$safeName = sanitize_filename($rawName);
if (!preg_match('/\.mp4$/i', $safeName)) {
    $safeName .= '.mp4';
}

$downloadsDir = __DIR__ . '/posters/downloads';
if (!is_dir($downloadsDir) && !mkdir($downloadsDir, 0755, true)) {
    respond(500, ['ok' => false, 'error' => 'Cannot create downloads dir']);
}

$ffmpeg = getenv('FFMPEG_PATH') ?: 'ffmpeg';
$timeoutSec = intval(getenv('MUX_TIMEOUT_SEC') ?: 900); // 15 minutes default
$outputPath = $downloadsDir . '/' . $safeName;

$cmd = sprintf(
    '%s -y -i %s -c copy -bsf:a aac_adtstoasc %s',
    escapeshellcmd($ffmpeg),
    escapeshellarg($m3u8),
    escapeshellarg($outputPath)
);

if ($timeoutSec > 0) {
    $cmd = sprintf('timeout %d %s', $timeoutSec, $cmd);
}

$log = [];
$exitCode = 0;
exec($cmd . ' 2>&1', $log, $exitCode);

if ($exitCode !== 0 || !file_exists($outputPath)) {
    if (file_exists($outputPath)) {
        @unlink($outputPath);
    }
    respond(500, [
        'ok' => false,
        'error' => 'ffmpeg failed',
        'exit' => $exitCode,
        'log' => $log,
    ]);
}

$size = filesize($outputPath);
$scheme =
    (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? '';
$basePath = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/');
$publicUrl = ($host ? $scheme . '://' . $host : '') .
    $basePath .
    '/posters/downloads/' .
    rawurlencode($safeName);

respond(200, [
    'ok' => true,
    'url' => $publicUrl,
    'size' => $size,
    'command' => $cmd,
    'log' => $log,
]);
