export type UiLocale = 'en' | 'zh-Hans' | 'zh-Hant';

export type TmdbListItem = {
  tmdbId: string;
  title: string;
  year: string;
  poster: string;
  originalTitle?: string;
  mediaType?: 'movie' | 'tv';
  originalLanguage?: string;
  originCountry?: string[];
  certification?: string;
  genres?: string[];
  providers?: string[];
  voteAverage?: number;
  cast?: string[];
  directors?: string[];
  imdbId?: string;
  doubanId?: string;
};

export type TmdbPerson = {
  tmdbId: string;
  title: string;
  poster: string;
};

export type CardItem = {
  title: string;
  title_en?: string;
  poster?: string;
  posterAlt?: string[];
  posterDouban?: string;
  posterTmdb?: string;
  profile?: string;
  profile_path?: string;
  doubanUrl?: string;
  tmdbUrl?: string;
  originalLanguage?: string;
  originCountry?: string[];
  rate?: string;
  year?: string;
  douban_id?: number;
  imdb_id?: string;
  type?: string;
  query?: string;
  source_name?: string;
  id?: string | number;
};

export type PrefetchedHome = {
  movies: CardItem[];
  tvCn: CardItem[];
  tvKr: CardItem[];
  tvJp: CardItem[];
  tvUs: CardItem[];
  variety: CardItem[];
  latestMovies: CardItem[];
  latestTv: CardItem[];
  tmdbMovies: CardItem[];
  tmdbTv: CardItem[];
  tmdbKr?: CardItem[];
  tmdbJp?: CardItem[];
  tmdbPeople: CardItem[];
  tmdbNowPlaying: CardItem[];
  tmdbOnAir: CardItem[];
  updatedAt?: number;
};

export type CategoryKey =
  | 'movie'
  | 'tv-cn'
  | 'tv-kr'
  | 'tv-jp'
  | 'tv-us'
  | 'variety'
  | 'anime';

export type TvSectionId =
  | 'continue'
  | 'category'
  | 'hero'
  | 'spotlight'
  | 'rail-movie'
  | 'rail-tv'
  | 'rail-variety';

export type CategoryConfig = {
  label: string;
  items: CardItem[];
  seeMore?: string;
  hint: string;
};

export type CategoryData = Record<CategoryKey, CategoryConfig>;
