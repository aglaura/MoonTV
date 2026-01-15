'use client';

export interface OMDBRating {
  Source: string; // "Internet Movie Database", "Rotten Tomatoes", "Metacritic"
  Value: string; // e.g., "8.5/10", "95%", "72/100"
}

export interface OMDBData {
  Title: string;
  Year: string;
  Rated: string;
  Released: string;
  Runtime: string;
  Genre: string;
  Director: string;
  Writer: string;
  Actors: string;
  Plot: string;
  Language: string;
  Country: string;
  Awards: string;
  Poster: string;
  Ratings: OMDBRating[];
  Metascore: string;
  imdbRating: string;
  imdbVotes: string;
  imdbID: string;
  Type: string;
  DVD: string;
  BoxOffice: string;
  Production: string;
  Website: string;
  Response: string;
}

export interface OMDBEnrichment {
  imdbRating?: string;
  imdbVotes?: string;
  metascore?: string;
  rottenTomatoesScore?: string;
  awards?: string;
  runtime?: string;
  rated?: string; // PG, R, etc.
  boxOffice?: string;
  production?: string;
}

/**
 * Fetch OMDb data for a given IMDb ID
 * Requires NEXT_PUBLIC_OMDB_API_KEY environment variable
 */
export async function getOMDBData(imdbId: string): Promise<OMDBEnrichment | null> {
  const apiKey = process.env.NEXT_PUBLIC_OMDB_API_KEY;
  
  if (!apiKey) {
    console.warn('NEXT_PUBLIC_OMDB_API_KEY not configured');
    return null;
  }

  if (!imdbId || !imdbId.match(/^(tt\d{5,}|imdbt\d+)$/i)) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const url = new URL('https://www.omdbapi.com/');
    url.searchParams.set('i', imdbId);
    url.searchParams.set('apikey', apiKey);
    url.searchParams.set('type', 'movie'); // or 'series', but we default to movie

    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      },
      cache: 'force-cache',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`OMDb API error: ${response.status}`);
      return null;
    }

    const data: OMDBData = await response.json();

    if (data.Response === 'False') {
      console.warn(`OMDb: ${data.Error || 'Unknown error'}`);
      return null;
    }

    // Extract ratings from array
    let rottenTomatoesScore: string | undefined;
    if (Array.isArray(data.Ratings)) {
      const rtRating = data.Ratings.find(
        (r) => r.Source?.toLowerCase().includes('rotten')
      );
      if (rtRating) {
        rottenTomatoesScore = rtRating.Value;
      }
    }

    return {
      imdbRating: data.imdbRating !== 'N/A' ? data.imdbRating : undefined,
      imdbVotes: data.imdbVotes !== 'N/A' ? data.imdbVotes : undefined,
      metascore: data.Metascore !== 'N/A' ? data.Metascore : undefined,
      rottenTomatoesScore: rottenTomatoesScore,
      awards: data.Awards !== 'N/A' ? data.Awards : undefined,
      runtime: data.Runtime !== 'N/A' ? data.Runtime : undefined,
      rated: data.Rated !== 'N/A' ? data.Rated : undefined,
      boxOffice: data.BoxOffice !== 'N/A' ? data.BoxOffice : undefined,
      production: data.Production !== 'N/A' ? data.Production : undefined,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.warn('OMDb fetch timeout');
    } else {
      console.warn('OMDb fetch error:', error);
    }
    return null;
  }
}

/**
 * Format IMDb rating with vote count
 */
export function formatIMDbRating(rating?: string, votes?: string): string {
  if (!rating) return '';
  const voteText = votes ? ` (${parseInt(votes).toLocaleString()} votes)` : '';
  return `${rating}${voteText}`;
}

/**
 * Format Rotten Tomatoes score
 */
export function formatRottenTomatoesScore(score?: string): string {
  if (!score) return '';
  // Score format: "95%"
  return score;
}

/**
 * Format Metacritic score
 */
export function formatMetacriticScore(score?: string): string {
  if (!score) return '';
  // Score format: "72" (out of 100)
  return `${score}/100`;
}
