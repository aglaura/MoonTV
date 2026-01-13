import fs from 'fs';
import path from 'path';

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function buildBaseUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase().endsWith('config.json')) {
    return trimmed.replace(/\/+$/, '').slice(0, -'config.json'.length);
  }
  return trimmed.replace(/\/+$/, '');
}

export async function POST() {
  const base = buildBaseUrl(process.env.CONFIGJSON);
  if (!base) {
    return NextResponse.json(
      { error: 'CONFIGJSON is not set' },
      { status: 400 }
    );
  }

  const result: Record<string, any> = {
    baseUrl: base,
  };

  // 1) config.json availability
  const configUrl = `${base}/config.json`;
  result.configUrl = configUrl;
  try {
    const resp = await fetch(configUrl, { method: 'GET', cache: 'no-store' });
    result.configStatus = resp.status;
    result.configOk = resp.ok;
    if (resp.ok) {
      const text = await resp.text();
      result.configLength = text.length;
      try {
        JSON.parse(text);
        result.configParsable = true;
      } catch {
        result.configParsable = false;
      }
    } else {
      result.configError = resp.statusText || 'HTTP error';
    }
  } catch (err) {
    result.configOk = false;
    result.configError = (err as Error).message;
  }

  // 1.5) Poster helper page existence
  const posterHelperUrl = `${base}/posters/poster.html`;
  result.posterHelperUrl = posterHelperUrl;
  try {
    const helperResp = await fetch(posterHelperUrl, { method: 'GET' });
    result.posterHelperStatus = helperResp.status;
    result.posterHelperOk = helperResp.ok;
  } catch (err) {
    result.posterHelperOk = false;
    result.posterHelperError = (err as Error).message;
  }

  // 2) Poster upload + readback (prefers direct POST, falls back to poster.html FormData)
  const loadSample = () => {
    try {
      const logoPath = path.join(process.cwd(), 'public', 'logo.png');
      const buf = fs.readFileSync(logoPath);
      return { buffer: buf, contentType: 'image/png', ext: '.png' };
    } catch {
      const text = `MoonTV poster cache test @ ${new Date().toISOString()}`;
      return { buffer: Buffer.from(text, 'utf8'), contentType: 'text/plain', ext: '.txt' };
    }
  };
  const sample = loadSample();
  const filename = `healthcheck-${Date.now()}${sample.ext}`;
  const posterUrl = `${base}/posters/${encodeURIComponent(filename)}`;
  result.posterUrl = posterUrl;

  result.posterUploadMethod = 'POST direct';

  try {
    const postResp = await fetch(posterUrl, {
      method: 'POST',
      headers: { 'Content-Type': sample.contentType },
      body: sample.buffer,
    });
    result.posterPostStatus = postResp.status;
    result.posterPostOk = postResp.ok;
    if (!postResp.ok) {
      result.posterPostError = postResp.statusText || 'POST failed';
    }

    // fallback through poster.html if direct POST failed (404/405 etc.)
    if (!result.posterPostOk && (postResp.status === 404 || postResp.status === 405)) {
      const tryPosterHtmlUpload = async (
        fieldName: string
      ): Promise<{ ok: boolean; status?: number; error?: string }> => {
        try {
          const fd = new FormData();
          fd.append(fieldName, new Blob([sample.buffer], { type: sample.contentType }), filename);
          const fbUrl = `${base}/posters/poster.html?name=${encodeURIComponent(filename)}`;
          const fbResp = await fetch(fbUrl, {
            method: 'POST',
            body: fd,
          });
          return {
            ok: fbResp.ok,
            status: fbResp.status,
            error: fbResp.ok ? undefined : fbResp.statusText || 'poster.html POST failed',
          };
        } catch (err) {
          return { ok: false, error: (err as Error).message };
        }
      };

      // Try 'file' then 'fileToUpload' to match possible server handlers
      const first = await tryPosterHtmlUpload('file');
      if (!first.ok) {
        const second = await tryPosterHtmlUpload('fileToUpload');
        result.posterHtmlPostStatus = second.status ?? first.status;
        result.posterHtmlPostOk = second.ok;
        result.posterHtmlPostError = second.error ?? first.error;
        if (second.ok) {
          result.posterUploadMethod = 'poster.html FormData (fileToUpload)';
          result.posterPostStatus = second.status;
          result.posterPostOk = true;
          result.posterPostError = undefined;
        } else {
          result.posterUploadMethod = 'poster.html FormData (fileToUpload)';
          result.posterPostOk = false;
          result.posterPostStatus = second.status ?? first.status;
          result.posterPostError = second.error ?? first.error;
        }
      } else {
        result.posterHtmlPostStatus = first.status;
        result.posterHtmlPostOk = first.ok;
        result.posterUploadMethod = 'poster.html FormData (file)';
        result.posterPostStatus = first.status;
        result.posterPostOk = first.ok;
        result.posterPostError = first.error;
      }
    }
  } catch (err) {
    result.posterPostOk = false;
    result.posterPostError = (err as Error).message;
  }

  if (result.posterPostOk) {
    try {
      const getResp = await fetch(posterUrl, { method: 'GET', cache: 'no-store' });
      result.posterGetStatus = getResp.status;
      result.posterGetOk = getResp.ok;
      if (getResp.ok) {
        const fetched = Buffer.from(await getResp.arrayBuffer());
        result.posterContentLength = fetched.length;
        result.posterExpectedLength = sample.buffer.length;
        result.posterContentMatches =
          fetched.length === sample.buffer.length &&
          fetched.slice(0, 16).toString('hex') === sample.buffer.slice(0, 16).toString('hex');
      } else {
        result.posterGetError =
          (getResp.statusText || 'GET failed') + ` (${posterUrl})`;
      }
    } catch (err) {
      result.posterGetOk = false;
      result.posterGetError = `${(err as Error).message} (${posterUrl})`;
    }
  }

  const success =
    !!result.configOk &&
    result.configParsable !== false &&
    !!result.posterPostOk &&
    !!result.posterGetOk;

  return NextResponse.json(
    { ...result, success },
    {
      status: success ? 200 : 207, // 207: multi-status style
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
