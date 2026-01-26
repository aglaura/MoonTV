'use client';

import Image from 'next/image';
import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';
import { useUserLanguage } from '@/lib/userLanguage.client';
import { processImageUrl } from '@/lib/utils';

type Credit = {
  tmdbId?: string;
  title: string;
  poster: string;
  year: string;
  mediaType?: 'movie' | 'tv';
  character?: string;
  job?: string;
};

type PersonInfo = {
  id?: number;
  name: string;
  biography: string;
  birthday: string;
  deathday: string;
  placeOfBirth: string;
  knownFor: string;
  profile: string;
  homepage: string;
  imdbId: string;
  alsoKnownAs?: string[];
  nameVariants?: Record<string, string[]>;
};

type PersonPayload = {
  person: PersonInfo;
  credits: {
    cast: Credit[];
    crew: Credit[];
  };
};

const normalizeParam = (param?: string | string[]) => {
  if (!param) return '';
  const value = Array.isArray(param) ? param[0] : param;
  return decodeURIComponent(value).trim();
};

const buildTmdbPersonUrl = (id?: number | string) => {
  if (!id) return '';
  const raw = String(id).replace(/^tmdb:/, '');
  return raw ? `https://www.themoviedb.org/person/${raw}` : '';
};

const buildImdbUrl = (id?: string) => {
  if (!id) return '';
  return `https://www.imdb.com/name/${id}`;
};

