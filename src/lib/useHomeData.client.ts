'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  GetBangumiCalendarData,
  type BangumiCalendarData,
} from './bangumi.client';
import type {
  CardItem,
  CategoryData,
  CategoryKey,
  PrefetchedHome,
  TmdbListItem,
  TmdbPerson,
  UiLocale,
} from './home.types';
import { isKidSafeContent } from './kidsMode.client';
import { convertToTraditional } from './locale';
import { DoubanItem } from './types';

export type UseHomeDataParams = {
  uiLocale: UiLocale;
  isKidsMode: boolean;
  category: CategoryKey;
};

export type UseHomeDataResult = {
  loading: boolean;
  error: boolean;
  categoryData: CategoryData;
  heroItems: CardItem[];
  effectiveTmdbMovies: CardItem[];
  effectiveLatestMovies: CardItem[];
  effectiveTmdbTv: CardItem[];
  effectiveLatestTv: CardItem[];
  effectiveTmdbPeople: CardItem[];
  applyKidsFilter: (items: CardItem[]) => CardItem[];
  applyPosterOverrides: (items: CardItem[]) => CardItem[];
};

const isKidSafeCard = (item: CardItem) =>
  isKidSafeContent({
    title: item.title,
    desc: item.rate || item.type || '',
    type: item.type,
  });

