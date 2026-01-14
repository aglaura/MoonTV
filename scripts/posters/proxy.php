<?php
// Simple poster proxy/cache. Place this file under CONFIGJSON/posters/proxy.php
// and ensure the web server can write to this directory.

header('Content-Type: application/json; charset=utf-8');

// Basic auth hook (optional): honor existing auth.php if present.
if (file_exists(__DIR__ . '/../auth.php')) {
    require_once __DIR__ . '/../auth.php';
    if (function_exists('require_admin')) {
        require_admin(true);
    }
}

$url = isset($_GET['url']) ? trim($_GET['url']) : '';
if ($url === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Missing url']);
    exit;
}

$doubanId = isset($_GET['doubanId']) ? trim($_GET['doubanId']) : '';
$imdbId = isset($_GET['imdbId']) ? trim($_GET['imdbId']) : '';
$name = isset($_GET['name']) ? trim($_GET['name']) : '';

// Allow only http/https
if (!preg_match('#^https?://#i', $url)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid url']);
    exit;
}

// Resolve filename
function safeName(string $value): string
{
    $value = basename($value);
    return preg_replace('/[^\\w\\-\\.\\x{4e00}-\\x{9fff}]/u', '_', $value);
}

function extensionFromHeaders(array $headers): string
{
    foreach ($headers as $key => $value) {
        if (strcasecmp($key, 'content-type') === 0) {
            if (stripos($value, 'png') !== false) return '.png';
            if (stripos($value, 'webp') !== false) return '.webp';
            if (stripos($value, 'gif') !== false) return '.gif';
            return '.jpg';
        }
    }
    return '.jpg';
}

$ext = '.jpg';
$targetDir = __DIR__ . '/';
if (!is_dir($targetDir)) {
    mkdir($targetDir, 0755, true);
}
if (!is_writable($targetDir)) {
    http_response_code(500);
    echo json_encode(['error' => 'target directory not writable']);
    exit;
}

// Prefer explicit name/douban/imdb
if ($name !== '') {
    $baseName = safeName($name);
} elseif ($doubanId !== '') {
    $baseName = 'douban-' . safeName($doubanId);
} elseif ($imdbId !== '') {
    $baseName = 'imdb-' . safeName($imdbId);
} else {
    $baseName = 'hash-' . sha1($url);
}

// Fetch remote image with curl to control headers
$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_HEADER => true,
    CURLOPT_TIMEOUT => 20,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_HTTPHEADER => [
        'Referer: https://movie.douban.com/',
        'User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    ],
]);
$raw = curl_exec($ch);
if ($raw === false) {
    http_response_code(500);
    echo json_encode(['error' => 'fetch failed', 'detail' => curl_error($ch)]);
    curl_close($ch);
    exit;
}
$status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$headersRaw = substr($raw, 0, $headerSize);
$body = substr($raw, $headerSize);
curl_close($ch);

if ($status < 200 || $status >= 300 || $body === '') {
    http_response_code(502);
    echo json_encode(['error' => 'bad upstream', 'status' => $status]);
    exit;
}

// Parse headers
$headers = [];
foreach (explode("\r\n", $headersRaw) as $line) {
    if (strpos($line, ':') !== false) {
        [$k, $v] = explode(':', $line, 2);
        $headers[trim($k)] = trim($v);
    }
}
$ext = extensionFromHeaders($headers);

$filename = $baseName . $ext;
$path = $targetDir . $filename;

// Avoid overwriting unless same name already exists
if (!file_exists($path)) {
    if (file_put_contents($path, $body) === false) {
        http_response_code(500);
        echo json_encode(['error' => 'write failed']);
        exit;
    }
}

$publicPath = '/posters/' . rawurlencode($filename);
echo json_encode([
    'success' => true,
    'url' => $publicPath,
    'filename' => $filename,
]);
