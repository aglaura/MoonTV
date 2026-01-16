<?php
/**
 * yt-dlp worker for queued downloads.
 *
 * Usage: php yt-dlp-worker.php <jobId>
 */

if (php_sapi_name() !== 'cli') {
    exit(1);
}

set_time_limit(0);

$jobId = $argv[1] ?? '';
$jobId = preg_replace('/[^A-Za-z0-9_-]/', '', (string) $jobId);
if ($jobId === '') {
    exit(1);
}

function ensure_dir($path) {
    if (!is_dir($path)) {
        mkdir($path, 0755, true);
    }
}

function job_path($dir, $id) {
    return $dir . '/job_' . $id . '.json';
}

function load_job($dir, $id) {
    $path = job_path($dir, $id);
    if (!is_file($path)) {
        return null;
    }
    $raw = @file_get_contents($path);
    $data = json_decode($raw ?: '', true);
    return is_array($data) ? $data : null;
}

function save_job($dir, $job) {
    $path = job_path($dir, $job['id']);
    $job['updatedAt'] = time();
    @file_put_contents($path, json_encode($job, JSON_UNESCAPED_UNICODE), LOCK_EX);
}

function sanitize_name($raw) {
    $name = preg_replace('/[^A-Za-z0-9._-]+/', '_', $raw ?: '');
    $name = trim($name, '._-');
    if ($name === '') {
        $name = 'video';
    }
    return substr($name, 0, 80);
}

$baseDir = __DIR__;
$downloadDir = $baseDir . '/downloads';
$cacheDir = $baseDir . '/cache/yt-dlp';
$jobsDir = $cacheDir . '/jobs';
$logDir = $cacheDir . '/logs';

ensure_dir($downloadDir);
ensure_dir($cacheDir);
ensure_dir($jobsDir);
ensure_dir($logDir);

$job = load_job($jobsDir, $jobId);
if (!$job || empty($job['url'])) {
    exit(1);
}

$title = $job['title'] ?? '';
$filename = sanitize_name($title) . '_' . $jobId . '.mp4';
$targetPath = $downloadDir . '/' . $filename;
$logFile = $logDir . '/' . $jobId . '.log';

$job['status'] = 'downloading';
$job['progress'] = 0;
$job['file'] = 'downloads/' . $filename;
save_job($jobsDir, $job);

$ytdlp = getenv('YTDLP_PATH') ?: 'yt-dlp';
$format = getenv('YTDLP_FORMAT') ?: 'bestvideo+bestaudio/best';

$cmd = sprintf(
    '%s --no-playlist --newline --progress --no-warnings -f %s --merge-output-format mp4 --remux-video mp4 -o %s %s',
    escapeshellcmd($ytdlp),
    escapeshellarg($format),
    escapeshellarg($targetPath),
    escapeshellarg($job['url'])
);

$descriptors = [
    1 => ['pipe', 'w'],
    2 => ['pipe', 'w'],
];

$process = @proc_open($cmd, $descriptors, $pipes);
if (!is_resource($process)) {
    $job['status'] = 'error';
    $job['error'] = 'Failed to start yt-dlp';
    save_job($jobsDir, $job);
    exit(1);
}

stream_set_blocking($pipes[1], false);
stream_set_blocking($pipes[2], false);

$logHandle = @fopen($logFile, 'a');
$lastProgress = 0;

while (true) {
    $read = [$pipes[1], $pipes[2]];
    $write = null;
    $except = null;
    $changed = @stream_select($read, $write, $except, 1);
    if ($changed !== false && $changed > 0) {
        foreach ($read as $pipe) {
            $line = fgets($pipe);
            if ($line === false) {
                continue;
            }
            if ($logHandle) {
                fwrite($logHandle, $line);
            }
            if (preg_match('/\\[download\\]\\s+([0-9.]+)%/', $line, $matches)) {
                $progress = (int) floor((float) $matches[1]);
                if ($progress !== $lastProgress) {
                    $lastProgress = $progress;
                    $job['progress'] = $progress;
                    save_job($jobsDir, $job);
                }
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
$exitCode = proc_close($process);
if ($logHandle) {
    fclose($logHandle);
}

if ($exitCode === 0 && is_file($targetPath)) {
    $job['status'] = 'downloaded';
    $job['progress'] = 100;
    $job['file'] = 'downloads/' . $filename;
    save_job($jobsDir, $job);
    exit(0);
}

$job['status'] = 'error';
$job['progress'] = 0;
$job['error'] = 'yt-dlp failed';
save_job($jobsDir, $job);
exit(1);
