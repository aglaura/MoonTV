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
  const filename = `healthcheck-${Date.now()}.txt`;
  const posterUrl = `${base}/posters/${encodeURIComponent(filename)}`;
  result.posterUrl = posterUrl;
  const payload = `MoonTV poster cache test @ ${new Date().toISOString()}`;

  try {
    const postResp = await fetch(posterUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: payload,
    });
    result.posterPostStatus = postResp.status;
    result.posterPostOk = postResp.ok;
    if (!postResp.ok) {
      result.posterPostError = postResp.statusText || 'POST failed';
    }

    // fallback through poster.html if direct POST failed (404/405 etc.)
    if (!result.posterPostOk && (postResp.status === 404 || postResp.status === 405)) {
      try {
        const fd = new FormData();
        fd.append('file', new Blob([payload], { type: 'text/plain' }), filename);
        const fbUrl = `${base}/posters/poster.html?name=${encodeURIComponent(filename)}`;
        const fbResp = await fetch(fbUrl, {
          method: 'POST',
          body: fd,
        });
        result.posterHtmlPostStatus = fbResp.status;
        result.posterHtmlPostOk = fbResp.ok;
        if (!fbResp.ok) {
          result.posterHtmlPostError = fbResp.statusText || 'poster.html POST failed';
        } else {
          result.posterPostOk = true;
        }
      } catch (err) {
        result.posterHtmlPostOk = false;
        result.posterHtmlPostError = (err as Error).message;
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
        const text = await getResp.text();
        result.posterContentMatches = text === payload;
        result.posterContentLength = text.length;
      } else {
        result.posterGetError = getResp.statusText || 'GET failed';
      }
    } catch (err) {
      result.posterGetOk = false;
      result.posterGetError = (err as Error).message;
    }
  }

  const success =
    !!result.configOk &&
    result.configParsable !== false &&
    !!result.posterPutOk &&
    !!result.posterGetOk;

  return NextResponse.json(
    { ...result, success },
    {
      status: success ? 200 : 207, // 207: multi-status style
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
