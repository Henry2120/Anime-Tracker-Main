export interface JikanSeasonalAnime {
  mal_id: number;
  title: string;
  images?: any;
  score?: number;
  episodes?: number;
  season?: string;
  year?: number;
  aired?: any;
}

export interface JikanSeasonResponse {
  year: number;
  season: string;
  data: JikanSeasonalAnime[];
}

export interface JikanAnimeResponse {
  mal_id: number;
  title?: string;
  year?: number;
  season?: string;
  start_date?: string;
  is_summer_2026: boolean;
}

/**
 * Fetches the complete paginated seasonal anime list from Jikan via the backend proxy
 */
export async function fetchJikanSeasonCatalogue(
  year: number = 2026,
  season: string = 'summer'
): Promise<JikanSeasonalAnime[]> {
  try {
    const res = await fetch(`/api/jikan/season/${year}/${season}`);
    if (!res.ok) {
      return [];
    }
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return [];
    }
    const data: JikanSeasonResponse = await res.json();
    return Array.isArray(data.data) ? data.data : [];
  } catch (err) {
    console.warn(`Could not load Jikan seasonal catalogue:`, err);
    return [];
  }
}

/**
 * Fallback to check an individual anime on Jikan if missing from the seasonal catalogue
 */
export async function fetchJikanAnimeInfo(malId: number): Promise<JikanAnimeResponse | null> {
  try {
    const res = await fetch(`/api/jikan/anime/${malId}`);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return null;
    }
    return await res.json();
  } catch (err) {
    return null;
  }
}
