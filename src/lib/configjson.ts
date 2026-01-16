export function ensureHttpScheme(
  raw: string,
  defaultProtocol = 'http'
): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith('//')) {
    return `${defaultProtocol}:${trimmed}`;
  }
  return `${defaultProtocol}://${trimmed}`;
}

export function normalizeConfigJsonBase(
  raw?: string | null,
  defaultProtocol = 'http'
): string | null {
  if (!raw) return null;
  let trimmed = raw.trim();
  if (!trimmed) return null;
  trimmed = trimmed.replace(/\/?config\.json(?:\?.*)?$/i, '');
  trimmed = trimmed.replace(/\/+$/, '');
  if (!trimmed) return null;
  return ensureHttpScheme(trimmed, defaultProtocol);
}

export function normalizeConfigJsonUrl(
  raw?: string | null,
  defaultProtocol = 'http'
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/config\.json(?:\?.*)?$/i.test(trimmed)) {
    return ensureHttpScheme(trimmed, defaultProtocol);
  }
  const base = normalizeConfigJsonBase(trimmed, defaultProtocol);
  return base ? `${base}/config.json` : null;
}
