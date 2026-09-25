import { MalListItem } from '../types';
import { JikanSeasonalAnime } from './seasonUtils';

export interface RecommendationMatch {
  anime: JikanSeasonalAnime;
  matchScore: number; // 0 - 100
  matchReasons: string[];
  isFranchiseSequel: boolean;
  franchiseParentTitle?: string;
  matchedStudio?: string;
  matchedGenres: string[];
  userMalItem?: MalListItem;
}

export interface UserPreferencesProfile {
  topGenres: Array<{ name: string; score: number; count: number }>;
  favoriteStudios: Array<{ name: string; avgScore: number; count: number }>;
  totalCompleted: number;
  averageScore: number;
}

/**
 * Normalizes title for fuzzy franchise/sequel matching
 */
function normalizeTitle(title?: string): string {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/season\s*\d+/gi, '')
    .replace(/\b\d+(st|nd|rd|th)\s+season\b/gi, '')
    .replace(/\bpart\s*\d+\b/gi, '')
    .replace(/\bcour\s*\d+\b/gi, '')
    .replace(/\b(ii|iii|iv|v|vi|vii|viii|ix|x)\b/gi, '')
    .replace(/[:：\-–—_!?~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts franchise root key from title
 */
function getFranchiseRoot(title?: string): string {
  const norm = normalizeTitle(title);
  if (!norm) return '';
  const words = norm.split(' ');
  // Take first 3 significant words as franchise root
  return words.slice(0, Math.min(words.length, 3)).join(' ');
}

/**
 * Builds user taste profile from their MyAnimeList history
 */
export function buildUserProfile(malList: MalListItem[]): {
  profile: UserPreferencesProfile;
  genreWeights: Map<string, number>;
  studioMap: Map<string, { count: number; totalScore: number; animeTitles: string[] }>;
  completedFranchises: Map<string, { title: string; score: number; malId: number }>;
} {
  const genreWeights = new Map<string, number>();
  const genreCounts = new Map<string, number>();
  const studioMap = new Map<string, { count: number; totalScore: number; animeTitles: string[] }>();
  const completedFranchises = new Map<string, { title: string; score: number; malId: number }>();

  let totalScoreSum = 0;
  let scoredCount = 0;
  let totalCompleted = 0;

  for (const item of malList) {
    const node = item.node;
    if (!node) continue;

    const listStatus = item.list_status || ({} as any);
    const status = listStatus.status;
    const userScore = listStatus.score || 0;

    if (status === 'completed') totalCompleted++;
    if (userScore > 0) {
      totalScoreSum += userScore;
      scoredCount++;
    }

    // Weight factor based on status and user rating
    let weight = 1.0;
    if (status === 'completed') weight = userScore >= 8 ? 3.0 : userScore >= 6 ? 2.0 : 1.2;
    else if (status === 'watching') weight = userScore >= 8 ? 2.5 : 1.8;
    else if (status === 'plan_to_watch') weight = 1.0;
    else if (status === 'dropped') weight = -1.0;

    // Track genres
    if (Array.isArray(node.genres)) {
      for (const g of node.genres) {
        if (!g?.name) continue;
        const gName = g.name.trim();
        genreWeights.set(gName, (genreWeights.get(gName) || 0) + weight);
        genreCounts.set(gName, (genreCounts.get(gName) || 0) + 1);
      }
    }

    // Track studios if available in node
    const studioName = (node as any).studio || (node as any).studios?.[0]?.name;
    if (studioName && typeof studioName === 'string') {
      const sTrim = studioName.trim();
      const existing = studioMap.get(sTrim) || { count: 0, totalScore: 0, animeTitles: [] };
      existing.count += 1;
      if (userScore > 0) existing.totalScore += userScore;
      if (node.title) existing.animeTitles.push(node.title);
      studioMap.set(sTrim, existing);
    }

    // Track completed or high-rated titles for franchise matching
    if ((status === 'completed' || status === 'watching') && node.title) {
      const root = getFranchiseRoot(node.title);
      if (root && root.length >= 3) {
        const existingRoot = completedFranchises.get(root);
        if (!existingRoot || userScore > existingRoot.score) {
          completedFranchises.set(root, {
            title: node.title,
            score: userScore,
            malId: node.id,
          });
        }
      }
    }
  }

  // Calculate top genres
  const topGenres = Array.from(genreWeights.entries())
    .map(([name, score]) => ({
      name,
      score: Math.max(0, score),
      count: genreCounts.get(name) || 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  // Calculate favorite studios
  const favoriteStudios = Array.from(studioMap.entries())
    .map(([name, data]) => ({
      name,
      count: data.count,
      avgScore: data.count > 0 && data.totalScore > 0 ? Number((data.totalScore / data.count).toFixed(1)) : 0,
    }))
    .filter((s) => s.count >= 2 || s.avgScore >= 8)
    .sort((a, b) => (b.avgScore * b.count) - (a.avgScore * a.count))
    .slice(0, 5);

  const profile: UserPreferencesProfile = {
    topGenres,
    favoriteStudios,
    totalCompleted,
    averageScore: scoredCount > 0 ? Number((totalScoreSum / scoredCount).toFixed(1)) : 7.5,
  };

  return {
    profile,
    genreWeights,
    studioMap,
    completedFranchises,
  };
}

/**
 * Computes recommendation score and detailed matching reasons for a Fall 2026 anime
 */
export function calculateAnimeRecommendation(
  anime: JikanSeasonalAnime,
  profileData: ReturnType<typeof buildUserProfile>,
  userMalMap: Map<number, MalListItem>
): RecommendationMatch {
  const { genreWeights, studioMap, completedFranchises, profile } = profileData;
  const animeNode = anime as any;

  let baseScore = 50; // Neutral baseline
  const matchReasons: string[] = [];
  let isFranchiseSequel = false;
  let franchiseParentTitle: string | undefined;
  let matchedStudio: string | undefined;
  const matchedGenres: string[] = [];

  const userMalItem = userMalMap.get(anime.mal_id);

  // 1. Franchise / Sequel Detection (Highest Priority)
  const animeTitle = anime.title || animeNode.title || '';
  const animeRoot = getFranchiseRoot(animeTitle);

  if (animeRoot && animeRoot.length >= 3) {
    const parent = completedFranchises.get(animeRoot);
    if (parent && parent.malId !== anime.mal_id) {
      isFranchiseSequel = true;
      franchiseParentTitle = parent.title;
      baseScore += 35;
      if (parent.score >= 8) {
        baseScore += 10;
        matchReasons.push(`🌟 Franchise Sequel: You rated "${parent.title}" ${parent.score}/10`);
      } else {
        matchReasons.push(`🌟 Returning Franchise: Continuation of "${parent.title}" in your list`);
      }
    }
  }

  // Common sequel naming keywords bonus
  if (!isFranchiseSequel && /(season\s*2|2nd\s*season|part\s*2|cour\s*2|ii\b|movie)/i.test(animeTitle)) {
    // Check if user has any title containing root
    for (const [root, parent] of completedFranchises.entries()) {
      if (root.length >= 4 && animeTitle.toLowerCase().includes(root)) {
        isFranchiseSequel = true;
        franchiseParentTitle = parent.title;
        baseScore += 30;
        matchReasons.push(`🌟 Franchise Sequel: You watched "${parent.title}"`);
        break;
      }
    }
  }

  // 2. Studio Affinity
  const rawStudio = animeNode.studio || animeNode.studios?.[0]?.name || animeNode.producers?.[0]?.name;
  if (rawStudio && typeof rawStudio === 'string') {
    const sName = rawStudio.trim();
    const studioData = studioMap.get(sName);
    if (studioData && studioData.count >= 1) {
      matchedStudio = sName;
      const avg = studioData.totalScore > 0 ? studioData.totalScore / studioData.count : 7.0;
      if (avg >= 8 || studioData.count >= 2) {
        baseScore += 18;
        matchReasons.push(`🎨 Studio Match: By ${sName} (You completed ${studioData.count} titles from this studio)`);
      } else {
        baseScore += 10;
        matchReasons.push(`🎨 Studio: Produced by ${sName}`);
      }
    }
  }

  // 3. Genre Synergy Matching
  const animeGenres: string[] = [];
  if (Array.isArray(animeNode.genres)) {
    for (const g of animeNode.genres) {
      if (g?.name) animeGenres.push(g.name.trim());
    }
  }

  const topGenreNames = new Set(profile.topGenres.map((g) => g.name.toLowerCase()));
  let genreBonus = 0;
  for (const gName of animeGenres) {
    const lower = gName.toLowerCase();
    const weight = genreWeights.get(gName) || 0;
    if (weight > 0) {
      if (topGenreNames.has(lower)) {
        matchedGenres.push(gName);
        genreBonus += Math.min(weight * 2.5, 12);
      } else {
        genreBonus += Math.min(weight, 5);
      }
    }
  }

  if (matchedGenres.length > 0) {
    baseScore += Math.min(genreBonus, 25);
    matchReasons.push(`🔥 Genre Fit: Matches your favorites (${matchedGenres.slice(0, 3).join(', ')})`);
  }

  // 4. MAL Community Mean Score & Anticipation
  const malMean = anime.score || animeNode.mean || animeNode.score;
  if (typeof malMean === 'number' && malMean >= 8.0) {
    baseScore += 12;
    matchReasons.push(`⭐ Highly Anticipated: ${malMean.toFixed(1)} rating on MyAnimeList`);
  } else if (typeof malMean === 'number' && malMean >= 7.5) {
    baseScore += 6;
  }

  // 5. User List Status adjustment
  if (userMalItem) {
    if (userMalItem.list_status?.status === 'plan_to_watch') {
      baseScore += 10;
      matchReasons.push('📌 In your Plan to Watch list');
    } else if (userMalItem.list_status?.status === 'watching') {
      baseScore += 15;
      matchReasons.push('📺 Already on your Watching list');
    }
  }

  // Fallback reason if none generated yet
  if (matchReasons.length === 0) {
    if (animeGenres.length > 0) {
      matchReasons.push(`✨ Fall 2026 Release (${animeGenres.slice(0, 2).join(', ')})`);
    } else {
      matchReasons.push('✨ Upcoming Fall 2026 Premiere');
    }
  }

  // Clamp match score between 55% and 99%
  const finalScore = Math.min(99, Math.max(55, Math.round(baseScore)));

  return {
    anime,
    matchScore: finalScore,
    matchReasons,
    isFranchiseSequel,
    franchiseParentTitle,
    matchedStudio,
    matchedGenres,
    userMalItem,
  };
}
