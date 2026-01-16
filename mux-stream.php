<?php
/**
 * Stream-mux helper for MoonTV (progressive download).
 *
 * Place this file on the CONFIGJSON site under /posters/mux-stream.php
 * and ensure ffmpeg is installed on the host.
 *
 * Accepts POST/GET:
 *   url   - required .m3u8 URL
 *   name  - optional target filename (will be sanitized)
 *   token - optional shared secret (set MUX_SHARED_TOKEN env or edit below)
 *
 * Outputs an MP4 stream directly to the client.
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

$sharedToken = getenv('MUX_SHARED_TOKEN') ?: '';
$requestToken = $_POST['token'] ?? $_GET['token'] ?? '';
if ($sharedToken !== '' && $requestToken !== $sharedToken) {
    respond_json(401, ['ok' => false, 'error' => 'Unauthorized']);
}

$m3u8 = $_POST['url'] ?? $_GET['url'] ?? '';
$m3u8 = trim($m3u8);
if ($m3u8 === '' || !preg_match('#^https?://#i', $m3u8)) {
    respond_json(400, ['ok' => false, 'error' => 'Invalid url']);
}

$rawName = $_POST['name'] ?? $_GET['name'] ?? 'video-' . time() . '.mp4';
$safeName = sanitize_filename($rawName);
if (!preg_match('/\.mp4$/i', $safeName)) {
    $safeName .= '.mp4';
}

$ffmpeg = getenv('FFMPEG_PATH') ?: 'ffmpeg';
$timeoutSec = intval(getenv('MUX_STREAM_TIMEOUT_SEC') ?: 0);
set_time_limit(0);

$cmd = sprintf(
    '%s -i %s -c copy -bsf:a aac_adtstoasc -movflags +frag_keyframe+empty_moov+default_base_moof -f mp4 -',
    escapeshellcmd($ffmpeg),
    escapeshellarg($m3u8)
);

if ($timeoutSec > 0) {
    $cmd = sprintf('timeout %d %s', $timeoutSec, $cmd);
}

$descriptors = [
    1 => ['pipe', 'w'],
    2 => ['pipe', 'w'],
];
$process = @proc_open($cmd, $descriptors, $pipes);
if (!is_resource($process)) {
    respond_json(500, ['ok' => false, 'error' => 'Unable to start ffmpeg']);
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
    $errMsg = trim($stderr) !== '' ? trim($stderr) : 'ffmpeg failed';
    respond_json(500, ['ok' => false, 'error' => $errMsg]);
}

while (ob_get_level() > 0) {
    ob_end_flush();
}

header('Content-Type: video/mp4');
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
