<?php
/**
 * Server-side yt-dlp queue for MoonTV downloads.
 *
 * Place this file on the CONFIGJSON site under /posters/yt-dlp.php
 * and ensure yt-dlp + ffmpeg are installed on the host.
 *
 * Endpoints:
 *  - POST action=enqueue { url, title? } -> { ok, id, status, progress }
 *  - GET  action=status&id=...          -> { ok, id, status, progress, url?, error? }
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
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

function list_jobs($dir) {
    $jobs = [];
    foreach (glob($dir . '/job_*.json') as $file) {
        $raw = @file_get_contents($file);
        $data = json_decode($raw ?: '', true);
        if (is_array($data) && !empty($data['id'])) {
            $jobs[] = $data;
        }
    }
    return $jobs;
}

function start_worker($workerPath, $jobId) {
    $php = PHP_BINARY ?: 'php';
    $cmd = escapeshellcmd($php) . ' ' . escapeshellarg($workerPath) . ' ' . escapeshellarg($jobId);
    $cmd .= ' > /dev/null 2>&1 &';
    @exec($cmd);
}

function start_queued_jobs($jobsDir, $lockPath, $workerPath, $maxConcurrent) {
    $lock = @fopen($lockPath, 'c+');
    if ($lock === false) {
        return;
    }
    if (!flock($lock, LOCK_EX)) {
        fclose($lock);
        return;
    }

    $jobs = list_jobs($jobsDir);
    $active = 0;
    foreach ($jobs as $job) {
        $status = $job['status'] ?? 'queued';
        if ($status === 'preparing' || $status === 'downloading') {
            $active++;
        }
    }

    usort($jobs, function ($a, $b) {
        return ($a['createdAt'] ?? 0) <=> ($b['createdAt'] ?? 0);
    });

    foreach ($jobs as $job) {
        if ($active >= $maxConcurrent) {
            break;
        }
        if (($job['status'] ?? '') !== 'queued') {
            continue;
        }
        $job['status'] = 'preparing';
        $job['progress'] = 0;
        save_job($jobsDir, $job);
        start_worker($workerPath, $job['id']);
        $active++;
    }

    flock($lock, LOCK_UN);
    fclose($lock);
}

$baseDir = __DIR__;
$downloadDir = $baseDir . '/downloads';
$cacheDir = $baseDir . '/cache/yt-dlp';
$jobsDir = $cacheDir . '/jobs';
$lockPath = $cacheDir . '/queue.lock';
$workerPath = $baseDir . '/yt-dlp-worker.php';
$maxConcurrent = intval(getenv('YTDLP_MAX_CONCURRENT') ?: 2);

ensure_dir($downloadDir);
ensure_dir($cacheDir);
ensure_dir($jobsDir);

$payload = $_POST;
if (empty($payload)) {
    $raw = file_get_contents('php://input');
    $decoded = json_decode($raw, true);
    if (is_array($decoded)) {
        $payload = $decoded;
    }
}

$action = $payload['action'] ?? $_GET['action'] ?? 'enqueue';

if ($action === 'status') {
    $id = $_GET['id'] ?? $payload['id'] ?? '';
    $id = preg_replace('/[^A-Za-z0-9_-]/', '', (string) $id);
    if ($id === '') {
        respond(400, ['ok' => false, 'error' => 'Missing id']);
    }

    start_queued_jobs($jobsDir, $lockPath, $workerPath, $maxConcurrent);

    $job = load_job($jobsDir, $id);
    if (!$job) {
        respond(404, ['ok' => false, 'error' => 'Job not found']);
    }

    $response = [
        'ok' => true,
        'id' => $job['id'],
        'status' => $job['status'] ?? 'queued',
        'progress' => $job['progress'] ?? 0,
    ];
    if (!empty($job['file'])) {
        $response['url'] = $job['file'];
    }
    if (!empty($job['error'])) {
        $response['error'] = $job['error'];
    }
    respond(200, $response);
}

if ($action !== 'enqueue') {
    respond(400, ['ok' => false, 'error' => 'Unsupported action']);
}

$url = $payload['url'] ?? $_GET['url'] ?? '';
$url = trim((string) $url);
if ($url === '' || !preg_match('#^https?://#i', $url)) {
    respond(400, ['ok' => false, 'error' => 'Invalid url']);
}

$title = $payload['title'] ?? '';
$title = trim((string) $title);

$id = bin2hex(random_bytes(8));
$job = [
    'id' => $id,
    'url' => $url,
    'title' => $title,
    'status' => 'queued',
    'progress' => 0,
    'createdAt' => time(),
    'updatedAt' => time(),
];
save_job($jobsDir, $job);

start_queued_jobs($jobsDir, $lockPath, $workerPath, $maxConcurrent);

respond(200, [
    'ok' => true,
    'id' => $id,
    'status' => 'queued',
    'progress' => 0,
]);
