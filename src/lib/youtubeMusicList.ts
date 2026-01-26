import { YoutubeMusicListState, YoutubeMusicVideo } from './types';

export const MAX_YOUTUBE_MUSIC_LISTS = 3;
export const MAX_YOUTUBE_MUSIC_LIST_SIZE = 30;

const sanitizeList = (input: unknown): YoutubeMusicVideo[] => {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => ({
      id: String((item as { id?: unknown }).id || '').trim(),
      title: String((item as { title?: unknown }).title || '').trim(),
      artist: String((item as { artist?: unknown }).artist || '').trim() || undefined,
    }))
    .filter((item) => item.id && item.title)
    .slice(0, MAX_YOUTUBE_MUSIC_LIST_SIZE);
};

const normalizeLists = (input: unknown): YoutubeMusicVideo[][] => {
  const rawLists = Array.isArray(input) ? input : [];
  const cleaned = rawLists.map((list) => sanitizeList(list));
  const limited = cleaned.slice(0, MAX_YOUTUBE_MUSIC_LISTS);
  while (limited.length < MAX_YOUTUBE_MUSIC_LISTS) {
    limited.push([]);
  }
  return limited;
};

export const buildEmptyYoutubeMusicState = (): YoutubeMusicListState => ({
  lists: Array.from({ length: MAX_YOUTUBE_MUSIC_LISTS }, () => []),
  activeIndex: 0,
});

export const normalizeYoutubeMusicState = (
  input: unknown
): YoutubeMusicListState => {
  if (Array.isArray(input)) {
    return {
      lists: normalizeLists([input]),
      activeIndex: 0,
    };
  }

  if (input && typeof input === 'object') {
    const obj = input as { list?: unknown; lists?: unknown; activeIndex?: unknown };
    if (Array.isArray(obj.list)) {
      return {
        lists: normalizeLists([obj.list]),
        activeIndex: 0,
      };
    }
    const lists = normalizeLists(obj.lists);
    const rawIndex = Number(obj.activeIndex);
    const activeIndex = Number.isFinite(rawIndex)
      ? Math.min(Math.max(0, rawIndex), lists.length - 1)
      : 0;
    return { lists, activeIndex };
  }

  return buildEmptyYoutubeMusicState();
};
