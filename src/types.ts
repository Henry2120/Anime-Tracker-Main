export interface AnimeImageFormat {
  image_url: string;
  small_image_url?: string;
  large_image_url?: string;
}

export interface AnimeImages {
  jpg: AnimeImageFormat;
  webp?: AnimeImageFormat;
}

export interface Anime {
  mal_id: number;
  title: string;
  title_english?: string;
  images: AnimeImages;
  score: number | null;
  episodes: number | null;
  type?: string;
  status?: string;
  rating?: string;
  synopsis?: string;
}

export interface JikanApiResponse {
  data: Anime[];
}

export interface MalUser {
  id: number;
  name: string;
  picture?: string;
  location?: string;
  joined_at?: string;
}

export interface MalAnimeNode {
  id: number;
  title: string;
  main_picture?: {
    medium?: string;
    large?: string;
  };
  num_episodes?: number;
  synopsis?: string;
  mean?: number;
  status?: string;
  media_type?: string;
  start_date?: string;
  end_date?: string;
  start_season?: {
    year?: number;
    season?: string;
  };
  broadcast?: {
    day_of_the_week?: string;
    start_time?: string;
  };
  source?: string;
  genres?: Array<{ id: number; name: string }>;
  alternative_titles?: {
    synonyms?: string[];
    en?: string;
    ja?: string;
  };
}

export interface MalListStatus {
  status: 'watching' | 'completed' | 'on_hold' | 'dropped' | 'plan_to_watch' | string;
  score: number;
  num_episodes_watched: number;
  is_rewatching?: boolean;
  start_date?: string;
  finish_date?: string;
  updated_at?: string;
  comments?: string;
  tags?: string[] | string;
  priority?: number;
  num_times_rewatched?: number;
  rewatch_value?: number;
}

export interface MalUpdateStatusPayload {
  status?: 'watching' | 'completed' | 'on_hold' | 'dropped' | 'plan_to_watch';
  score?: number;
  num_watched_episodes?: number;
  num_episodes_watched?: number;
  is_rewatching?: boolean;
  start_date?: string;
  finish_date?: string;
  comments?: string;
  comment?: string;
  notes?: string;
  tags?: string | string[];
  priority?: number;
  num_times_rewatched?: number;
  rewatch_value?: number;
}

export interface MalListItem {
  node: MalAnimeNode;
  list_status: MalListStatus;
}

export interface MalUserListResponse {
  data: MalListItem[];
  paging?: {
    next?: string;
  };
}

export interface SeasonalAnimeNode extends MalAnimeNode {}

export interface SeasonalAnimeItem {
  node: SeasonalAnimeNode;
}

export interface ReleaseCalendarItem {
  id: number;
  malId: number | null;
  anilistId: number;
  title: {
    romaji: string;
    english: string;
    native: string;
    userPreferred: string;
  };
  titleEnglish?: string | null;
  titleNative?: string | null;
  titleRomaji?: string | null;
  hasEnglishTitle?: boolean;
  totalEpisodes?: number | null;
  displayTitle?: string;
  episode: number | null;
  airingAt: number; // unix timestamp in seconds
  imageUrl: string | null;
  studio: string | null;
  format?: string | null;
  isWatching?: boolean;
  isUpcoming?: boolean;
  countdown?: string | null;
}

export interface ReleaseCalendarFilterState {
  searchTerm: string;
  watchingOnly: boolean;
  hideWithoutEnglishTitle: boolean;
  hideLongRunning: boolean;
  showOnlyToday: boolean;
}

export interface DaySchedule {
  dateKey: string; // YYYY-MM-DD
  weekday: string; // MON, TUE, etc.
  dayNum: string;  // 10, 11, etc.
  monthName: string; // Aug
  year: number;
  items: (ReleaseCalendarItem & {
    formattedTime: string;
    isWatching: boolean;
    displayTitle: string;
    isUpcoming?: boolean;
    countdown?: string | null;
  })[];
}

