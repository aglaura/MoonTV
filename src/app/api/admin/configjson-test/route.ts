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

  // 2) Poster upload + readback
  const filename = `healthcheck-${Date.now()}.txt`;
  const posterUrl = `${base}/posters/${encodeURIComponent(filename)}`;
  result.posterUrl = posterUrl;
  const payload = `MoonTV poster cache test @ ${new Date().toISOString()}`;

  try {
    const putResp = await fetch(posterUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: payload,
    });
    result.posterPutStatus = putResp.status;
    result.posterPutOk = putResp.ok;
    if (!putResp.ok) {
      result.posterPutError = putResp.statusText || 'PUT failed';
    }
  } catch (err) {
    result.posterPutOk = false;
    result.posterPutError = (err as Error).message;
  }

  if (result.posterPutOk) {
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
