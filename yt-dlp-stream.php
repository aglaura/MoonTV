<?php
/**
 * yt-dlp stream helper for MoonTV.
 *
 * Place this file on the CONFIGJSON site under /posters/yt-dlp-stream.php
 * and ensure yt-dlp is installed on the host.
 *
 * Accepts POST/GET:
 *   url   - required video URL (m3u8)
 *   name  - optional target filename
 *   token - optional shared secret (set YTDLP_STREAM_TOKEN env)
 *
 * Streams the yt-dlp output directly to the client (no remux/conversion).
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function respond_json($status, $payload) {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function sanitize_filename($name) {
    $name = basename($name);
    $name = preg_replace('/[^\w\-.]+/', '_', $name);
    if ($name === '' || $name === '.' || $name === '..') {
        $name = 'video';
    }
    return $name;
}

$sharedToken = getenv('YTDLP_STREAM_TOKEN') ?: '';
$requestToken = $_POST['token'] ?? $_GET['token'] ?? '';
if ($sharedToken !== '' && $requestToken !== $sharedToken) {
    respond_json(401, ['ok' => false, 'error' => 'Unauthorized']);
}

$url = $_POST['url'] ?? $_GET['url'] ?? '';
$url = trim($url);
if ($url === '' || !preg_match('#^https?://#i', $url)) {
    respond_json(400, ['ok' => false, 'error' => 'Invalid url']);
}

$rawName = $_POST['name'] ?? $_GET['name'] ?? 'video';
$safeName = sanitize_filename($rawName);

$ytdlp = getenv('YTDLP_PATH') ?: 'yt-dlp';
$timeoutSec = intval(getenv('YTDLP_STREAM_TIMEOUT_SEC') ?: 0);
set_time_limit(0);

// Resolve a filename suggestion from yt-dlp when available.
$resolvedName = '';
try {
    $nameCmd = sprintf(
        '%s --no-playlist --no-warnings -f best --print filename -o %s %s',
        escapeshellcmd($ytdlp),
        escapeshellarg('%(title)s.%(ext)s'),
        escapeshellarg($url)
    );
    $nameOut = [];
    $nameCode = 1;
    @exec($nameCmd . ' 2>&1', $nameOut, $nameCode);
    if ($nameCode === 0 && !empty($nameOut)) {
        $resolvedName = trim($nameOut[0]);
    }
} catch (Throwable $e) {
    $resolvedName = '';
}

if ($resolvedName !== '') {
    $resolvedName = sanitize_filename($resolvedName);
    if (strpos($resolvedName, '.') !== false) {
        $safeName = $resolvedName;
    }
}

$cmd = sprintf(
    '%s --no-playlist --no-warnings -f best -o - %s',
    escapeshellcmd($ytdlp),
    escapeshellarg($url)
);

if ($timeoutSec > 0) {
    $cmd = sprintf('timeout %d %s', $timeoutSec, $cmd);
}

$descriptors = [
    1 => ['pipe', 'w'],
    2 => ['pipe', 'w'],
];
$process = @proc_open(['/bin/sh', '-c', $cmd], $descriptors, $pipes);
if (!is_resource($process)) {
    respond_json(500, ['ok' => false, 'error' => 'Unable to start stream']);
}

stream_set_blocking($pipes[1], false);
stream_set_blocking($pipes[2], false);

$stderr = '';
$buffer = '';
$start = time();
$hasOutput = false;

while (true) {
    $read = [$pipes[1], $pipes[2]];
    $write = null;
    $except = null;
    $changed = @stream_select($read, $write, $except, 1);
    if ($changed !== false && $changed > 0) {
        foreach ($read as $pipe) {
            $chunk = fread($pipe, 8192);
            if ($chunk === false || $chunk === '') {
                continue;
            }
            if ($pipe === $pipes[1]) {
                $buffer .= $chunk;
                $hasOutput = true;
            } else {
                $stderr .= $chunk;
            }
        }
    }
    if ($hasOutput) {
        break;
    }
    $status = proc_get_status($process);
    if (!$status['running']) {
        break;
    }
    if ((time() - $start) > 10) {
        break;
    }
}

if (!$hasOutput) {
    $stderr .= stream_get_contents($pipes[2]);
    foreach ($pipes as $pipe) {
        fclose($pipe);
    }
    proc_close($process);
    $errMsg = trim($stderr) !== '' ? trim($stderr) : 'yt-dlp stream failed';
    respond_json(500, ['ok' => false, 'error' => $errMsg]);
}

while (ob_get_level() > 0) {
    ob_end_flush();
}

header('Content-Type: application/octet-stream');
header('Content-Disposition: attachment; filename="' . $safeName . '"');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('X-Accel-Buffering: no');

echo $buffer;
flush();

while (true) {
    if (connection_aborted()) {
        proc_terminate($process);
        break;
    }
    $read = [$pipes[1], $pipes[2]];
    $write = null;
    $except = null;
    $changed = @stream_select($read, $write, $except, 1);
    if ($changed !== false && $changed > 0) {
        foreach ($read as $pipe) {
            $chunk = fread($pipe, 8192);
            if ($chunk === false || $chunk === '') {
                continue;
            }
            if ($pipe === $pipes[1]) {
                echo $chunk;
                flush();
            } else {
                $stderr .= $chunk;
            }
        }
    }
    $status = proc_get_status($process);
    if (!$status['running']) {
        break;
    }
}

foreach ($pipes as $pipe) {
    fclose($pipe);
}
proc_close($process);
