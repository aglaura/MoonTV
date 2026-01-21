'use client';

import { useEffect, useMemo, useState } from 'react';

import type { CardItem, TvRegion } from '@/lib/home.types';
import {
  getAllPlayRecords,
  subscribeToDataUpdates,
  type PlayRecord,
} from '@/lib/db.client';

type ActorSourceItem = {
  tmdb_id?: string;
  imdb_id?: string;
  douban_id?: number;
  title?: string;
  year?: string;
  type?: 'movie' | 'tv';
  weight: number;
};

type UseHomeActorRailParams = {
  airingItems: CardItem[];
  regionalItems: CardItem[];
  activeRegion: TvRegion;
  fallbackItems: CardItem[];
};

const MAX_CONTINUE_ITEMS = 6;
const MAX_AIRING_ITEMS = 8;
const MAX_REGIONAL_ITEMS = 8;
const MAX_SOURCE_ITEMS = 12;

const normalizeTitleKey = (value?: string) =>
  (value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const buildSourceKey = (item: ActorSourceItem) => {
  const tmdbId = item.tmdb_id?.toString().trim();
  if (tmdbId) return `tmdb:${tmdbId.replace(/^tmdb:/, '')}`;
  const imdbId = item.imdb_id?.toString().toLowerCase();
  if (imdbId) return `imdb:${imdbId}`;
  if (item.douban_id && Number.isFinite(item.douban_id)) {
    return `douban:${item.douban_id}`;
  }
  const titleKey = normalizeTitleKey(item.title);
  if (!titleKey) return '';
  return `title:${titleKey}:${(item.year || '').toString().trim()}`;
};

const toSourceItem = (
  item: Partial<ActorSourceItem>,
  weight: number
): ActorSourceItem => ({
  tmdb_id: item.tmdb_id,
  imdb_id: item.imdb_id,
  douban_id: item.douban_id,
  title: item.title,
  year: item.year,
  type: item.type,
  weight,
});

const buildSourceMap = (items: ActorSourceItem[]) => {
  const map = new Map<string, ActorSourceItem>();
  items.forEach((item) => {
    const key = buildSourceKey(item);
    if (!key) return;
    const existing = map.get(key);
    if (existing) {
      map.set(key, {
        ...existing,
        weight: existing.weight + item.weight,
      });
      return;
    }
    map.set(key, item);
  });
  return map;
};

const mapCardType = (type?: CardItem['type']): ActorSourceItem['type'] => {
  if (type === 'movie' || type === 'tv') return type;
  return undefined;
};

const mapRecordType = (record: PlayRecord): ActorSourceItem['type'] => {
  if (record.total_episodes && record.total_episodes > 1) return 'tv';
  return 'movie';
};

export const useHomeActorRail = ({
  airingItems,
  regionalItems,
  activeRegion,
  fallbackItems,
}: UseHomeActorRailParams) => {
  const [playRecords, setPlayRecords] = useState<PlayRecord[]>([]);
  const [actorItems, setActorItems] = useState<CardItem[]>(fallbackItems || []);

  useEffect(() => {
    const fetchRecords = async () => {
      try {
        const allRecords = await getAllPlayRecords();
        const records = Object.values(allRecords || {}).sort(
          (a, b) => b.save_time - a.save_time
        );
        setPlayRecords(records);
      } catch {
        setPlayRecords([]);
      }
    };

    fetchRecords();

    const unsubscribe = subscribeToDataUpdates(
      'playRecordsUpdated',
      (newRecords: Record<string, PlayRecord>) => {
        try {
          const records = Object.values(newRecords || {}).sort(
            (a, b) => b.save_time - a.save_time
          );
          setPlayRecords(records);
        } catch {
          setPlayRecords([]);
        }
      }
    );

    return unsubscribe;
  }, []);

  const sourceItems = useMemo(() => {
    const sources: ActorSourceItem[] = [];

    playRecords.slice(0, MAX_CONTINUE_ITEMS).forEach((record) => {
      sources.push(
        toSourceItem(
          {
            imdb_id: record.imdbId,
            douban_id: record.douban_id,
            title: record.search_title || record.title,
            year: record.year,
            type: mapRecordType(record),
          },
          5
        )
      );
    });

    airingItems.slice(0, MAX_AIRING_ITEMS).forEach((item) => {
      if (item.type === 'person') return;
      sources.push(
        toSourceItem(
          {
            tmdb_id: item.tmdb_id,
            imdb_id: item.imdb_id,
            douban_id: item.douban_id,
            title: item.title,
            year: item.year,
            type: mapCardType(item.type),
          },
          3
        )
      );
    });

    regionalItems.slice(0, MAX_REGIONAL_ITEMS).forEach((item) => {
      if (item.type === 'person') return;
      sources.push(
        toSourceItem(
          {
            tmdb_id: item.tmdb_id,
            imdb_id: item.imdb_id,
            douban_id: item.douban_id,
            title: item.title,
            year: item.year,
            type: mapCardType(item.type),
          },
          2
        )
      );
    });

    const map = buildSourceMap(sources);
    return Array.from(map.values())
      .sort((a, b) => b.weight - a.weight)
      .slice(0, MAX_SOURCE_ITEMS);
  }, [playRecords, airingItems, regionalItems]);

  const sourceKey = useMemo(
    () =>
      JSON.stringify(
        sourceItems.map((item) => ({
          tmdb_id: item.tmdb_id,
          imdb_id: item.imdb_id,
          douban_id: item.douban_id,
          title: item.title,
          year: item.year,
          type: item.type,
          weight: item.weight,
        }))
      ),
    [sourceItems]
  );

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!sourceItems.length) {
        setActorItems(fallbackItems || []);
        return;
      }

      try {
        const res = await fetch('/api/home/actors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: sourceItems,
            region: activeRegion,
          }),
        });
        if (!res.ok) throw new Error(`Actor rail fetch failed ${res.status}`);
        const data = (await res.json()) as { actors?: CardItem[] };
        if (!cancelled) {
          const next = Array.isArray(data?.actors) ? data.actors : [];
          setActorItems(next.length ? next : fallbackItems || []);
        }
      } catch {
        if (!cancelled) {
          setActorItems(fallbackItems || []);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [sourceKey, activeRegion, fallbackItems, sourceItems]);

  return actorItems;
};
