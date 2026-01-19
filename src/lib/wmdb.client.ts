'use client';

import type { DoubanSubjectDetail } from './types';

type WmdbPayload = Record<string, unknown>;

const wmdbDetailCache = new Map<string, DoubanSubjectDetail | null>();

function getRecord(raw: unknown): WmdbPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as WmdbPayload;
  if (record.data && typeof record.data === 'object') {
    return record.data as WmdbPayload;
  }
  return record;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function normalizeYear(value: unknown): string | undefined {
  const raw = normalizeString(value);
  if (!raw) return undefined;
  const match = raw.match(/\d{4}/);
  return match ? match[0] : undefined;
}

function splitList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'name' in item) {
          return normalizeString((item as { name?: unknown }).name);
        }
        return undefined;
      })
      .filter((item): item is string => !!item);
  }
  if (typeof value === 'string') {
    return value
      .split(/[\/,|;]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function pickList(...lists: Array<string[]>): string[] {
  for (const list of lists) {
    if (list.length > 0) return list;
  }
  return [];
}

function extractImdbId(value: unknown): string | undefined {
  if (!value) return undefined;
  const raw = normalizeString(value);
  if (raw) {
    const match = raw.match(/(tt\d{5,}|imdbt\d+)/i);
    return match ? match[1] : undefined;
  }
  if (typeof value === 'object') {
    const record = value as WmdbPayload;
    const candidates = [
      record.imdbId,
      record.imdb_id,
      record.imdbID,
      record.id,
    ];
    for (const candidate of candidates) {
      const extracted = extractImdbId(candidate);
      if (extracted) return extracted;
    }
  }
  return undefined;
}

function resolveImdbId(payload: WmdbPayload): string | undefined {
  const candidates = [
    payload.imdbId,
    payload.imdb_id,
    payload.imdbID,
    payload.imdb,
    payload.imdbIdStr,
    payload.imdb_id_str,
  ];
  for (const candidate of candidates) {
    const extracted = extractImdbId(candidate);
    if (extracted) return extracted;
  }
  return undefined;
}

function resolveTitle(payload: WmdbPayload): string | undefined {
  return (
    normalizeString(payload.title) ||
    normalizeString(payload.name) ||
    normalizeString(payload.chineseTitle) ||
    normalizeString(payload.cn_title)
  );
}

function resolveOriginalTitle(payload: WmdbPayload): string | undefined {
  return (
    normalizeString(payload.original_title) ||
    normalizeString(payload.originalTitle) ||
    normalizeString(payload.original_name) ||
    normalizeString(payload.originalName) ||
    normalizeString(payload.title_en) ||
    normalizeString(payload.name_en) ||
    normalizeString(payload.englishTitle) ||
    normalizeString(payload.imdbTitle)
  );
}

function normalizeWmdbDetail(
  payload: WmdbPayload,
  fallbackId: string
): DoubanSubjectDetail | null {
  const title = resolveTitle(payload);
  const originalTitle = resolveOriginalTitle(payload);
  const year =
    normalizeYear(payload.year) ||
    normalizeYear(payload.release_date) ||
    normalizeYear(payload.first_air_date) ||
    normalizeYear(payload.pubdate);
  const imdbId = resolveImdbId(payload);
  const imdbTitle =
    normalizeString(payload.imdbTitle) || originalTitle || undefined;

  return {
    id: normalizeString(payload.id) || fallbackId,
    title: title || originalTitle || '',
    original_title: originalTitle,
    year,
    imdbId,
    imdbTitle,
    actors: pickList(
      splitList(payload.actors),
      splitList(payload.actor),
      splitList(payload.casts),
      splitList(payload.cast)
    ),
    directors: pickList(
      splitList(payload.directors),
      splitList(payload.director)
    ),
    genres: pickList(splitList(payload.genres), splitList(payload.genre)),
    countries: pickList(
      splitList(payload.countries),
      splitList(payload.country)
    ),
    languages: pickList(
      splitList(payload.languages),
      splitList(payload.language)
    ),
    episodes:
      (typeof payload.episodes === 'number' && payload.episodes > 0
        ? payload.episodes
        : undefined) ||
      (typeof payload.episode_count === 'number' && payload.episode_count > 0
        ? payload.episode_count
        : undefined) ||
      (typeof payload.total_episodes === 'number' && payload.total_episodes > 0
        ? payload.total_episodes
        : undefined),
    durations: pickList(
      splitList(payload.durations),
      splitList(payload.duration)
    ),
    releaseDates:
      pickList(
        splitList(payload.releaseDates),
        splitList(payload.release_dates),
        splitList(payload.release_date),
        splitList(payload.pubdate)
      ),
  };
}

export async function getWmdbDetail(
  doubanId: string | number,
  lang?: string
): Promise<DoubanSubjectDetail | null> {
  const normalizedId = normalizeString(doubanId);
  if (!normalizedId) return null;

  if (wmdbDetailCache.has(normalizedId)) {
    return wmdbDetailCache.get(normalizedId) ?? null;
  }

  try {
    const params = new URLSearchParams();
    params.set('id', normalizedId);
    if (lang) params.set('lang', lang);
    const response = await fetch(`/api/wmdb?${params.toString()}`);
    if (!response.ok) {
      wmdbDetailCache.set(normalizedId, null);
      return null;
    }

    const data = await response.json();
    const payload = getRecord(data);
    if (!payload) {
      wmdbDetailCache.set(normalizedId, null);
      return null;
    }

    const normalized = normalizeWmdbDetail(payload, normalizedId);
    wmdbDetailCache.set(normalizedId, normalized);
    return normalized;
  } catch (error) {
    console.warn('获取 WMDB 条目信息失败', error);
    wmdbDetailCache.set(normalizedId, null);
    return null;
  }
}

export async function searchWmdb(params: {
  q?: string;
  actor?: string;
  year?: string;
  lang?: string;
}): Promise<unknown | null> {
  const q = normalizeString(params.q);
  const actor = normalizeString(params.actor);
  const year = normalizeYear(params.year);
  const lang = normalizeString(params.lang);

  if (!q && !actor && !year) return null;

  try {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (actor) params.set('actor', actor);
    if (year) params.set('year', year);
    if (lang) params.set('lang', lang);
    const response = await fetch(`/api/wmdb/search?${params.toString()}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.warn('WMDB search failed', error);
    return null;
  }
}