export default function PersonPage() {
  const { userLocale } = useUserLanguage();
  const locale =
    userLocale === 'zh-Hans' || userLocale === 'zh-Hant' ? userLocale : 'en';
  const tt = useCallback(
    (en: string, zhHans: string, zhHant: string) => {
      if (locale === 'zh-Hans') return zhHans;
      if (locale === 'zh-Hant') return zhHant;
      return en;
    },
    [locale]
  );

  const params = useParams();
  const searchParams = useSearchParams();
  const personId = useMemo(
    () => normalizeParam(params?.id as string | string[] | undefined),
    [params]
  );
  const posterParam = useMemo(() => {
    const raw = searchParams?.get('poster') || '';
    return raw.trim();
  }, [searchParams]);

  const [data, setData] = useState<PersonPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!personId) {
      setError(tt('Missing person id.', '缺少影人编号。', '缺少影人編號。'));
      setLoading(false);
      return;
    }

    let isActive = true;
    setLoading(true);
    setError('');

    const fetchPerson = async () => {
      try {
        const res = await fetch(
          `/api/tmdb/person?id=${encodeURIComponent(personId)}`
        );
        if (!res.ok) {
          let message = `HTTP ${res.status}`;
          try {
            const payload = await res.json();
            if (payload?.error) message = payload.error;
          } catch {
            // ignore JSON parse errors
          }
          throw new Error(message);
        }
        const payload = (await res.json()) as PersonPayload;
        if (!isActive) return;
        setData(payload);
      } catch (err) {
        if (!isActive) return;
        const message =
          err instanceof Error
            ? err.message
            : tt('Failed to load person details.', '加载影人失败。', '載入影人失敗。');
        setError(message);
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    fetchPerson();

    return () => {
      isActive = false;
    };
  }, [personId, tt]);

  const person = data?.person;
  const castCredits = data?.credits?.cast ?? [];
  const crewCredits = data?.credits?.crew ?? [];
  const localizedNames = person?.nameVariants || {};
  const localeNameOrder: Array<{ key: string; label: string }> = [
    { key: 'en', label: 'English' },
    { key: 'zh-Hans', label: '简体中文' },
    { key: 'zh-Hant', label: '繁體中文' },
    { key: 'ja', label: '日本語' },
    { key: 'ko', label: '한국어' },
    { key: 'fr', label: 'Français' },
    { key: 'de', label: 'Deutsch' },
    { key: 'es', label: 'Español' },
  ];

  const safeProcessImageUrl = useCallback((value: string) => {
    if (!value) return '';
    const processed = processImageUrl(value, { preferCached: true });
    return processed.startsWith('/api/image-proxy') ? value : processed;
  }, []);
  const fallbackProfileUrl = posterParam ? safeProcessImageUrl(posterParam) : '';
  const profileUrl = person?.profile
    ? safeProcessImageUrl(person.profile)
    : fallbackProfileUrl;
  const tmdbUrl = buildTmdbPersonUrl(person?.id || personId);
  const imdbUrl = buildImdbUrl(person?.imdbId);

  const buildRoleLabel = useCallback(
    (credit: Credit) => {
      if (credit.character) {
        return `${tt('as', '饰', '飾')} ${credit.character}`;
      }
      if (credit.job) return credit.job;
      return '';
    },
    [tt]
  );

  return (
    <PageLayout activePath="/person">
      <div className="px-5 sm:px-8 lg:px-10 py-8 lg:py-12">
        {loading && (
          <div className="max-w-6xl mx-auto rounded-3xl border border-gray-200/70 dark:border-gray-800 bg-white/80 dark:bg-gray-900/70 p-8 text-center text-gray-500">
            {tt('Loading person…', '正在加载影人…', '正在載入影人…')}
          </div>
        )}

        {!loading && error && (
          <div className="max-w-6xl mx-auto rounded-3xl border border-rose-200/60 dark:border-rose-500/40 bg-rose-50/80 dark:bg-rose-900/20 p-8 text-center text-rose-600 dark:text-rose-300">
            {error}
          </div>
        )}

        {!loading && !error && person && (
          <div className="max-w-6xl mx-auto space-y-10">
            <section className="relative overflow-hidden rounded-3xl border border-gray-200/60 dark:border-gray-800 bg-white/85 dark:bg-gray-900/70">
              {profileUrl && (
                <div className="absolute inset-0">
                  <Image
                    src={profileUrl}
                    alt={person.name}
                    fill
                    sizes="100vw"
                    className="object-cover opacity-20 scale-110 blur-2xl"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-white/90 via-white/70 to-white/30 dark:from-gray-900/90 dark:via-gray-900/70 dark:to-gray-900/30" />
                </div>
              )}
              <div className="relative z-10 grid gap-6 p-6 md:p-8 md:grid-cols-[220px_1fr]">
                <div className="flex justify-center md:justify-start">
                  <div className="relative w-40 h-40 md:w-52 md:h-52 rounded-full overflow-hidden bg-gray-200/70 dark:bg-gray-800 ring-2 ring-emerald-500/30 shadow-lg">
                    {profileUrl ? (
                      <Image
                        src={profileUrl}
                        alt={person.name}
                        fill
                        sizes="208px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-3xl font-semibold text-gray-500">
                        {person.name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-emerald-500/80">
                      {tt('Featured talent', '焦点影人', '焦點影人')}
                    </p>
                    <h1 className="text-3xl md:text-4xl font-semibold text-gray-900 dark:text-gray-100">
                      {person.name}
                    </h1>
                    {person.knownFor && (
                      <p className="text-sm text-gray-500 dark:text-gray-300 mt-1">
                        {person.knownFor}
                      </p>
                    )}
                    {person.alsoKnownAs && person.alsoKnownAs.length > 0 && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        {tt('Also known as', '别名', '別名')}:{' '}
                        {person.alsoKnownAs.slice(0, 6).join(' · ')}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-gray-600 dark:text-gray-300">
                    {person.birthday && (
                      <span className="px-3 py-1 rounded-full border border-gray-200/70 dark:border-gray-700/70 bg-white/70 dark:bg-white/5">
                        {tt('Born', '出生', '出生')} {person.birthday}
                      </span>
                    )}
                    {person.deathday && (
                      <span className="px-3 py-1 rounded-full border border-gray-200/70 dark:border-gray-700/70 bg-white/70 dark:bg-white/5">
                        {tt('Died', '去世', '去世')} {person.deathday}
                      </span>
                    )}
                    {person.placeOfBirth && (
                      <span className="px-3 py-1 rounded-full border border-gray-200/70 dark:border-gray-700/70 bg-white/70 dark:bg-white/5">
                        {person.placeOfBirth}
                      </span>
                    )}
                  </div>
                  {Object.keys(localizedNames).length > 0 && (
                    <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                      <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                        {tt('Names in other languages', '多语言名字', '多語言名字')}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {localeNameOrder.map((entry) => {
                          const names = localizedNames[entry.key];
                          if (!names || names.length === 0) return null;
                          return (
                            <span
                              key={entry.key}
                              className="px-3 py-1 rounded-full border border-gray-200/70 dark:border-gray-700/70 bg-white/70 dark:bg-white/5"
                            >
                              {entry.label}: {names.slice(0, 2).join(' / ')}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-3 text-sm">
                    {tmdbUrl && (
                      <a
                        href={tmdbUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2 rounded-full bg-emerald-500 text-white font-semibold shadow-sm hover:bg-emerald-600"
                      >
                        {tt('TMDB Profile', 'TMDB 页面', 'TMDB 頁面')}
                      </a>
                    )}
                    {imdbUrl && (
                      <a
                        href={imdbUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2 rounded-full border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-emerald-400"
                      >
                        {tt('IMDb', 'IMDb', 'IMDb')}
                      </a>
                    )}
                    {person.homepage && (
                      <a
                        href={person.homepage}
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2 rounded-full border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-emerald-400"
                      >
                        {tt('Homepage', '主页', '主頁')}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-gray-200/70 dark:border-gray-800 bg-white/85 dark:bg-gray-900/70 p-6 md:p-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
                {tt('Biography', '影人简介', '影人簡介')}
              </h2>
              <p className="text-sm leading-7 text-gray-600 dark:text-gray-300 whitespace-pre-line">
                {person.biography
                  ? person.biography
                  : tt('No biography available.', '暂无简介。', '暫無簡介。')}
              </p>
            </section>

            <section className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                    {tt('Acting', '参演作品', '參演作品')}
                  </h2>
                  <span className="text-xs text-gray-500">
                    {castCredits.length}
                  </span>
                </div>
                {castCredits.length === 0 ? (
                  <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800 bg-white/80 dark:bg-gray-900/70 p-4 text-sm text-gray-500">
                    {tt('No acting credits yet.', '暂无参演记录。', '暫無參演記錄。')}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                    {castCredits.slice(0, 20).map((credit) => (
                      <div key={`${credit.tmdbId}-${credit.title}`}>
                        <VideoCard
                          from="douban"
                          title={credit.title}
                          poster={credit.poster}
                          year={credit.year}
                          type={credit.mediaType}
                          query={credit.title}
                          source_name="TMDB"
                          id={credit.tmdbId}
                        />
                        {buildRoleLabel(credit) && (
                          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                            {buildRoleLabel(credit)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                    {tt('Behind the scenes', '幕后作品', '幕後作品')}
                  </h2>
                  <span className="text-xs text-gray-500">
                    {crewCredits.length}
                  </span>
                </div>
                {crewCredits.length === 0 ? (
                  <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800 bg-white/80 dark:bg-gray-900/70 p-4 text-sm text-gray-500">
                    {tt('No crew credits yet.', '暂无幕后记录。', '暫無幕後記錄。')}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                    {crewCredits.slice(0, 20).map((credit) => (
                      <div key={`${credit.tmdbId}-${credit.title}`}>
                        <VideoCard
                          from="douban"
                          title={credit.title}
                          poster={credit.poster}
                          year={credit.year}
                          type={credit.mediaType}
                          query={credit.title}
                          source_name="TMDB"
                          id={credit.tmdbId}
                        />
                        {buildRoleLabel(credit) && (
                          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                            {buildRoleLabel(credit)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
