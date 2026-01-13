<?php
// Simple poster upload handler + minimal manual form.
// Saves files directly into this /posters/ directory with the requested filename.

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$uploadDir = __DIR__ . '/';

function sanitizeFilename($name) {
    $name = basename($name);
    // allow letters, numbers, underscore, dash, dot, and common CJK
    $name = preg_replace('/[^\w\-\.\x{4e00}-\x{9fff}]/u', '_', $name);
    if ($name === '' || $name === '.' || $name === '..') {
        return '';
    }
    return $name;
}

function saveUpload($field, $desiredName = '') {
    global $uploadDir;
    if (empty($_FILES[$field]) || $_FILES[$field]['error'] !== UPLOAD_ERR_OK) {
        return ['ok' => false, 'error' => 'No file uploaded'];
    }

    $tmp = $_FILES[$field]['tmp_name'];
    $orig = $_FILES[$field]['name'];
    $name = sanitizeFilename($desiredName ?: $orig);
    if ($name === '') {
        return ['ok' => false, 'error' => 'Invalid filename'];
    }

    $target = $uploadDir . $name;
    // overwrite to keep single canonical file
    if (file_exists($target)) {
        @unlink($target);
    }

    if (!move_uploaded_file($tmp, $target)) {
        return ['ok' => false, 'error' => 'Failed to save file'];
    }

    return ['ok' => true, 'file' => $name, 'path' => $target];
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $desired = '';
    if (isset($_GET['name'])) $desired = $_GET['name'];
    if (isset($_POST['name'])) $desired = $_POST['name'];

    $result = saveUpload('fileToUpload', $desired);
    if (!$result['ok']) {
        // try alternate field name 'file'
        $result = saveUpload('file', $desired);
    }

    header('Content-Type: application/json; charset=utf-8');
    if ($result['ok']) {
        echo json_encode(['success' => true, 'file' => $result['file']]);
    } else {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => $result['error']]);
    }
    exit;
}

// GET: simple manual form
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Poster Upload</title>
  <style>
    body { font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; padding: 24px; }
    .card { width: 100%; max-width: 520px; background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 20px; box-shadow: 0 20px 50px rgba(0,0,0,0.3); }
    label { display: block; margin-bottom: 6px; font-weight: 600; }
    input[type="text"], input[type="file"] { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid #1f2937; background: #0b1220; color: #e2e8f0; margin-bottom: 14px; }
    button { width: 100%; padding: 12px; border: none; border-radius: 10px; background: linear-gradient(90deg, #0f766e, #0ea5e9); color: #fff; font-weight: 700; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <h2 style="margin-top:0;margin-bottom:10px;">Poster Upload (poster.php)</h2>
    <form method="post" enctype="multipart/form-data">
      <label for="name">Filename (optional, e.g. douban-12345.jpg)</label>
      <input id="name" name="name" type="text" placeholder="douban-12345.jpg" />

      <label for="fileToUpload">Choose poster/cover image</label>
      <input id="fileToUpload" name="fileToUpload" type="file" accept="image/*" />

      <button type="submit">Upload</button>
    </form>
    <p style="font-size:12px;color:#94a3b8;margin-top:8px;">
      Files are stored in this /posters/ directory and will overwrite existing files with the same name.
    </p>
  </div>
</body>
</html>
