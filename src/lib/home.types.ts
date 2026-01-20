export type UiLocale = 'en' | 'zh-Hans' | 'zh-Hant';
export type TvRegion = 'cn' | 'kr' | 'jp' | 'en';

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
  castMembers?: TmdbCastMember[];
  directors?: string[];
  imdbId?: string;
  doubanId?: string;
};

export type TmdbCastMember = {
  tmdbId?: string;
  name?: string;
  profile?: string;
};

export type TmdbPerson = {
  tmdbId: string;
  title: string;
  poster: string;
};

export type OmdbContribution = {
  imdbRating?: string;
  ratings?: Array<{
    source: 'Internet Movie Database' | 'Rotten Tomatoes' | 'Metacritic';
    value: string;
  }>;
  runtime?: string;
  awards?: string;
  plot?: string;
};

export type CardItem = {
  title: string;
  title_en?: string;
  poster?: string;
  posterAlt?: string[];
  posterDouban?: string;
  posterTmdb?: string;
  sources?: {
    omdb?: OmdbContribution;
  };
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
  tmdb_id?: string;
  type?: 'tv' | 'movie' | 'person' | 'show';
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
  | 'airing'
  | 'regional'
  | 'animation'
  | 'variety'
  | 'movies';

export type CategoryConfig = {
  label: string;
  items: CardItem[];
  seeMore?: string;
  hint: string;
};

export type CategoryData = Record<CategoryKey, CategoryConfig>;
