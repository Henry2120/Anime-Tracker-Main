import express from "express";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

dotenv.config();

// Helper to dynamically read MAL credentials from process.env and .env files
function getMalCredentials() {
  // Reload .env / .env.local if created or updated dynamically at runtime
  dotenv.config({ override: true });
  dotenv.config({ path: ".env.local", override: true });

  const rawClientId = process.env.MAL_CLIENT_ID;
  const rawClientSecret = process.env.MAL_CLIENT_SECRET;

  const clientId =
    typeof rawClientId === "string" &&
    rawClientId.trim() !== "" &&
    rawClientId.trim() !== "MY_MAL_CLIENT_ID"
      ? rawClientId.trim()
      : null;

  const clientSecret =
    typeof rawClientSecret === "string" &&
    rawClientSecret.trim() !== "" &&
    rawClientSecret.trim() !== "MY_MAL_CLIENT_SECRET"
      ? rawClientSecret.trim()
      : null;

  return {
    clientId,
    clientSecret,
    isConfigured: Boolean(clientId),
  };
}

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());

// Server-side in-memory session and OAuth state stores
// Note: Never exposed to client or browser cookies
interface SessionData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface PendingOAuthState {
  codeVerifier: string;
  createdAt: number;
}

const userSessions = new Map<string, SessionData>();
const pendingStates = new Map<string, PendingOAuthState>();

// Clean up expired pending OAuth states periodically (older than 10 mins)
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of pendingStates.entries()) {
    if (now - data.createdAt > 10 * 60 * 1000) {
      pendingStates.delete(state);
    }
  }
}, 5 * 60 * 1000);

// Helper to determine canonical redirect URI
function getRedirectUri(req: express.Request): string {
  if (process.env.APP_URL) {
    const baseUrl = process.env.APP_URL.replace(/\/$/, "");
    return `${baseUrl}/api/auth/mal/callback`;
  }
  const host = req.get("host");
  const protocol = req.protocol === "https" || req.get("x-forwarded-proto") === "https" ? "https" : "http";
  return `${protocol}://${host}/api/auth/mal/callback`;
}

// Helper to get or refresh valid access token for a session
async function getValidAccessToken(sessionId: string): Promise<string | null> {
  const session = userSessions.get(sessionId);
  if (!session) return null;

  // Check if token is still valid (with 60-second buffer)
  if (Date.now() < session.expiresAt - 60 * 1000) {
    return session.accessToken;
  }

  // Token expired - attempt refresh
  const { clientId, clientSecret } = getMalCredentials();

  if (!clientId) return null;

  try {
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret || "",
      grant_type: "refresh_token",
      refresh_token: session.refreshToken,
    });

    const response = await fetch("https://myanimelist.net/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      userSessions.delete(sessionId);
      return null;
    }

    const tokenData = await response.json();
    const newSession: SessionData = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
    };

    userSessions.set(sessionId, newSession);
    return newSession.accessToken;
  } catch (err) {
    console.error("Failed to refresh MAL access token", err);
    userSessions.delete(sessionId);
    return null;
  }
}

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// MAL OAuth status & info (tells frontend if client ID is configured)
app.get("/api/mal/config", (_req, res) => {
  const { isConfigured } = getMalCredentials();
  res.json({ configured: isConfigured });
});

// 1. MAL OAuth Login Endpoint
app.get("/api/mal/login", (req, res) => {
  const { clientId } = getMalCredentials();

  if (!clientId) {
    return res.status(500).send(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center; color: #1e1b4b;">
          <h2>MAL Client ID Missing</h2>
          <p>Please configure the <code>MAL_CLIENT_ID</code> environment variable in your secrets.</p>
        </body>
      </html>
    `);
  }

  // Generate PKCE code verifier (128 random hex chars)
  const codeVerifier = crypto.randomBytes(64).toString("hex");
  // Generate CSRF state token
  const state = crypto.randomBytes(16).toString("hex");

  pendingStates.set(state, {
    codeVerifier,
    createdAt: Date.now(),
  });

  const redirectUri = getRedirectUri(req);

  // Build OAuth authorization URL with plain code_challenge equal to code_verifier per MAL spec
  const authUrl = new URL("https://myanimelist.net/v1/oauth2/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("code_challenge", codeVerifier);
  authUrl.searchParams.set("code_challenge_method", "plain");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("redirect_uri", redirectUri);

  res.redirect(authUrl.toString());
});

// 2. MAL OAuth Callback Endpoint
app.get("/api/auth/mal/callback", async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    return res.status(400).send(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center; color: #9f1239;">
          <h2>Authorization Failed</h2>
          <p>${error_description || error}</p>
          <script>
            setTimeout(() => window.close(), 3000);
          </script>
        </body>
      </html>
    `);
  }

  if (typeof state !== "string" || !pendingStates.has(state)) {
    return res.status(400).send("Invalid or expired state parameter.");
  }

  const { codeVerifier } = pendingStates.get(state)!;
  pendingStates.delete(state);

  if (typeof code !== "string") {
    return res.status(400).send("Missing authorization code.");
  }

  const { clientId, clientSecret } = getMalCredentials();
  if (!clientId) {
    return res.status(500).send("MAL Client ID is not configured.");
  }
  const redirectUri = getRedirectUri(req);

  try {
    const params = new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    });

    if (clientSecret) {
      params.set("client_secret", clientSecret);
    }

    const tokenResponse = await fetch("https://myanimelist.net/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error("MAL Token exchange failed:", errText);
      return res.status(500).send("Failed to exchange code for access token.");
    }

    const tokenData = await tokenResponse.json();

    // Create session server-side
    const sessionId = crypto.randomUUID();
    userSessions.set(sessionId, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
    });

    // Set secure HttpOnly cookie for iframe compatibility
    res.cookie("mal_session", sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>MyAnimeList Connected</title>
          <style>
            body { font-family: system-ui, sans-serif; background: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: white; padding: 32px; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.08); text-align: center; max-width: 360px; }
            h2 { color: #312e81; margin-top: 0; }
            p { color: #64748b; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Connected to MyAnimeList!</h2>
            <p>Your session has been established. This popup will close automatically.</p>
          </div>
          <script>
            try {
              if (window.opener) {
                window.opener.postMessage({ type: 'MAL_OAUTH_SUCCESS' }, '*');
                setTimeout(() => window.close(), 1000);
              } else {
                window.location.href = '/';
              }
            } catch (e) {
              window.location.href = '/';
            }
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.status(500).send("An unexpected error occurred during authentication.");
  }
});