export const useHomeData = ({
  uiLocale,
  isKidsMode,
  category,
}: UseHomeDataParams): UseHomeDataResult => {
  const [hotMovies, setHotMovies] = useState<DoubanItem[]>([]);
  const [hotTvShows, setHotTvShows] = useState<DoubanItem[]>([]);
  const [latestMoviesDouban, setLatestMoviesDouban] = useState<DoubanItem[]>([]);
  const [latestTvDouban, setLatestTvDouban] = useState<DoubanItem[]>([]);
  const [hotVarietyShows, setHotVarietyShows] = useState<DoubanItem[]>([]);
  const [bangumiCalendarData, setBangumiCalendarData] = useState<
    BangumiCalendarData[]
  >([]);
  const [tmdbMovies, setTmdbMovies] = useState<TmdbListItem[]>([]);
  const [tmdbTv, setTmdbTv] = useState<TmdbListItem[]>([]);
  const [tmdbKr, setTmdbKr] = useState<TmdbListItem[]>([]);
  const [tmdbJp, setTmdbJp] = useState<TmdbListItem[]>([]);
  const [tmdbPeople, setTmdbPeople] = useState<TmdbPerson[]>([]);
  const [tmdbNowPlaying, setTmdbNowPlaying] = useState<TmdbListItem[]>([]);
  const [tmdbOnAir, setTmdbOnAir] = useState<TmdbListItem[]>([]);
  const [prefetchedHome, setPrefetchedHome] = useState<PrefetchedHome | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const applyKidsFilter = useCallback(
    (items: CardItem[]) =>
      isKidsMode ? items.filter((item) => isKidSafeCard(item)) : items,
    [isKidsMode]
  );

  useEffect(() => {
    const fetchRecommendData = async () => {
      try {
        setLoading(true);
        setError(false);

        const bangumiPromise = GetBangumiCalendarData();

        let mergedOk = false;
        try {
          const mergedRes = await fetch('/api/home/merged', {
            cache: 'force-cache',
          });
          if (mergedRes.ok) {
            const merged = (await mergedRes.json()) as PrefetchedHome;
            setPrefetchedHome(merged);
            mergedOk = true;
          } else {
            setPrefetchedHome(null);
          }
        } catch {
          setPrefetchedHome(null);
        }

        if (!mergedOk) {
          const doubanPromise = fetch('/api/douban/home', {
            cache: 'force-cache',
          }).then((r) => {
            if (!r.ok) throw new Error(`Douban home failed (${r.status})`);
            return r.json() as Promise<{
              movies?: DoubanItem[];
              tv?: DoubanItem[];
              variety?: DoubanItem[];
              latestMovies?: DoubanItem[];
              latestTv?: DoubanItem[];
            }>;
          });

          const tmdbPromise = fetch('/api/imdb/list', {
            cache: 'force-cache',
          }).then(async (res) => {
            if (!res.ok) throw new Error(`TMDB list failed (${res.status})`);
            return (await res.json()) as {
              movies?: TmdbListItem[];
              tv?: TmdbListItem[];
              krTv?: TmdbListItem[];
              jpTv?: TmdbListItem[];
              people?: TmdbPerson[];
              nowPlaying?: TmdbListItem[];
              onAir?: TmdbListItem[];
            };
          });

          const [doubanRes, tmdbRes] = await Promise.allSettled([
            doubanPromise,
            tmdbPromise,
          ]);

          if (doubanRes.status === 'fulfilled') {
            const doubanHome = doubanRes.value;
            setHotMovies(
              Array.isArray(doubanHome?.movies) ? doubanHome.movies : []
            );
            setHotTvShows(Array.isArray(doubanHome?.tv) ? doubanHome.tv : []);
            setLatestMoviesDouban(
              Array.isArray(doubanHome?.latestMovies)
                ? doubanHome.latestMovies
                : []
            );
            setLatestTvDouban(
              Array.isArray(doubanHome?.latestTv) ? doubanHome.latestTv : []
            );
            setHotVarietyShows(
              Array.isArray(doubanHome?.variety) ? doubanHome.variety : []
            );
          }

          if (tmdbRes.status === 'fulfilled') {
            const data = tmdbRes.value;
            setTmdbMovies(Array.isArray(data.movies) ? data.movies : []);
            setTmdbTv(Array.isArray(data.tv) ? data.tv : []);
            setTmdbKr(Array.isArray(data.krTv) ? data.krTv : []);
            setTmdbJp(Array.isArray(data.jpTv) ? data.jpTv : []);
            setTmdbPeople(Array.isArray(data.people) ? data.people : []);
            setTmdbNowPlaying(
              Array.isArray(data.nowPlaying) ? data.nowPlaying : []
            );
            setTmdbOnAir(Array.isArray(data.onAir) ? data.onAir : []);
          }

          if (doubanRes.status === 'rejected' && tmdbRes.status === 'rejected') {
            setError(true);
          }
        }

        const bangumiRes = await Promise.allSettled([bangumiPromise]);
        if (bangumiRes[0]?.status === 'fulfilled') {
          setBangumiCalendarData(bangumiRes[0].value);
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchRecommendData();
  }, [GetBangumiCalendarData]);

  const animeList = useMemo(() => {
    if (!bangumiCalendarData || bangumiCalendarData.length === 0) return [];
    const items: CardItem[] = [];
    bangumiCalendarData.forEach((day) => {
      day.items.forEach((anime) => {
        items.push({
          title: anime.name_cn || anime.name,
          poster:
            anime.images?.large ||
            anime.images?.common ||
            anime.images?.medium ||
            anime.images?.small ||
            anime.images?.grid,
          rate: anime.rating?.score ? anime.rating.score.toFixed(1) : '',
          year: anime.air_date?.split('-')?.[0] || '',
          douban_id: anime.id,
          type: 'tv',
        });
      });
    });
    return items.slice(0, 48);
  }, [bangumiCalendarData]);

  const tmdbMovieCards = useMemo(
    () =>
      (tmdbMovies || []).map((item) => ({
        title: item.title,
        title_en: item.originalTitle,
        poster: item.poster,
        posterAlt: [item.poster].filter(Boolean),
        posterTmdb: item.poster,
        tmdbUrl: `https://www.themoviedb.org/movie/${item.tmdbId?.replace('tmdb:', '') ?? ''}`,
        originalLanguage: item.originalLanguage,
        originCountry: item.originCountry,
        rate: '',
        year: item.year,
        type: 'movie',
        query: item.title,
        imdb_id: item.imdbId,
        douban_id: item.doubanId ? Number(item.doubanId) : undefined,
        source_name: 'TMDB',
        id: item.tmdbId,
      })),
    [tmdbMovies]
  );

  const tmdbTvCards = useMemo(
    () =>
      (tmdbTv || []).map((item) => ({
        title: item.title,
        title_en: item.originalTitle,
        poster: item.poster,
        posterAlt: [item.poster].filter(Boolean),
        posterTmdb: item.poster,
        tmdbUrl: `https://www.themoviedb.org/tv/${item.tmdbId?.replace('tmdb:', '') ?? ''}`,
        originalLanguage: item.originalLanguage,
        originCountry: item.originCountry,
        rate: '',
        year: item.year,
        type: 'tv',
        query: item.title,
        imdb_id: item.imdbId,
        douban_id: item.doubanId ? Number(item.doubanId) : undefined,
        source_name: 'TMDB',
        id: item.tmdbId,
      })),
    [tmdbTv]
  );

  const tmdbKrCards = useMemo(
    () =>
      (tmdbKr || []).map((item) => ({
        title: item.title,
        title_en: item.originalTitle,
        poster: item.poster,
        posterAlt: [item.poster].filter(Boolean),
        posterTmdb: item.poster,
        tmdbUrl: `https://www.themoviedb.org/tv/${item.tmdbId?.replace('tmdb:', '') ?? ''}`,
        originalLanguage: item.originalLanguage,
        originCountry: item.originCountry,
        rate: '',
        year: item.year,
        type: 'tv',
        query: item.title,
        imdb_id: item.imdbId,
        douban_id: item.doubanId ? Number(item.doubanId) : undefined,
        source_name: 'TMDB',
        id: item.tmdbId,
      })),
    [tmdbKr]
  );

  const tmdbJpCards = useMemo(
    () =>
      (tmdbJp || []).map((item) => ({
        title: item.title,
        title_en: item.originalTitle,
        poster: item.poster,
        posterAlt: [item.poster].filter(Boolean),
        posterTmdb: item.poster,
        tmdbUrl: `https://www.themoviedb.org/tv/${item.tmdbId?.replace('tmdb:', '') ?? ''}`,
        originalLanguage: item.originalLanguage,
        originCountry: item.originCountry,
        rate: '',
        year: item.year,
        type: 'tv',
        query: item.title,
        imdb_id: item.imdbId,
        douban_id: item.doubanId ? Number(item.doubanId) : undefined,
        source_name: 'TMDB',
        id: item.tmdbId,
      })),
    [tmdbJp]
  );

  const tmdbPeopleCards = useMemo(
    () =>
      (tmdbPeople || []).map((item) => ({
        title: item.title,
        poster: item.poster,
        rate: '',
        year: '',
        type: 'person',
        query: item.title,
        source_name: 'TMDB',
        id: item.tmdbId,
      })),
    [tmdbPeople]
  );

  const mapDoubanCards = useCallback(
    (items: DoubanItem[], type?: string): CardItem[] =>
      (items || []).map((item) => {
        const localizedTitle =
          uiLocale === 'zh-Hant'
            ? convertToTraditional(item.title)
            : uiLocale === 'en' && item.original_title
              ? item.original_title
              : item.title;
        const doubanUrl = `https://movie.douban.com/subject/${item.id}`;
        return {
          title: localizedTitle,
          poster: item.poster,
          posterAlt: [item.poster].filter(Boolean),
          posterDouban: item.poster,
          doubanUrl,
          rate: item.rate,
          year: item.year,
          douban_id: Number(item.id),
          type,
          query: localizedTitle,
        };
      }),
    [uiLocale]
  );

  const getCardKey = useCallback((item: CardItem) => {
    if (item.douban_id && item.douban_id > 0) return `douban:${item.douban_id}`;
    if (item.imdb_id) return `imdb:${item.imdb_id.toLowerCase()}`;
    const normTitle = (item.title || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');
    return `${normTitle}__${item.year || ''}`;
  }, []);

  const mergeCards = useCallback(
    (
      base: CardItem[],
      extras: CardItem[],
      addUnmatched = true,
      posterMap?: Map<string, string>
    ): CardItem[] => {
      const map = new Map<string, CardItem>();

      const mergeInto = (item: CardItem) => {
        const key = getCardKey(item);
        if (!key) return;
        const existing = map.get(key);
        if (!existing) {
          const alt = new Set(
            [
              ...(item.posterAlt || []),
              item.poster,
              item.posterDouban,
              item.posterTmdb,
            ].filter(Boolean)
          );
          map.set(key, { ...item, posterAlt: Array.from(alt) as string[] });
          if (posterMap && item.poster) posterMap.set(key, item.poster);
          return;
        }
        if (posterMap && !posterMap.has(key) && item.poster) {
          posterMap.set(key, item.poster);
        }
        const mergedDouban = existing.posterDouban || item.posterDouban;
        const mergedTmdb = existing.posterTmdb || item.posterTmdb;
        const mergedPoster =
          existing.poster ||
          item.poster ||
          mergedDouban ||
          mergedTmdb ||
          existing.posterAlt?.[0] ||
          item.posterAlt?.[0];
        const mergedAlt = new Set(
          [
            ...(existing.posterAlt || []),
            ...(item.posterAlt || []),
            existing.poster,
            item.poster,
            mergedDouban,
            mergedTmdb,
          ].filter(Boolean)
        );
        map.set(key, {
          ...existing,
          ...item,
          poster: mergedPoster,
          posterDouban: mergedDouban,
          posterTmdb: mergedTmdb,
          posterAlt: Array.from(mergedAlt) as string[],
          rate: existing.rate || item.rate,
          year: existing.year || item.year,
          query: existing.query || item.query,
          source_name: existing.source_name || item.source_name,
          type: existing.type || item.type,
          doubanUrl: existing.doubanUrl || item.doubanUrl,
          tmdbUrl: existing.tmdbUrl || item.tmdbUrl,
        });
      };

      base.forEach(mergeInto);
      extras.forEach((item) => {
        const key = getCardKey(item);
        const exists = key && map.has(key);
        if (exists || addUnmatched) mergeInto(item);
      });

      return Array.from(map.values());
    },
    [getCardKey]
  );

  const tmdbNowPlayingCards = useMemo(
    () =>
      (tmdbNowPlaying || []).map((item) => ({
        title: item.title,
        title_en: item.originalTitle,
        poster: item.poster,
        posterAlt: [item.poster].filter(Boolean),
        posterTmdb: item.poster,
        tmdbUrl: `https://www.themoviedb.org/movie/${item.tmdbId?.replace('tmdb:', '') ?? ''}`,
        originalLanguage: item.originalLanguage,
        originCountry: item.originCountry,
        rate: '',
        year: item.year,
        type: 'movie',
        query: item.title,
        imdb_id: item.imdbId,
        source_name: 'TMDB',
        id: item.tmdbId,
      })),
    [tmdbNowPlaying]
  );

  const tmdbOnAirCards = useMemo(
    () =>
      (tmdbOnAir || []).map((item) => ({
        title: item.title,
        title_en: item.originalTitle,
        poster: item.poster,
        posterAlt: [item.poster].filter(Boolean),
        posterTmdb: item.poster,
        tmdbUrl: `https://www.themoviedb.org/tv/${item.tmdbId?.replace('tmdb:', '') ?? ''}`,
        originalLanguage: item.originalLanguage,
        originCountry: item.originCountry,
        rate: '',
        year: item.year,
        type: 'tv',
        query: item.title,
        imdb_id: item.imdbId,
        source_name: 'TMDB',
        id: item.tmdbId,
      })),
    [tmdbOnAir]
  );

  const effectiveTmdbMovies = prefetchedHome?.tmdbMovies ?? tmdbMovieCards;
  const effectiveTmdbTv = prefetchedHome?.tmdbTv ?? tmdbTvCards;
  const effectiveTmdbPeople = prefetchedHome?.tmdbPeople ?? tmdbPeopleCards;
  const effectiveTmdbNowPlaying =
    prefetchedHome?.tmdbNowPlaying ?? tmdbNowPlayingCards;
  const effectiveTmdbOnAir = prefetchedHome?.tmdbOnAir ?? tmdbOnAirCards;
  const effectiveLatestMovies =
    prefetchedHome?.latestMovies ??
    mergeCards(mapDoubanCards(latestMoviesDouban, 'movie'), effectiveTmdbNowPlaying);
  const effectiveLatestTv =
    prefetchedHome?.latestTv ??
    mergeCards(mapDoubanCards(latestTvDouban, 'tv'), effectiveTmdbOnAir);

  const [hotTvShowsCn, hotTvShowsKr, hotTvShowsJp, hotTvShowsUsEu] = useMemo(() => {
    const krList: DoubanItem[] = [];
    const jpList: DoubanItem[] = [];
    const cnList: DoubanItem[] = [];
    const usEuList: DoubanItem[] = [];
    const regionFromItem = (item: DoubanItem) => {
      if (item.region === 'kr' || item.region === 'jp') return item.region;
      if (item.region === 'cn' || item.region === 'hk' || item.region === 'tw')
        return 'cn';
      const subtitle = (item.subtitle || '').toLowerCase();
      if (/韩|韓|korean|kr/.test(subtitle)) return 'kr';
      if (/日|japan|jp/.test(subtitle)) return 'jp';
      if (/日本动漫|日本動漫|日漫|動畫|动漫/.test(subtitle)) return 'jp';
      if (/中国|國|大陆|大陸|港|台|普通话|國語|華語|mandarin|zh/.test(subtitle))
        return 'cn';
      if (/(us|usa|uk|gb|british|england|europe|france|germany|german|spain|spanish|italy|italian|canada|australia)/.test(subtitle))
        return 'us';
      if (/美剧|美劇|英剧|英劇|欧美|歐美/.test(subtitle)) return 'us';
      return undefined;
    };
    const isKrJpTitle = (title?: string) => {
      if (!title) return false;
      if (/[가-힣]/.test(title)) return true;
      if (/[ぁ-ゔァ-ヴ]/.test(title)) return true;
      if (/韩|韓/.test(title)) return true;
      if (/日剧|日劇|日版|日本/.test(title)) return true;
      return false;
    };
    const isCnTitle = (title?: string) => {
      if (!title) return false;
      if (/中国|國|大陆|大陸|港|台|華語|华语/.test(title)) return true;
      return /[\u4e00-\u9fff]/.test(title);
    };
    (hotTvShows || []).forEach((item) => {
      const region = regionFromItem(item);
      if (region === 'kr') {
        krList.push(item);
      } else if (region === 'jp') {
        jpList.push(item);
      } else if (isKrJpTitle(item.title)) {
        jpList.push(item);
      } else if (region === 'cn' || isCnTitle(item.title)) {
        cnList.push(item);
      } else {
        usEuList.push(item);
      }
    });
    return [cnList, krList, jpList, usEuList];
  }, [hotTvShows]);

  const isKrTmdb = useCallback((item: CardItem) => {
    const lang = (item.originalLanguage || '').toLowerCase();
    if (lang === 'ko') return true;
    const countries = Array.isArray(item.originCountry) ? item.originCountry : [];
    if (countries.includes('KR')) return true;
    const title = item.title || '';
    if (/[가-힣]/.test(title)) return true;
    return /韩剧|韓劇|韓/.test(title);
  }, []);

  const isJpTmdb = useCallback((item: CardItem) => {
    const lang = (item.originalLanguage || '').toLowerCase();
    if (lang === 'ja') return true;
    const countries = Array.isArray(item.originCountry) ? item.originCountry : [];
    if (countries.includes('JP')) return true;
    const title = item.title || '';
    if (/[ぁ-ゔァ-ヴ]/.test(title)) return true;
    return /日剧|日劇|日版|日本/.test(title);
  }, []);

  const { categoryData, posterMap } = useMemo(() => {
    const posterMap = new Map<string, string>();

    if (prefetchedHome) {
      return {
        posterMap,
        categoryData: {
          movie: {
            label: uiLocale === 'en' ? 'Movies' : uiLocale === 'zh-Hans' ? '电影' : '電影',
            items: applyKidsFilter(prefetchedHome.movies || []),
            seeMore: '/douban?type=movie',
            hint: uiLocale === 'en' ? 'Cinema picks for today' : uiLocale === 'zh-Hans' ? '今日影院精选' : '今日影院精選',
          },
          'tv-cn': {
            label: uiLocale === 'en' ? 'Chinese TV' : uiLocale === 'zh-Hans' ? '华语剧集' : '華語劇集',
            items: applyKidsFilter(prefetchedHome.tvCn || []),
            seeMore: '/douban?type=tv&region=cn',
            hint: uiLocale === 'en' ? 'Domestic picks' : uiLocale === 'zh-Hans' ? '热门华语剧' : '熱門華語劇',
          },
          'tv-kr': {
            label: uiLocale === 'en' ? 'Korean TV' : uiLocale === 'zh-Hans' ? '韩剧' : '韓劇',
            items: applyKidsFilter(prefetchedHome.tvKr || []),
            seeMore: '/douban?type=tv&region=kr',
            hint: uiLocale === 'en' ? 'Korean hits' : uiLocale === 'zh-Hans' ? '热门韩剧' : '熱門韓劇',
          },
          'tv-jp': {
            label: uiLocale === 'en' ? 'Japanese TV' : uiLocale === 'zh-Hans' ? '日剧' : '日劇',
            items: applyKidsFilter(prefetchedHome.tvJp || []),
            seeMore: '/douban?type=tv&region=jp',
            hint: uiLocale === 'en' ? 'Japanese hits' : uiLocale === 'zh-Hans' ? '热门日剧' : '熱門日劇',
          },
          'tv-us': {
            label: uiLocale === 'en' ? 'US/Europe TV' : uiLocale === 'zh-Hans' ? '欧美剧集' : '歐美劇集',
            items: applyKidsFilter(prefetchedHome.tvUs || []),
            seeMore: '/douban?type=tv&region=us',
            hint: uiLocale === 'en' ? 'Western series' : uiLocale === 'zh-Hans' ? '热门欧美剧' : '熱門歐美劇',
          },
          variety: {
            label: uiLocale === 'en' ? 'Variety' : uiLocale === 'zh-Hans' ? '综艺' : '綜藝',
            items: applyKidsFilter(prefetchedHome.variety || []),
            seeMore: '/douban?type=show',
            hint: uiLocale === 'en' ? 'Light entertainment' : uiLocale === 'zh-Hans' ? '轻松综艺' : '輕鬆綜藝',
          },
          anime: {
            label: uiLocale === 'en' ? 'Anime' : uiLocale === 'zh-Hans' ? '新番' : '新番',
            items: applyKidsFilter(animeList),
            seeMore: '/douban?type=anime',
            hint: uiLocale === 'en' ? 'Fresh episodes' : uiLocale === 'zh-Hans' ? '最新更新' : '最新更新',
          },
        },
      };
    }

    const mergedMovies = mergeCards(
      mapDoubanCards(hotMovies, 'movie'),
      tmdbMovieCards,
      true,
      posterMap
    );
    const mergedTvCn = mergeCards(
      mapDoubanCards(hotTvShowsCn, 'tv'),
      tmdbTvCards,
      false,
      posterMap
    );
    const tmdbTvKr = mergeCards(
      tmdbTvCards.filter(isKrTmdb),
      tmdbKrCards,
      true,
      posterMap
    );
    const tmdbTvJp = mergeCards(
      tmdbTvCards.filter(isJpTmdb),
      tmdbJpCards,
      true,
      posterMap
    );
    const mergedTvKr = mergeCards(
      mapDoubanCards(hotTvShowsKr, 'tv'),
      tmdbTvKr,
      true,
      posterMap
    );
    const mergedTvJp = mergeCards(
      mapDoubanCards(hotTvShowsJp, 'tv'),
      tmdbTvJp,
      true,
      posterMap
    );
    const mergedTvUs = mergeCards(
      mapDoubanCards(hotTvShowsUsEu, 'tv'),
      tmdbTvCards,
      true,
      posterMap
    );

    return {
      posterMap,
      categoryData: {
        movie: {
          label: uiLocale === 'en' ? 'Movies' : uiLocale === 'zh-Hans' ? '电影' : '電影',
          items: applyKidsFilter(mergedMovies),
          seeMore: '/douban?type=movie',
          hint: uiLocale === 'en' ? 'Cinema picks for today' : uiLocale === 'zh-Hans' ? '今日影院精选' : '今日影院精選',
        },
        'tv-cn': {
          label: uiLocale === 'en' ? 'Chinese TV' : uiLocale === 'zh-Hans' ? '华语剧集' : '華語劇集',
          items: applyKidsFilter(mergedTvCn),
          seeMore: '/douban?type=tv&region=cn',
          hint: uiLocale === 'en' ? 'Domestic picks' : uiLocale === 'zh-Hans' ? '热门华语剧' : '熱門華語劇',
        },
        'tv-kr': {
          label: uiLocale === 'en' ? 'Korean TV' : uiLocale === 'zh-Hans' ? '韩剧' : '韓劇',
          items: applyKidsFilter(mergedTvKr),
          seeMore: '/douban?type=tv&region=kr',
          hint: uiLocale === 'en' ? 'Korean hits' : uiLocale === 'zh-Hans' ? '热门韩剧' : '熱門韓劇',
        },
        'tv-jp': {
          label: uiLocale === 'en' ? 'Japanese TV' : uiLocale === 'zh-Hans' ? '日剧' : '日劇',
          items: applyKidsFilter(mergedTvJp),
          seeMore: '/douban?type=tv&region=jp',
          hint: uiLocale === 'en' ? 'Japanese hits' : uiLocale === 'zh-Hans' ? '热门日剧' : '熱門日劇',
        },
        'tv-us': {
          label: uiLocale === 'en' ? 'US/Europe TV' : uiLocale === 'zh-Hans' ? '欧美剧集' : '歐美劇集',
          items: applyKidsFilter(mergedTvUs),
          seeMore: '/douban?type=tv&region=us',
          hint: uiLocale === 'en' ? 'Western series' : uiLocale === 'zh-Hans' ? '热门欧美剧' : '熱門歐美劇',
        },
        variety: {
          label: uiLocale === 'en' ? 'Variety' : uiLocale === 'zh-Hans' ? '综艺' : '綜藝',
          items: applyKidsFilter(mapDoubanCards(hotVarietyShows, 'show')),
          seeMore: '/douban?type=show',
          hint: uiLocale === 'en' ? 'Light entertainment' : uiLocale === 'zh-Hans' ? '轻松综艺' : '輕鬆綜藝',
        },
        anime: {
          label: uiLocale === 'en' ? 'Anime' : uiLocale === 'zh-Hans' ? '新番' : '新番',
          items: applyKidsFilter(animeList),
          seeMore: '/douban?type=anime',
          hint: uiLocale === 'en' ? 'Fresh episodes' : uiLocale === 'zh-Hans' ? '最新更新' : '最新更新',
        },
      },
    };
  }, [
    prefetchedHome,
    uiLocale,
    applyKidsFilter,
    animeList,
    hotMovies,
    hotTvShowsCn,
    hotTvShowsKr,
    hotTvShowsJp,
    hotTvShowsUsEu,
    hotVarietyShows,
    tmdbMovieCards,
    tmdbTvCards,
    tmdbKrCards,
    tmdbJpCards,
    mapDoubanCards,
    mergeCards,
    isKrTmdb,
    isJpTmdb,
  ]);

  const heroItems = useMemo(
    () => (categoryData[category]?.items || []).slice(0, 10),
    [categoryData, category]
  );

  const applyPosterOverrides = useCallback(
    (items: CardItem[]) => {
      if (posterMap.size === 0) return items;
      return items.map((item) => {
        const key = getCardKey(item);
        const override = key ? posterMap.get(key) : undefined;
        if (override && override !== item.poster) {
          return { ...item, poster: override };
        }
        return item;
      });
    },
    [posterMap, getCardKey]
  );

  return {
    loading,
    error,
    categoryData,
    heroItems,
    effectiveTmdbMovies,
    effectiveLatestMovies,
    effectiveTmdbTv,
    effectiveLatestTv,
    effectiveTmdbPeople,
    applyKidsFilter,
    applyPosterOverrides,
  };
};
