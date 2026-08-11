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
  start_season?: {
    year?: number;
    season?: string;
  };
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
  tags?: string[];
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