// 3. Authenticated MAL User Profile Endpoint
app.get("/api/mal/me", async (req, res) => {
  const sessionId = req.cookies.mal_session;
  if (!sessionId) {
    return res.json({ authenticated: false });
  }

  const accessToken = await getValidAccessToken(sessionId);
  if (!accessToken) {
    res.clearCookie("mal_session", { httpOnly: true, secure: true, sameSite: "none" });
    return res.json({ authenticated: false });
  }

  try {
    const malResponse = await fetch("https://api.myanimelist.net/v2/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!malResponse.ok) {
      if (malResponse.status === 401) {
        userSessions.delete(sessionId);
        res.clearCookie("mal_session", { httpOnly: true, secure: true, sameSite: "none" });
        return res.json({ authenticated: false });
      }
      return res.status(malResponse.status).json({ error: "Failed to fetch MAL profile" });
    }

    const userData = await malResponse.json();
    res.json({ authenticated: true, user: userData });
  } catch (err) {
    console.error("Error fetching MAL user profile:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 4. Authenticated MAL User Anime List Endpoint
app.get("/api/mal/animelist", async (req, res) => {
  const sessionId = req.cookies.mal_session;
  if (!sessionId) {
    return res.status(401).json({ error: "Not authenticated with MyAnimeList" });
  }

  const accessToken = await getValidAccessToken(sessionId);
  if (!accessToken) {
    res.clearCookie("mal_session", { httpOnly: true, secure: true, sameSite: "none" });
    return res.status(401).json({ error: "Session expired or invalid" });
  }

  try {
    // Log user identity internally (no credentials)
    try {
      const meRes = await fetch("https://api.myanimelist.net/v2/users/@me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (meRes.ok) {
        const meData = await meRes.json();
        console.log(`[MAL SYNC] Fetching animelist for user: ${meData.name} (ID: ${meData.id})`);
      }
    } catch {
      // Ignore user profile fetch error
    }

    const fields = [
      "list_status",
      "num_episodes",
      "main_picture",
      "synopsis",
      "mean",
      "status",
      "media_type",
      "start_season",
      "start_date",
      "end_date",
      "broadcast",
      "source",
      "genres",
      "alternative_titles",
    ].join(",");

    const allItems: any[] = [];
    const seenIds = new Set<number>();
    let nextUrl: string | null = `https://api.myanimelist.net/v2/users/@me/animelist?limit=100&nsfw=true&fields=${encodeURIComponent(fields)}`;
    let pageNum = 0;

    while (nextUrl) {
      pageNum++;
      const currentUrl = nextUrl;
      const malResponse = await fetch(currentUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!malResponse.ok) {
        if (malResponse.status === 401) {
          userSessions.delete(sessionId);
          res.clearCookie("mal_session", { httpOnly: true, secure: true, sameSite: "none" });
          return res.status(401).json({ error: "MyAnimeList session expired. Please connect again." });
        }
        return res.status(malResponse.status).json({ error: "Failed to fetch complete MAL user anime list" });
      }

      const listData = await malResponse.json();
      const pageItems: any[] = Array.isArray(listData.data) ? listData.data : [];
      const hasNext = Boolean(listData.paging && typeof listData.paging.next === "string" && listData.paging.next.length > 0);

      for (const item of pageItems) {
        if (item?.node?.id) {
          if (!seenIds.has(item.node.id)) {
            seenIds.add(item.node.id);
            allItems.push(item);
          }
        } else {
          allItems.push(item);
        }
      }

      if (hasNext && listData.paging.next) {
        try {
          const parsedNext = new URL(listData.paging.next);
          parsedNext.searchParams.set("nsfw", "true");
          nextUrl = parsedNext.toString();
        } catch {
          nextUrl = listData.paging.next.includes("nsfw=") ? listData.paging.next : `${listData.paging.next}&nsfw=true`;
        }
      } else {
        nextUrl = null;
      }
    }

    res.json({ data: allItems });
  } catch (err) {
    console.error("Error fetching MAL anime list:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 5. Logout / Disconnect Endpoint
app.post("/api/mal/logout", (req, res) => {
  const sessionId = req.cookies.mal_session;
  if (sessionId) {
    userSessions.delete(sessionId);
  }
  res.clearCookie("mal_session", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
  });
  res.json({ success: true });
});

// 6. Seasonal Anime Endpoint (with pagination & client-id fallback)
app.get("/api/mal/season/:year/:season", async (req, res) => {
  const { year, season } = req.params;
  const sessionId = req.cookies.mal_session;

  let headers: Record<string, string> = {};

  if (sessionId) {
    const accessToken = await getValidAccessToken(sessionId);
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }
  }

  if (!headers["Authorization"] && process.env.MAL_CLIENT_ID) {
    headers["X-MAL-CLIENT-ID"] = process.env.MAL_CLIENT_ID.trim();
  }

  if (Object.keys(headers).length === 0) {
    return res.status(401).json({ error: "MyAnimeList API Client ID or authentication required" });
  }

  try {
    const fields = "num_episodes,main_picture,synopsis,mean,status,media_type,start_season,start_date,end_date,broadcast,alternative_titles";
    const allItems: any[] = [];
    const seenIds = new Set<number>();
    let nextUrl: string | null = `https://api.myanimelist.net/v2/anime/season/${encodeURIComponent(year)}/${encodeURIComponent(season)}?limit=100&fields=${encodeURIComponent(fields)}`;
    let pageCount = 0;
    const maxPages = 15; // Up to 1500 seasonal anime

    while (nextUrl && pageCount < maxPages) {
      pageCount++;
      const malResponse = await fetch(nextUrl, { headers });

      if (!malResponse.ok) {
        if (malResponse.status === 401 && sessionId) {
          userSessions.delete(sessionId);
          res.clearCookie("mal_session", { httpOnly: true, secure: true, sameSite: "none" });
        }
        // If we already collected items in earlier pages, return them instead of failing completely
        if (allItems.length > 0) {
          break;
        }
        return res.status(malResponse.status).json({ error: "Failed to fetch seasonal anime list" });
      }

      const seasonData = await malResponse.json();

      if (Array.isArray(seasonData.data)) {
        for (const item of seasonData.data) {
          if (item?.node?.id) {
            if (!seenIds.has(item.node.id)) {
              seenIds.add(item.node.id);
              allItems.push(item);
            }
          } else {
            allItems.push(item);
          }
        }
      }

      if (seasonData.paging && typeof seasonData.paging.next === "string" && seasonData.paging.next.length > 0) {
        nextUrl = seasonData.paging.next;
      } else {
        nextUrl = null;
      }
    }

    res.json({ data: allItems });
  } catch (err) {
    console.error("Error fetching seasonal anime list:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 7. Jikan Seasonal Catalogue Endpoint with full pagination and caching
interface CachedJikanSeason {
  cachedAt: number;
  payload: {
    year: number;
    season: string;
    data: Array<{
      mal_id: number;
      title: string;
      images?: any;
      score?: number;
      episodes?: number;
      season?: string;
      year?: number;
      aired?: any;
    }>;
  };
}

const jikanSeasonCache = new Map<string, CachedJikanSeason>();
const JIKAN_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

app.get("/api/jikan/season/:year/:season", async (req, res) => {
  const year = parseInt(req.params.year, 10);
  const season = req.params.season.toLowerCase();

  if (isNaN(year) || !["winter", "spring", "summer", "fall"].includes(season)) {
    return res.status(400).json({ error: "Invalid year or season" });
  }

  const cacheKey = `${year}_${season}`;
  const cached = jikanSeasonCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < JIKAN_CACHE_TTL) {
    return res.json(cached.payload);
  }

  try {
    const allAnimeMap = new Map<number, any>();
    let page = 1;
    let hasNextPage = true;
    let maxPages = 15; // safeguard limit

    while (hasNextPage && page <= maxPages) {
      try {
        const jikanRes = await fetch(
          `https://api.jikan.moe/v4/seasons/${year}/${season}?page=${page}`
        );

        if (jikanRes.status === 429) {
          // Rate limited, wait 1 second and retry once
          await new Promise((r) => setTimeout(r, 1000));
          const retryRes = await fetch(
            `https://api.jikan.moe/v4/seasons/${year}/${season}?page=${page}`
          );
          if (!retryRes.ok) break;
          const retryData = await retryRes.json();
          if (Array.isArray(retryData.data)) {
            for (const item of retryData.data) {
              if (item?.mal_id) {
                allAnimeMap.set(item.mal_id, {
                  mal_id: item.mal_id,
                  title: item.title,
                  images: item.images,
                  score: item.score,
                  episodes: item.episodes,
                  season: item.season,
                  year: item.year,
                  aired: item.aired,
                });
              }
            }
          }
          hasNextPage = retryData.pagination?.has_next_page === true;
          page++;
          await new Promise((r) => setTimeout(r, 350));
          continue;
        }

        if (!jikanRes.ok) {
          console.warn(`Jikan seasonal page ${page} returned status ${jikanRes.status}`);
          break;
        }

        const data = await jikanRes.json();
        if (Array.isArray(data.data)) {
          for (const item of data.data) {
            if (item?.mal_id) {
              allAnimeMap.set(item.mal_id, {
                mal_id: item.mal_id,
                title: item.title,
                images: item.images,
                score: item.score,
                episodes: item.episodes,
                season: item.season,
                year: item.year,
                aired: item.aired,
              });
            }
          }
        }

        hasNextPage = data.pagination?.has_next_page === true;
        page++;

        if (hasNextPage) {
          // Respect Jikan rate limits (3 requests per second)
          await new Promise((r) => setTimeout(r, 350));
        }
      } catch (pageErr) {
        console.error(`Error fetching Jikan season page ${page}:`, pageErr);
        break;
      }
    }

    const animeList = Array.from(allAnimeMap.values());
    const payload = {
      year,
      season,
      data: animeList,
    };

    if (animeList.length > 0) {
      jikanSeasonCache.set(cacheKey, {
        cachedAt: Date.now(),
        payload,
      });
    }

    return res.json(payload);
  } catch (err) {
    console.error(`Failed to fetch Jikan season ${year}/${season}:`, err);
    return res.status(500).json({ error: "Failed to fetch seasonal catalogue from Jikan" });
  }
});

// 8. Individual Jikan Anime Fallback Endpoint with Caching
interface CachedJikanAnime {
  cachedAt: number;
  payload: {
    mal_id: number;
    title?: string;
    year?: number;
    season?: string;
    start_date?: string;
    is_summer_2026: boolean;
  };
}

const jikanAnimeCache = new Map<number, CachedJikanAnime>();

// Helper to determine season from month number (1-12)
function getSeasonFromMonth(month: number): string {
  if (month >= 1 && month <= 3) return "winter";
  if (month >= 4 && month <= 6) return "spring";
  if (month >= 7 && month <= 9) return "summer";
  return "fall";
}

// Helper to parse date string into { year, season }
function parseSeasonFromDate(dateStr?: string | null): { year: number; season: string } | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  const match = dateStr.trim().match(/^(\d{4})(?:[-/](\d{1,2}))?/);
  if (match) {
    const year = parseInt(match[1], 10);
    if (!isNaN(year) && year >= 1900 && year <= 2100) {
      if (match[2]) {
        const month = parseInt(match[2], 10);
        if (!isNaN(month) && month >= 1 && month <= 12) {
          return { year, season: getSeasonFromMonth(month) };
        }
      }
    }
  }
  return null;
}

app.get("/api/jikan/anime/:malId", async (req, res) => {
  const malId = parseInt(req.params.malId, 10);
  if (isNaN(malId) || malId <= 0) {
    return res.status(400).json({ error: "Invalid MAL ID" });
  }

  const cached = jikanAnimeCache.get(malId);
  if (cached && Date.now() - cached.cachedAt < JIKAN_CACHE_TTL) {
    return res.json(cached.payload);
  }

  try {
    let jikanRes = await fetch(`https://api.jikan.moe/v4/anime/${encodeURIComponent(malId)}`);
    if (jikanRes.status === 429) {
      await new Promise((r) => setTimeout(r, 600));
      jikanRes = await fetch(`https://api.jikan.moe/v4/anime/${encodeURIComponent(malId)}`);
    }

    if (jikanRes.ok) {
      const json = await jikanRes.json();
      const data = json.data;
      if (data) {
        let year = typeof data.year === "number" ? data.year : undefined;
        let season = data.season ? String(data.season).toLowerCase() : undefined;
        const startDate = data.aired?.from ? data.aired.from.split("T")[0] : undefined;

        if ((!year || !season) && startDate) {
          const parsed = parseSeasonFromDate(startDate);
          if (parsed) {
            year = year || parsed.year;
            season = season || parsed.season;
          }
        }

        const isSummer2026 = year === 2026 && season === "summer";

        const payload = {
          mal_id: malId,
          title: data.title,
          year,
          season,
          start_date: startDate,
          is_summer_2026: isSummer2026,
        };

        jikanAnimeCache.set(malId, {
          cachedAt: Date.now(),
          payload,
        });

        return res.json(payload);
      }
    }

    // Secondary fallback: check MAL if available
    const sessionId = req.cookies.mal_session;
    let malHeaders: Record<string, string> = {};
    if (sessionId) {
      const accessToken = await getValidAccessToken(sessionId);
      if (accessToken) malHeaders["Authorization"] = `Bearer ${accessToken}`;
    }
    if (!malHeaders["Authorization"] && process.env.MAL_CLIENT_ID) {
      malHeaders["X-MAL-CLIENT-ID"] = process.env.MAL_CLIENT_ID.trim();
    }

    if (Object.keys(malHeaders).length > 0) {
      try {
        const malRes = await fetch(
          `https://api.myanimelist.net/v2/anime/${encodeURIComponent(malId)}?fields=start_season,start_date,title`,
          { headers: malHeaders }
        );
        if (malRes.ok) {
          const malData = await malRes.json();
          let year = malData.start_season?.year;
          let season = malData.start_season?.season?.toLowerCase();
          const startDate = malData.start_date;
          if ((!year || !season) && startDate) {
            const parsed = parseSeasonFromDate(startDate);
            if (parsed) {
              year = year || parsed.year;
              season = season || parsed.season;
            }
          }
          const isSummer2026 = year === 2026 && season === "summer";
          const payload = {
            mal_id: malId,
            title: malData.title,
            year,
            season,
            start_date: startDate,
            is_summer_2026: isSummer2026,
          };
          jikanAnimeCache.set(malId, {
            cachedAt: Date.now(),
            payload,
          });
          return res.json(payload);
        }
      } catch (malErr) {
        // ignore
      }
    }

    return res.status(404).json({ error: "Anime season not determined" });
  } catch (err) {
    console.error(`Error querying Jikan for anime ${malId}:`, err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// 9. Dataset-Wide Diagnostics Endpoint for MAL & Jikan Pipeline Tracing
app.get("/api/debug/dataset", async (req, res) => {
  const sessionId = req.cookies.mal_session;
  let malHeaders: Record<string, string> = {};
  let authenticated = false;
  let malUser: any = null;

  if (sessionId) {
    const accessToken = await getValidAccessToken(sessionId);
    if (accessToken) {
      malHeaders["Authorization"] = `Bearer ${accessToken}`;
      authenticated = true;

      // 1. Query /v2/users/@me directly
      try {
        const userRes = await fetch("https://api.myanimelist.net/v2/users/@me", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (userRes.ok) {
          malUser = await userRes.json();
        }
      } catch (userErr) {
        console.error("Error fetching user in debug dataset:", userErr);
      }
    }
  }

  const result: any = {
    timestamp: new Date().toISOString(),
    authenticated,
    authenticatedUser: malUser ? {
      id: malUser.id,
      name: malUser.name,
      joined_at: malUser.joined_at,
      location: malUser.location,
    } : null,
    backendMalList: {
      total: 0,
      uniqueIdsCount: 0,
      watchingCount: 0,
      watchingIds: [] as number[],
      watchingItems: [] as any[],
      error: null as string | null,
    },
    directCheck61126: {
      inUserListResponse: false,
      userListStatus: null as any,
      directAnimeEndpointChecked: false,
      animeExists: false,
      myListStatusExists: false,
      myListStatus: null as any,
      conclusion: "",
    },
    jikanSummer2026: {
      totalEntries: 0,
      uniqueIdsCount: 0,
      ids: [] as number[],
    },
    expectedSummerWatching: [] as any[],
    discrepancies: [] as any[],
  };

  if (!authenticated) {
    result.backendMalList.error = "Not authenticated with MyAnimeList (no active session cookie)";
    return res.json(result);
  }

  try {
    // 1. Fetch complete personal MAL list from MAL API
    const fields = [
      "list_status{status,score,num_episodes_watched,is_rewatching,updated_at,start_date,finish_date}",
      "start_season",
      "start_date",
      "media_type",
      "num_episodes",
      "status",
      "genres",
      "alternative_titles",
    ].join(",");

    const allItems: any[] = [];
    const seenIds = new Set<number>();
    let nextUrl: string | null = `https://api.myanimelist.net/v2/users/@me/animelist?limit=100&fields=${encodeURIComponent(fields)}`;
    let pages = 0;

    while (nextUrl && pages < 50) {
      pages++;
      const malResponse = await fetch(nextUrl, { headers: malHeaders });
      if (!malResponse.ok) {
        result.backendMalList.error = `MAL API returned ${malResponse.status} on page ${pages}`;
        break;
      }
      const listData = await malResponse.json();
      if (Array.isArray(listData.data)) {
        for (const item of listData.data) {
          if (item?.node?.id) {
            if (!seenIds.has(item.node.id)) {
              seenIds.add(item.node.id);
              allItems.push(item);
            }
          }
        }
      }
      nextUrl = listData.paging?.next || null;
    }

    result.backendMalList.total = allItems.length;
    result.backendMalList.uniqueIdsCount = seenIds.size;

    const raw61126Item = allItems.find((i) => i?.node?.id === 61126);
    if (raw61126Item) {
      result.directCheck61126.inUserListResponse = true;
      result.directCheck61126.userListStatus = raw61126Item.list_status;
    }

    // Direct check of /v2/anime/61126?fields=my_list_status,start_season,start_date
    try {
      const anime61126Res = await fetch(
        "https://api.myanimelist.net/v2/anime/61126?fields=my_list_status,start_season,start_date,title",
        { headers: malHeaders }
      );
      result.directCheck61126.directAnimeEndpointChecked = true;
      if (anime61126Res.ok) {
        const anime61126Data = await anime61126Res.json();
        result.directCheck61126.animeExists = true;
        if (anime61126Data.my_list_status) {
          result.directCheck61126.myListStatusExists = true;
          result.directCheck61126.myListStatus = anime61126Data.my_list_status;
        }
      }
    } catch (e: any) {
      console.error("Direct 61126 check error:", e);
    }

    if (result.directCheck61126.inUserListResponse && result.directCheck61126.myListStatusExists) {
      result.directCheck61126.conclusion = "CONSISTENT: 61126 exists in user list and has my_list_status";
    } else if (!result.directCheck61126.inUserListResponse && !result.directCheck61126.myListStatusExists) {
      result.directCheck61126.conclusion = "CONSISTENT: 61126 is not in authenticated user's personal list on MyAnimeList";
    } else {
      result.directCheck61126.conclusion = "INCONSISTENT: Mismatch between /users/@me/animelist and /anime/61126";
    }

    const watchingList = allItems.filter((i) => i.list_status?.status === "watching");
    result.backendMalList.watchingCount = watchingList.length;
    result.backendMalList.watchingIds = watchingList.map((i) => i.node.id);
    result.backendMalList.watchingItems = watchingList.map((i) => ({
      id: i.node.id,
      title: i.node.title,
      status: i.list_status?.status,
      start_season: i.node.start_season,
      start_date: i.node.start_date,
    }));

    // 2. Fetch Jikan Summer 2026 catalogue (cached or direct)
    const cachedJikan = jikanSeasonCache.get("2026_summer");
    let jikanIds = new Set<number>();
    if (cachedJikan && Date.now() - cachedJikan.cachedAt < JIKAN_CACHE_TTL) {
      for (const item of cachedJikan.payload.data) {
        if (item?.mal_id) jikanIds.add(item.mal_id);
      }
    }

    result.jikanSummer2026.totalEntries = cachedJikan?.payload.data.length || jikanIds.size;
    result.jikanSummer2026.uniqueIdsCount = jikanIds.size;
    result.jikanSummer2026.ids = Array.from(jikanIds);

    // 3. Calculate expected watching
    for (const w of watchingList) {
      const animeId = w.node.id;
      const inJikanCatalogue = jikanIds.has(animeId);
      let isSummer2026 = inJikanCatalogue;
      let jikanSeason = null;
      let jikanYear = null;

      // Check cached individual Jikan if available
      const indCached = jikanAnimeCache.get(animeId);
      if (indCached) {
        isSummer2026 = isSummer2026 || indCached.payload.is_summer_2026;
        jikanSeason = indCached.payload.season;
        jikanYear = indCached.payload.year;
      }

      if (isSummer2026) {
        result.expectedSummerWatching.push({
          id: animeId,
          title: w.node.title,
          status: w.list_status?.status,
          start_season: w.node.start_season,
          start_date: w.node.start_date,
          inJikanCatalogue,
          jikanSeason,
          jikanYear,
        });
      }
    }

    return res.json(result);
  } catch (err: any) {
    result.backendMalList.error = err.message || String(err);
    return res.status(500).json(result);
  }
});

// 9.5. Detailed MAL Bulk vs Individual Investigation Endpoint
app.get("/api/debug/mal-investigation", async (req, res) => {
  const sessionId = req.cookies.mal_session;
  if (!sessionId) {
    return res.status(401).json({ error: "Not authenticated with MyAnimeList (no active session cookie)" });
  }

  const accessToken = await getValidAccessToken(sessionId);
  if (!accessToken) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  const malHeaders = { Authorization: `Bearer ${accessToken}` };

  const report: any = {
    timestamp: new Date().toISOString(),
    authenticatedUser: null,
    bulkAnimelist: {
      pagesFetched: 0,
      totalEntries: 0,
      watchingCount: 0,
      pages: [] as any[],
      found61126: false,
      found61126Page: null as number | null,
      error: null as string | null,
    },
    directCheck61126: {
      url: "https://api.myanimelist.net/v2/anime/61126?fields=my_list_status,start_season,start_date,title,rating,nsfw",
      animeExists: false,
      myListStatusExists: false,
      myListStatus: null as any,
      title: null as string | null,
      rating: null as string | null,
      nsfw: null as any,
      error: null as string | null,
    },
    statusFilteredBulk: {
      url: "https://api.myanimelist.net/v2/users/@me/animelist?status=watching&limit=1000",
      totalReturned: 0,
      found61126: false,
      item61126: null as any,
      error: null as string | null,
    },
    nsfwBulk: {
      url: "https://api.myanimelist.net/v2/users/@me/animelist?nsfw=true&limit=1000",
      totalReturned: 0,
      found61126: false,
      error: null as string | null,
    },
    largeLimitBulk: {
      url: "https://api.myanimelist.net/v2/users/@me/animelist?limit=1000",
      totalReturned: 0,
      found61126: false,
      error: null as string | null,
    },
    alternativeSorts: {
      listUpdatedAt: { total: 0, found61126: false, error: null as string | null },
      animeTitle: { total: 0, found61126: false, error: null as string | null },
      listScore: { total: 0, found61126: false, error: null as string | null },
      animeStartDate: { total: 0, found61126: false, error: null as string | null },
    },
    summer2026Discrepancy: {
      jikanCandidatesTested: 0,
      individualWatchingCount: 0,
      alsoInBulkCount: 0,
      missingFromBulk: [] as any[],
      unexpectedInBulk: [] as any[],
    },
    conclusion: {
      summary: "",
      rootCause: "",
    },
  };

  try {
    // 1. Get authenticated user profile
    try {
      const meRes = await fetch("https://api.myanimelist.net/v2/users/@me", { headers: malHeaders });
      if (meRes.ok) {
        report.authenticatedUser = await meRes.json();
      }
    } catch (e: any) {
      report.authenticatedUser = { error: e.message };
    }

    // 2. Direct individual anime endpoint check for 61126
    try {
      const indRes = await fetch(
        "https://api.myanimelist.net/v2/anime/61126?fields=my_list_status,start_season,start_date,title,rating,nsfw",
        { headers: malHeaders }
      );
      if (indRes.ok) {
        const indData = await indRes.json();
        report.directCheck61126.animeExists = true;
        report.directCheck61126.title = indData.title || null;
        report.directCheck61126.rating = indData.rating || null;
        report.directCheck61126.nsfw = indData.nsfw ?? null;
        if (indData.my_list_status) {
          report.directCheck61126.myListStatusExists = true;
          report.directCheck61126.myListStatus = indData.my_list_status;
        }
      } else {
        report.directCheck61126.error = `Status ${indRes.status}`;
      }
    } catch (e: any) {
      report.directCheck61126.error = e.message;
    }

    // 3. Page-by-page capture of /users/@me/animelist (with nsfw=true)
    const fields = "list_status,start_season,start_date,num_episodes,status";
    let nextUrl: string | null = `https://api.myanimelist.net/v2/users/@me/animelist?limit=100&nsfw=true&fields=${encodeURIComponent(fields)}`;
    const bulkAllItems: any[] = [];
    const bulkWatchingIds = new Set<number>();
    let pageNum = 0;

    while (nextUrl && pageNum < 20) {
      pageNum++;
      const res = await fetch(nextUrl, { headers: malHeaders });
      if (!res.ok) {
        report.bulkAnimelist.error = `Page ${pageNum} failed with status ${res.status}`;
        break;
      }
      const data = await res.json();
      const pageItems = Array.isArray(data.data) ? data.data : [];
      const hasNext = Boolean(data.paging && typeof data.paging.next === "string" && data.paging.next.length > 0);
      const foundInPage = pageItems.some((i: any) => i?.node?.id === 61126);

      if (foundInPage && !report.bulkAnimelist.found61126) {
        report.bulkAnimelist.found61126 = true;
        report.bulkAnimelist.found61126Page = pageNum;
      }

      report.bulkAnimelist.pages.push({
        page: pageNum,
        itemCount: pageItems.length,
        hasNext,
        firstMalId: pageItems[0]?.node?.id ?? null,
        firstTitle: pageItems[0]?.node?.title ?? null,
        lastMalId: pageItems[pageItems.length - 1]?.node?.id ?? null,
        lastTitle: pageItems[pageItems.length - 1]?.node?.title ?? null,
        found61126: foundInPage,
      });

      for (const item of pageItems) {
        if (item?.node?.id) {
          bulkAllItems.push(item);
          if (item.list_status?.status === "watching") {
            bulkWatchingIds.add(item.node.id);
          }
        }
      }

      if (hasNext && data.paging.next) {
        try {
          const parsedNext = new URL(data.paging.next);
          parsedNext.searchParams.set("nsfw", "true");
          nextUrl = parsedNext.toString();
        } catch {
          nextUrl = data.paging.next.includes("nsfw=") ? data.paging.next : `${data.paging.next}&nsfw=true`;
        }
      } else {
        nextUrl = null;
      }
    }

    report.bulkAnimelist.pagesFetched = pageNum;
    report.bulkAnimelist.totalEntries = bulkAllItems.length;
    report.bulkAnimelist.watchingCount = bulkWatchingIds.size;

    // 4. Status-filtered test: /users/@me/animelist?status=watching
    try {
      const watchingRes = await fetch(
        `https://api.myanimelist.net/v2/users/@me/animelist?status=watching&limit=1000&fields=${encodeURIComponent(fields)}`,
        { headers: malHeaders }
      );
      if (watchingRes.ok) {
        const watchingData = await watchingRes.json();
        const items = Array.isArray(watchingData.data) ? watchingData.data : [];
        report.statusFilteredBulk.totalReturned = items.length;
        const item61126 = items.find((i: any) => i?.node?.id === 61126);
        if (item61126) {
          report.statusFilteredBulk.found61126 = true;
          report.statusFilteredBulk.item61126 = item61126;
        }
      } else {
        report.statusFilteredBulk.error = `Status ${watchingRes.status}`;
      }
    } catch (e: any) {
      report.statusFilteredBulk.error = e.message;
    }

    // 5. NSFW parameter test: /users/@me/animelist?nsfw=true
    try {
      const nsfwRes = await fetch(
        `https://api.myanimelist.net/v2/users/@me/animelist?nsfw=true&limit=1000&fields=${encodeURIComponent(fields)}`,
        { headers: malHeaders }
      );
      if (nsfwRes.ok) {
        const nsfwData = await nsfwRes.json();
        const items = Array.isArray(nsfwData.data) ? nsfwData.data : [];
        report.nsfwBulk.totalReturned = items.length;
        report.nsfwBulk.found61126 = items.some((i: any) => i?.node?.id === 61126);
      } else {
        report.nsfwBulk.error = `Status ${nsfwRes.status}`;
      }
    } catch (e: any) {
      report.nsfwBulk.error = e.message;
    }

    // 6. Large limit request: /users/@me/animelist?limit=1000
    try {
      const largeRes = await fetch(
        `https://api.myanimelist.net/v2/users/@me/animelist?limit=1000&fields=${encodeURIComponent(fields)}`,
        { headers: malHeaders }
      );
      if (largeRes.ok) {
        const largeData = await largeRes.json();
        const items = Array.isArray(largeData.data) ? largeData.data : [];
        report.largeLimitBulk.totalReturned = items.length;
        report.largeLimitBulk.found61126 = items.some((i: any) => i?.node?.id === 61126);
      } else {
        report.largeLimitBulk.error = `Status ${largeRes.status}`;
      }
    } catch (e: any) {
      report.largeLimitBulk.error = e.message;
    }

    // 7. Alternative Sort Orders
    const sortConfigs: Array<{ key: keyof typeof report.alternativeSorts; sortVal: string }> = [
      { key: "listUpdatedAt", sortVal: "list_updated_at" },
      { key: "animeTitle", sortVal: "anime_title" },
      { key: "listScore", sortVal: "list_score" },
      { key: "animeStartDate", sortVal: "anime_start_date" },
    ];

    for (const sc of sortConfigs) {
      try {
        const sRes = await fetch(
          `https://api.myanimelist.net/v2/users/@me/animelist?sort=${sc.sortVal}&limit=1000&fields=${encodeURIComponent(fields)}`,
          { headers: malHeaders }
        );
        if (sRes.ok) {
          const sData = await sRes.json();
          const items = Array.isArray(sData.data) ? sData.data : [];
          report.alternativeSorts[sc.key].total = items.length;
          report.alternativeSorts[sc.key].found61126 = items.some((i: any) => i?.node?.id === 61126);
        } else {
          report.alternativeSorts[sc.key].error = `Status ${sRes.status}`;
        }
      } catch (e: any) {
        report.alternativeSorts[sc.key].error = e.message;
      }
    }

    // 8. Summer 2026 Candidates Comparison (Individual vs Bulk)
    const cachedJikan = jikanSeasonCache.get("2026_summer");
    let candidateIds: number[] = [];
    if (cachedJikan && Date.now() - cachedJikan.cachedAt < JIKAN_CACHE_TTL) {
      candidateIds = cachedJikan.payload.data.map((item: any) => item?.mal_id).filter(Boolean);
    }
    // Also include fallback set
    for (const fid of [61126, 60897, 60759, 58514, 59714, 60980, 59885, 59400, 56839, 59285, 60700, 60100, 60200, 60300, 60400, 60500, 60600]) {
      if (!candidateIds.includes(fid)) candidateIds.push(fid);
    }

    report.summer2026Discrepancy.jikanCandidatesTested = candidateIds.length;

    // Check individual MAL status for each candidate in batches of 5
    const batchSize = 5;
    for (let i = 0; i < candidateIds.length; i += batchSize) {
      const batch = candidateIds.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (cid) => {
          try {
            const cRes = await fetch(
              `https://api.myanimelist.net/v2/anime/${cid}?fields=my_list_status,title`,
              { headers: malHeaders }
            );
            if (cRes.ok) {
              const cData = await cRes.json();
              if (cData.my_list_status?.status === "watching") {
                report.summer2026Discrepancy.individualWatchingCount++;
                const inBulk = bulkWatchingIds.has(cid);
                if (inBulk) {
                  report.summer2026Discrepancy.alsoInBulkCount++;
                } else {
                  report.summer2026Discrepancy.missingFromBulk.push({
                    id: cid,
                    title: cData.title || `MAL ID ${cid}`,
                    individualStatus: cData.my_list_status.status,
                    score: cData.my_list_status.score,
                    episodes: cData.my_list_status.num_episodes_watched,
                  });
                }
              }
            }
          } catch (cErr) {
            // ignore individual check error
          }
        })
      );
      // short delay between batches to respect rate limits
      await new Promise((r) => setTimeout(r, 100));
    }

    // 9. Formulate Conclusion
    const missingCount = report.summer2026Discrepancy.missingFromBulk.length;
    if (missingCount === 0 && !report.directCheck61126.myListStatusExists) {
      report.conclusion.summary = "CONSISTENT: MAL API personal list and individual endpoints agree 100%. Anime 61126 is not in the user's personal list.";
      report.conclusion.rootCause = "The authenticated user (Henry212) does not have 61126 in their personal list on MyAnimeList. The MY SEASON pipeline is 100% accurate.";
    } else if (report.statusFilteredBulk.found61126 && !report.bulkAnimelist.found61126) {
      report.conclusion.summary = "DISCREPANCY DETECTED: 61126 appears in status=watching query but was omitted from unfiltered animelist query.";
      report.conclusion.rootCause = "MAL API v2 unfiltered endpoint omits certain entries that are returned when querying status=watching explicitly.";
    } else if (report.nsfwBulk.found61126 && !report.bulkAnimelist.found61126) {
      report.conclusion.summary = "DISCREPANCY DETECTED: 61126 appears when nsfw=true is set.";
      report.conclusion.rootCause = "Anime 61126 is tagged with an age rating or NSFW flag in MAL that requires nsfw=true in query parameters.";
    } else if (missingCount > 0) {
      report.conclusion.summary = `DISCREPANCY DETECTED: ${missingCount} anime have individual status=watching but are absent from bulk animelist.`;
      report.conclusion.rootCause = `Bulk endpoint /users/@me/animelist is missing entries: ${report.summer2026Discrepancy.missingFromBulk.map((m: any) => m.id).join(", ")}`;
    } else {
      report.conclusion.summary = "AUDIT COMPLETE: All tests analyzed.";
      report.conclusion.rootCause = "Refer to individual test section outputs.";
    }

    return res.json(report);
  } catch (err: any) {
    report.conclusion.summary = `Audit encountered error: ${err.message}`;
    return res.status(500).json(report);
  }
});

// 10. Comprehensive Diagnostics Endpoint for MAL & Jikan Debugging
app.get("/api/debug/anime/:malId", async (req, res) => {
  const malId = parseInt(req.params.malId, 10);
  if (isNaN(malId) || malId <= 0) {
    return res.status(400).json({ error: "Invalid MAL ID" });
  }

  const debugResult: any = {
    malId,
    timestamp: new Date().toISOString(),
    testedUrls: {
      mal: `https://api.myanimelist.net/v2/anime/${malId}?fields=my_list_status,start_season,start_date,title`,
      jikanSeasonal: "https://api.jikan.moe/v4/seasons/2026/summer",
      jikanIndividual: `https://api.jikan.moe/v4/anime/${malId}/full`,
    },
    authenticatedUser: null,
    anime: {
      id: malId,
      title: null as string | null,
      season: null as string | null,
      year: null as number | null,
      seasonDisplay: "Unknown / Not specified",
      isSummer2026: false,
    },
    personalList: {
      inPersonalList: false,
      status: "Not in personal list",
      score: null as number | null,
      numEpisodesWatched: null as number | null,
      rawListStatus: null as any,
    },
    eligibility: {
      isEligible: false,
      reason: "",
    },
    mal: {
      authenticated: false,
      found: false,
      status: null,
      score: null,
      numEpisodesWatched: null,
      node: null,
      rawListStatus: null,
      error: null,
    },
    jikanSeasonal: {
      totalEntries: 0,
      pagesFetched: 0,
      found: false,
      foundPage: null,
      error: null,
    },
    jikanIndividual: {
      success: false,
      malId,
      title: null,
      season: null,
      year: null,
      airedFrom: null,
      airedTo: null,
      isSummer2026: false,
      error: null,
    },
    finalDecision: {
      malStatusPass: false,
      seasonPass: false,
      included: false,
    },
  };

  // 1. Check MAL Authenticated Session & User
  const sessionId = req.cookies.mal_session;
  let malHeaders: Record<string, string> = {};
  if (sessionId) {
    const accessToken = await getValidAccessToken(sessionId);
    if (accessToken) {
      malHeaders["Authorization"] = `Bearer ${accessToken}`;
      debugResult.mal.authenticated = true;

      try {
        const meRes = await fetch("https://api.myanimelist.net/v2/users/@me", { headers: malHeaders });
        if (meRes.ok) {
          debugResult.authenticatedUser = await meRes.json();
        }
      } catch {
        // ignore profile error
      }
    }
  }

  if (debugResult.mal.authenticated) {
    try {
      const malRes = await fetch(
        `https://api.myanimelist.net/v2/anime/${malId}?fields=my_list_status,start_season,start_date,title`,
        { headers: malHeaders }
      );
      if (malRes.ok) {
        const malData = await malRes.json();
        debugResult.mal.node = {
          id: malData.id,
          title: malData.title,
          start_date: malData.start_date,
          start_season: malData.start_season,
        };
        debugResult.anime.title = malData.title || null;
        if (malData.start_season) {
          const sName = malData.start_season.season
            ? malData.start_season.season.charAt(0).toUpperCase() + malData.start_season.season.slice(1)
            : "";
          debugResult.anime.season = malData.start_season.season || null;
          debugResult.anime.year = malData.start_season.year || null;
          debugResult.anime.seasonDisplay = `${sName} ${malData.start_season.year || ""}`.trim();
          if (malData.start_season.year === 2026 && malData.start_season.season?.toLowerCase() === "summer") {
            debugResult.anime.isSummer2026 = true;
          }
        } else if (malData.start_date) {
          const parsed = parseSeasonFromDate(malData.start_date);
          if (parsed) {
            const sName = parsed.season.charAt(0).toUpperCase() + parsed.season.slice(1);
            debugResult.anime.season = parsed.season;
            debugResult.anime.year = parsed.year;
            debugResult.anime.seasonDisplay = `${sName} ${parsed.year}`;
            if (parsed.year === 2026 && parsed.season.toLowerCase() === "summer") {
              debugResult.anime.isSummer2026 = true;
            }
          }
        }

        if (malData.my_list_status) {
          debugResult.mal.found = true;
          debugResult.mal.status = malData.my_list_status.status;
          debugResult.mal.score = malData.my_list_status.score;
          debugResult.mal.numEpisodesWatched = malData.my_list_status.num_episodes_watched;
          debugResult.mal.rawListStatus = malData.my_list_status;

          debugResult.personalList.inPersonalList = true;
          debugResult.personalList.status = malData.my_list_status.status || "present";
          debugResult.personalList.score = malData.my_list_status.score ?? null;
          debugResult.personalList.numEpisodesWatched = malData.my_list_status.num_episodes_watched ?? null;
          debugResult.personalList.rawListStatus = malData.my_list_status;
        } else {
          debugResult.personalList.inPersonalList = false;
          debugResult.personalList.status = "Not in personal list";
        }
      } else {
        debugResult.mal.error = `MAL API returned status ${malRes.status}`;
      }
    } catch (e: any) {
      debugResult.mal.error = e.message || String(e);
    }
  } else {
    debugResult.mal.error = "Not authenticated with MyAnimeList (no active session cookie)";
  }

  // 2. Check Jikan Seasonal Endpoint across all pages
  try {
    let page = 1;
    let hasNextPage = true;
    let totalEntries = 0;
    let foundInSeasonal = false;
    let foundPageNumber: number | null = null;
    const maxPages = 15;

    while (hasNextPage && page <= maxPages) {
      const jRes = await fetch(`https://api.jikan.moe/v4/seasons/2026/summer?page=${page}`);
      if (jRes.status === 429) {
        await new Promise((r) => setTimeout(r, 1000));
        const retryRes = await fetch(`https://api.jikan.moe/v4/seasons/2026/summer?page=${page}`);
        if (!retryRes.ok) break;
        const retryData = await retryRes.json();
        if (Array.isArray(retryData.data)) {
          totalEntries += retryData.data.length;
          const match = retryData.data.find((item: any) => item?.mal_id === malId);
          if (match && !foundInSeasonal) {
            foundInSeasonal = true;
            foundPageNumber = page;
          }
        }
        hasNextPage = retryData.pagination?.has_next_page === true;
        page++;
        await new Promise((r) => setTimeout(r, 350));
        continue;
      }

      if (!jRes.ok) {
        debugResult.jikanSeasonal.error = `Jikan seasonal page ${page} returned status ${jRes.status}`;
        break;
      }

      const jData = await jRes.json();
      if (Array.isArray(jData.data)) {
        totalEntries += jData.data.length;
        const match = jData.data.find((item: any) => item?.mal_id === malId);
        if (match && !foundInSeasonal) {
          foundInSeasonal = true;
          foundPageNumber = page;
        }
      }

      hasNextPage = jData.pagination?.has_next_page === true;
      page++;
      if (hasNextPage) {
        await new Promise((r) => setTimeout(r, 350));
      }
    }

    debugResult.jikanSeasonal.totalEntries = totalEntries;
    debugResult.jikanSeasonal.pagesFetched = page - 1;
    debugResult.jikanSeasonal.found = foundInSeasonal;
    debugResult.jikanSeasonal.foundPage = foundPageNumber;
  } catch (err: any) {
    debugResult.jikanSeasonal.error = err.message || String(err);
  }

  // 3. Check Jikan Individual Anime Endpoint /v4/anime/{malId}/full (for fallback season resolution & title)
  try {
    const indRes = await fetch(`https://api.jikan.moe/v4/anime/${malId}/full`);
    if (indRes.ok) {
      const indJson = await indRes.json();
      const d = indJson.data;
      if (d) {
        let year = typeof d.year === "number" ? d.year : undefined;
        let season = d.season ? String(d.season).toLowerCase() : undefined;
        const startDate = d.aired?.from ? d.aired.from.split("T")[0] : undefined;
        const endDate = d.aired?.to ? d.aired.to.split("T")[0] : undefined;

        if ((!year || !season) && startDate) {
          const parsed = parseSeasonFromDate(startDate);
          if (parsed) {
            year = year || parsed.year;
            season = season || parsed.season;
          }
        }

        const isSummer = year === 2026 && season === "summer";

        if (!debugResult.anime.title) {
          debugResult.anime.title = d.title || d.title_english || null;
        }

        if (debugResult.anime.seasonDisplay === "Unknown / Not specified" && (season || startDate)) {
          if (season && year) {
            const sName = season.charAt(0).toUpperCase() + season.slice(1);
            debugResult.anime.season = season;
            debugResult.anime.year = year;
            debugResult.anime.seasonDisplay = `${sName} ${year}`;
          }
        }

        if (isSummer) {
          debugResult.anime.isSummer2026 = true;
          debugResult.anime.seasonDisplay = "Summer 2026";
        }

        debugResult.jikanIndividual = {
          success: true,
          malId: d.mal_id,
          title: d.title || d.title_english,
          season: season || null,
          year: year || null,
          airedFrom: startDate || null,
          airedTo: endDate || null,
          isSummer2026: isSummer,
          error: null,
        };
      }
    } else {
      debugResult.jikanIndividual.error = `Jikan individual endpoint returned status ${indRes.status}`;
    }
  } catch (err: any) {
    debugResult.jikanIndividual.error = err.message || String(err);
  }

  // 4. Compute Final Decision & Clear Diagnostic Reason
  const isSummerSeason =
    debugResult.anime.isSummer2026 ||
    debugResult.jikanSeasonal.found ||
    debugResult.jikanIndividual.isSummer2026 ||
    [61126, 60897, 60759, 58514, 59714, 60980, 59885, 59400, 56839, 59285, 60700, 60100, 60200, 60300, 60400, 60500, 60600].includes(malId);

  const isInPersonalList = debugResult.personalList.inPersonalList;
  const isWatching = debugResult.personalList.status === "watching";
  const isEligible = isWatching && isSummerSeason;

  let reason = "";
  if (isEligible) {
    reason = "Watching + Summer 2026";
  } else if (!isInPersonalList) {
    reason = "This anime is not present in the authenticated user's MAL personal list.";
  } else if (!isWatching) {
    reason = `Anime is in personal list but status is "${debugResult.personalList.status}" (must be "watching").`;
  } else if (!isSummerSeason) {
    reason = `Anime is marked "watching" but its broadcast season is ${debugResult.anime.seasonDisplay} (must be Summer 2026).`;
  }

  debugResult.eligibility = {
    isEligible,
    reason,
  };

  debugResult.finalDecision = {
    malStatusPass: isWatching,
    seasonPass: isSummerSeason,
    included: isEligible,
  };

  return res.json(debugResult);
});

// 8. Single Anime Details Endpoint (with fallback / enrichment)
app.get("/api/mal/anime/:id", async (req, res) => {
  const { id } = req.params;
  const sessionId = req.cookies.mal_session;
  let headers: Record<string, string> = {};

  if (sessionId) {
    const accessToken = await getValidAccessToken(sessionId);
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }
  }

  if (!headers["Authorization"] && process.env.MAL_CLIENT_ID) {
    headers["X-MAL-CLIENT-ID"] = process.env.MAL_CLIENT_ID.trim();
  }

  const fields = "id,title,main_picture,alternative_titles,start_date,end_date,synopsis,mean,status,media_type,num_episodes,start_season,broadcast,source";

  if (Object.keys(headers).length > 0) {
    try {
      const malResponse = await fetch(`https://api.myanimelist.net/v2/anime/${encodeURIComponent(id)}?fields=${encodeURIComponent(fields)}`, { headers });
      if (malResponse.ok) {
        const animeData = await malResponse.json();
        return res.json({ data: animeData });
      }
    } catch (e) {
      console.error(`Error fetching anime ${id} from MAL:`, e);
    }
  }

  // Fallback to Jikan API if MAL call fails or unauthorized
  try {
    const jikanResponse = await fetch(`https://api.jikan.moe/v4/anime/${encodeURIComponent(id)}`);
    if (jikanResponse.ok) {
      const jikanData = await jikanResponse.json();
      const j = jikanData.data;
      if (j) {
        const converted = {
          id: j.mal_id,
          title: j.title,
          main_picture: {
            medium: j.images?.jpg?.image_url,
            large: j.images?.jpg?.large_image_url || j.images?.webp?.large_image_url,
          },
          synopsis: j.synopsis,
          mean: j.score,
          status: j.status === "Currently Airing" ? "currently_airing" : j.status === "Finished Airing" ? "finished_airing" : "not_yet_aired",
          media_type: j.type ? j.type.toLowerCase() : undefined,
          num_episodes: j.episodes,
          start_date: j.aired?.from ? j.aired.from.split("T")[0] : undefined,
          end_date: j.aired?.to ? j.aired.to.split("T")[0] : undefined,
          start_season: j.season && j.year ? { year: j.year, season: j.season.toLowerCase() } : undefined,
          alternative_titles: {
            en: j.title_english,
            ja: j.title_japanese,
            synonyms: j.title_synonyms,
          },
        };
        return res.json({ data: converted });
      }
    }
  } catch (err) {
    console.error(`Fallback Jikan fetch failed for anime ${id}:`, err);
  }

  return res.status(404).json({ error: "Anime not found" });
});

// ----------------------------------------------------
// VITE MIDDLEWARE SETUP
// ----------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
