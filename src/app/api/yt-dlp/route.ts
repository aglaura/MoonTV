import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';

export const runtime = 'nodejs';

type YtdlpResult = {
  url: string;
};

const YTDLP_BIN = process.env.YTDLP_BIN || 'yt-dlp';
const YTDLP_BASE_ARGS = [
  '--no-playlist',
  '--no-warnings',
  '--format',
  'best[ext=mp4]/best',
  '--get-url',
];

const withCors = (response: NextResponse) => {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set(
    'Access-Control-Allow-Methods',
    'POST, OPTIONS'
  );
  response.headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type'
  );
  return response;
};

const jsonResponse = (body: unknown, status = 200) =>
  withCors(NextResponse.json(body, { status }));

const extractFirstUrl = (output: string) => {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines[0] || '';
};

const runYtdlp = (targetUrl: string): Promise<YtdlpResult> =>
  new Promise((resolve, reject) => {
    const args = [...YTDLP_BASE_ARGS, targetUrl];
    const child = spawn(YTDLP_BIN, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code !== 0) {
        return reject(
          new Error(stderr.trim() || `yt-dlp exited with ${code}`)
        );
      }
      const url = extractFirstUrl(stdout);
      if (!url) {
        return reject(new Error('yt-dlp returned no URL'));
      }
      return resolve({ url });
    });
  });

export async function OPTIONS() {
  return withCors(
    new NextResponse(null, {
      status: 204,
    })
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const targetUrl = typeof body?.url === 'string' ? body.url.trim() : '';
    if (!targetUrl) {
      return jsonResponse({ error: 'Missing url' }, 400);
    }
    try {
      new URL(targetUrl);
    } catch {
      return jsonResponse({ error: 'Invalid url' }, 400);
    }

    const result = await runYtdlp(targetUrl);
    return jsonResponse(result, 200);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'yt-dlp failed';
    return jsonResponse({ error: message }, 500);
  }
}
