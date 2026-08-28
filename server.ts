import express from "express";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import path from "path";
import dotenv from "dotenv";
import fs from "fs";
import { DatabaseSync } from "node:sqlite";
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

// Stateless secure encryption using Node crypto (AES-256-GCM) shared across all Cloud Run instances
const ENCRYPTION_KEY = crypto.createHash('sha256')
  .update(process.env.MAL_CLIENT_SECRET || process.env.SESSION_SECRET || 'anime-tracker-fallback-secret-key-2026')
  .digest();

function encryptData(data: any): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const jsonStr = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(jsonStr, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptData(token: string): any {
  try {
    const buf = Buffer.from(token, 'base64');
    if (buf.length < 28) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch (err) {
    return null;
  }
}

interface SessionData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface PendingOAuthState {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
}

interface PendingHandoffTicket {
  sessionToken: string;
  expiresAt: number;
}

const pendingHandoffTickets = new Map<string, PendingHandoffTicket>();

setInterval(() => {
  const now = Date.now();
  for (const [ticket, data] of pendingHandoffTickets.entries()) {
    if (now > data.expiresAt) {
      pendingHandoffTickets.delete(ticket);
    }
  }
}, 5 * 60 * 1000);

// Helper to extract session token from Authorization header, x-mal-session header, or Cookie
function getSessionToken(req: express.Request): string | null {
  const authHeader = req.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    if (token && token !== "undefined" && token !== "null" && token !== "false") {
      return token;
    }
  }

  const customHeader = req.get("x-mal-session");
  if (customHeader && customHeader !== "undefined" && customHeader !== "null" && customHeader !== "false") {
    return customHeader.trim();
  }

  if (req.cookies && req.cookies.mal_session) {
    return req.cookies.mal_session;
  }

  return null;
}

// Helper to get or refresh valid access token for a session
async function getValidAccessToken(sessionId: string, res?: express.Response): Promise<string | null> {
  const session = decryptData(sessionId) as SessionData | null;
  if (!session || !session.accessToken || !session.refreshToken) return null;

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
      console.error("[MAL AUTH] Token refresh failed with status:", response.status);
      return null;
    }

    const tokenData = await response.json();
    const newSession: SessionData = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || session.refreshToken,
      expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
    };

    const newSessionToken = encryptData(newSession);
    if (res) {
      res.cookie("mal_session", newSessionToken, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
      res.setHeader("x-mal-session-token", newSessionToken);
    }
    return newSession.accessToken;
  } catch (err) {
    console.error("[MAL AUTH] Failed to refresh MAL access token", err);
    return null;
  }
}

// Helper to determine canonical deterministic redirect URI from request host (no MAL_REDIRECT_URI env dependency)
function getRedirectUri(req: express.Request): string {
  const host = req.get("x-forwarded-host") || req.get("host") || "";

  if (host.includes("anime-tracker-henry212.ai.studio")) {
    const publishedUri = "https://anime-tracker-henry212.ai.studio/api/auth/mal/callback";
    console.log("[MAL AUTH LOGIN] Request host:", host, "| Selected environment: Published | Selected redirect URI:", publishedUri);
    return publishedUri;
  }

  if (host.includes("ais-dev-53kvs4wvnwudsoh3n7pd6n-47012425890.asia-southeast1.run.app") || host.includes("run.app") || host.includes("localhost") || host.includes("127.0.0.1")) {
    const protoHeader = req.get("x-forwarded-proto");
    const protocol = protoHeader ? protoHeader.split(",")[0].trim() : (req.secure ? "https" : "http");
    const previewUri = host.includes("ais-dev-53kvs4wvnwudsoh3n7pd6n-47012425890.asia-southeast1.run.app")
      ? "https://ais-dev-53kvs4wvnwudsoh3n7pd6n-47012425890.asia-southeast1.run.app/api/auth/mal/callback"
      : `${protocol}://${host}/api/auth/mal/callback`;
    console.log("[MAL AUTH LOGIN] Request host:", host, "| Selected environment: Preview | Selected redirect URI:", previewUri);
    return previewUri;
  }

  console.error("[MAL AUTH LOGIN ERROR] Unrecognized request host:", host);
  throw new Error(`Unrecognized request host for OAuth redirect: ${host}`);
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
  console.log("[MAL DEBUG] /api/mal/login requested");
  const { clientId, isConfigured } = getMalCredentials();
  
  let redirectUri: string;
  try {
    redirectUri = getRedirectUri(req);
  } catch (err: any) {
    console.error(`[MAL DEBUG] /api/mal/login redirect URI error: ${err.message}`);
    return res.status(500).send(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center; color: #9f1239;">
          <h2>OAuth Configuration Error</h2>
          <p>${err.message}</p>
        </body>
      </html>
    `);
  }

  if (!clientId) {
    console.error("[MAL DEBUG] /api/mal/login failed: MAL_CLIENT_ID missing");
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
  console.log("[MAL DEBUG] /api/mal/login generated PKCE state and verifier");

  const pendingState: PendingOAuthState = {
    state,
    codeVerifier,
    redirectUri,
    createdAt: Date.now(),
  };

  const encryptedState = encryptData(pendingState);
  res.cookie("mal_oauth_state", encryptedState, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 10 * 60 * 1000, // 10 minutes
  });
  console.log(`[MAL DEBUG] /api/mal/login state cookie set | redirect_uri: ${redirectUri}`);

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
  const hasCode = Boolean(code);
  const hasState = Boolean(state);

  // Requirement 1: Log when callback is entered
  console.log(`[MAL DEBUG] /api/auth/mal/callback reached | code_present: ${hasCode} | state_present: ${hasState}`);

  if (error) {
    console.log(`[MAL DEBUG] /api/auth/mal/callback authorization error: ${error_description || error}`);
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

  if (typeof state !== "string") {
    console.error("[MAL DEBUG] /api/auth/mal/callback state parameter is not a string");
    return res.status(400).send("Invalid state parameter.");
  }

  const cookieStateToken = req.cookies.mal_oauth_state;
  const hasStateCookie = Boolean(cookieStateToken);
  console.log(`[MAL DEBUG] /api/auth/mal/callback state cookie lookup | cookie_present: ${hasStateCookie}`);

  if (!cookieStateToken) {
    console.error("[MAL DEBUG] /api/auth/mal/callback state cookie missing or expired");
    return res.status(400).send("Invalid or expired state parameter.");
  }

  const pending = decryptData(cookieStateToken) as PendingOAuthState | null;
  // Clear cookie immediately (single-use)
  res.clearCookie("mal_oauth_state", { httpOnly: true, secure: true, sameSite: "none" });

  if (!pending || pending.state !== state || (Date.now() - pending.createdAt > 10 * 60 * 1000)) {
    console.error(`[MAL DEBUG] /api/auth/mal/callback state validation failed | pending_exists: ${Boolean(pending)} | state_matches: ${pending?.state === state}`);
    return res.status(400).send("Invalid or expired state parameter.");
  }

  console.log("[MAL DEBUG] /api/auth/mal/callback state validation succeeded");

  const { codeVerifier, redirectUri } = pending;

  if (typeof code !== "string") {
    console.error("[MAL DEBUG] /api/auth/mal/callback code parameter missing");
    return res.status(400).send("Missing authorization code.");
  }

  const { clientId, clientSecret } = getMalCredentials();
  if (!clientId) {
    console.error("[MAL DEBUG] /api/auth/mal/callback MAL_CLIENT_ID missing");
    return res.status(500).send("MAL Client ID is not configured.");
  }

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

    console.log("[MAL DEBUG] /api/auth/mal/callback exchanging code with MAL...");
    const tokenResponse = await fetch("https://myanimelist.net/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    // Requirement 2: Log exchange success/failure and HTTP status
    console.log(`[MAL DEBUG] Token exchange response | success: ${tokenResponse.ok} | http_status: ${tokenResponse.status}`);

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error(`[MAL DEBUG] Token exchange failed | http_status: ${tokenResponse.status} | body: ${errText}`);
      return res.status(500).send("Failed to exchange code for access token.");
    }

    const tokenData = await tokenResponse.json();

    // Create session server-side in encrypted HttpOnly cookie
    const sessionData: SessionData = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
    };
    const sessionToken = encryptData(sessionData);

    // Set secure HttpOnly cookie for iframe/standalone compatibility
    res.cookie("mal_session", sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    // Generate short-lived, single-use handoff ticket for cross-context / iframe handoff
    const handoffTicket = crypto.randomBytes(32).toString("hex");
    pendingHandoffTickets.set(handoffTicket, {
      sessionToken,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    });

    // Requirement 3: Log that session was created & boolean indicating session exists
    console.log("[MAL DEBUG] Authenticated session created and stored | session_exists: true | ticket_generated: true");

    // Requirement 5: Log postMessage / redirect
    console.log("[MAL DEBUG] Sending callback success response (postMessage MAL_OAUTH_SUCCESS)");

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
                window.opener.postMessage({ type: 'MAL_OAUTH_SUCCESS', ticket: '${handoffTicket}' }, '*');
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
    console.error("[MAL DEBUG] /api/auth/mal/callback unexpected error:", err);
    res.status(500).send("An unexpected error occurred during authentication.");
  }
});

// 2b. One-Time Ticket Exchange Endpoint
app.post("/api/mal/session/exchange", (req, res) => {
  const { ticket } = req.body || {};

  if (typeof ticket !== "string" || !ticket) {
    console.warn("[MAL DEBUG] /api/mal/session/exchange ticket missing");
    return res.status(400).json({ error: "Ticket parameter is required" });
  }

  const handoff = pendingHandoffTickets.get(ticket);
  if (!handoff) {
    console.warn("[MAL DEBUG] /api/mal/session/exchange invalid or already consumed ticket");
    return res.status(401).json({ error: "Invalid or expired handoff ticket" });
  }

  // Single-use: consume ticket immediately
  pendingHandoffTickets.delete(ticket);

  if (Date.now() > handoff.expiresAt) {
    console.warn("[MAL DEBUG] /api/mal/session/exchange ticket expired");
    return res.status(401).json({ error: "Handoff ticket has expired" });
  }

  // Set cookie on response as well (for standalone window compatibility)
  res.cookie("mal_session", handoff.sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  console.log("[MAL DEBUG] /api/mal/session/exchange ticket successfully consumed & sessionToken returned");
  return res.json({ success: true, sessionToken: handoff.sessionToken });
});

// 3. Authenticated MAL User Profile Endpoint
app.get("/api/mal/me", async (req, res) => {
  const sessionId = getSessionToken(req);
  const hasToken = Boolean(sessionId);

  console.log(`[MAL DEBUG] /api/mal/me request received | session_present: ${hasToken}`);

  if (!sessionId) {
    console.log("[MAL DEBUG] /api/mal/me outcome | session_resolved: false | authenticated: false");
    return res.json({ authenticated: false });
  }

  const accessToken = await getValidAccessToken(sessionId, res);
  const sessionResolved = Boolean(accessToken);
  console.log(`[MAL DEBUG] /api/mal/me session resolved: ${sessionResolved}`);

  if (!accessToken) {
    console.log("[MAL DEBUG] /api/mal/me outcome | session_resolved: false | authenticated: false");
    res.clearCookie("mal_session", { httpOnly: true, secure: true, sameSite: "none" });
    return res.json({ authenticated: false });
  }

  try {
    const malResponse = await fetch("https://api.myanimelist.net/v2/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    console.log(`[MAL DEBUG] /api/mal/me profile fetch HTTP status: ${malResponse.status}`);

    if (!malResponse.ok) {
      if (malResponse.status === 401) {
        console.log("[MAL DEBUG] /api/mal/me outcome | mal_status: 401 | session_resolved: false | authenticated: false");
        res.clearCookie("mal_session", { httpOnly: true, secure: true, sameSite: "none" });
        return res.json({ authenticated: false });
      }
      console.log(`[MAL DEBUG] /api/mal/me outcome | mal_status: ${malResponse.status} | authenticated: false`);
      return res.status(malResponse.status).json({ error: "Failed to fetch MAL profile" });
    }

    const userData = await malResponse.json();
    console.log("[MAL DEBUG] /api/mal/me outcome | session_resolved: true | authenticated: true");
    res.json({ authenticated: true, user: userData });
  } catch (err) {
    console.error("[MAL DEBUG] /api/mal/me unexpected error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 4. Authenticated MAL User Anime List Endpoint
app.get("/api/mal/animelist", async (req, res) => {
  const sessionId = getSessionToken(req);
  if (!sessionId) {
    return res.status(401).json({ error: "Not authenticated with MyAnimeList" });
  }

  const accessToken = await getValidAccessToken(sessionId, res);
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
      "list_status{status,score,num_episodes_watched,is_rewatching,start_date,finish_date,tags,comments,updated_at}",
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
  const sessionId = getSessionToken(req);

  let headers: Record<string, string> = {};

  if (sessionId) {
    const accessToken = await getValidAccessToken(sessionId, res);
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
    const sessionId = getSessionToken(req);
    let headers: Record<string, string> = {};
    if (sessionId) {
      const accessToken = await getValidAccessToken(sessionId, res);
      if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
    }
    if (!headers["Authorization"] && process.env.MAL_CLIENT_ID) {
      headers["X-MAL-CLIENT-ID"] = process.env.MAL_CLIENT_ID.trim();
    }

    if (Object.keys(headers).length > 0) {
      try {
        const malRes = await fetch(
          `https://api.myanimelist.net/v2/anime/${encodeURIComponent(malId)}?fields=start_season,start_date,title`,
          { headers }
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

// Single Anime Details Endpoint (with fallback / enrichment)
app.get("/api/mal/anime/:id", async (req, res) => {
  const { id } = req.params;
  const sessionId = getSessionToken(req);
  let headers: Record<string, string> = {};

  if (sessionId) {
    const accessToken = await getValidAccessToken(sessionId, res);
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
// RELEASE CALENDAR (AniList GraphQL API + Caching)
// ----------------------------------------------------
interface CachedReleaseCalendar {
  cachedAt: number;
  data: any[];
}
const releaseCalendarCache = new Map<string, CachedReleaseCalendar>();
const CALENDAR_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

const ANILIST_SCHEDULE_QUERY = `
query ($page: Int, $perPage: Int, $airingAt_greater: Int, $airingAt_lesser: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      hasNextPage
      total
    }
    airingSchedules(airingAt_greater: $airingAt_greater, airingAt_lesser: $airingAt_lesser, sort: TIME) {
      id
      airingAt
      episode
      mediaId
      media {
        id
        idMal
        title {
          romaji
          english
          native
          userPreferred
        }
        coverImage {
          extraLarge
          large
          medium
        }
        format
        status
        episodes
        studios(isMain: true) {
          nodes {
            name
          }
        }
      }
    }
  }
}
`;

app.get("/api/release-calendar", async (req, res) => {
  const startQuery = req.query.start ? parseInt(req.query.start as string, 10) : NaN;
  const endQuery = req.query.end ? parseInt(req.query.end as string, 10) : NaN;

  const nowSec = Math.floor(Date.now() / 1000);
  const startSec = !isNaN(startQuery) && startQuery > 0 ? startQuery : nowSec - 7 * 86400;
  const endSec = !isNaN(endQuery) && endQuery > 0 ? endQuery : nowSec + 7 * 86400;

  const cacheKey = `${startSec}_${endSec}`;
  const cached = releaseCalendarCache.get(cacheKey);

  if (cached && Date.now() - cached.cachedAt < CALENDAR_CACHE_TTL) {
    return res.json({ data: cached.data, cached: true });
  }

  try {
    let page = 1;
    let hasNextPage = true;
    const allSchedules: any[] = [];
    const maxPages = 10;

    while (hasNextPage && page <= maxPages) {
      const anilistResponse = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          query: ANILIST_SCHEDULE_QUERY,
          variables: {
            page,
            perPage: 50,
            airingAt_greater: startSec,
            airingAt_lesser: endSec,
          },
        }),
      });

      if (!anilistResponse.ok) {
        throw new Error(`AniList GraphQL endpoint responded with status ${anilistResponse.status}`);
      }

      const json = await anilistResponse.json();
      if (json.errors && json.errors.length > 0) {
        throw new Error(json.errors[0]?.message || "AniList GraphQL error");
      }

      const schedules = json.data?.Page?.airingSchedules || [];
      allSchedules.push(...schedules);
      hasNextPage = json.data?.Page?.pageInfo?.hasNextPage === true;
      page++;
    }

    // Normalize items into consistent structure
    const normalizedData = allSchedules.map((item) => {
      const media = item.media;
      const studioName = media?.studios?.nodes?.[0]?.name || null;
      const rawEnglish = media?.title?.english;
      const titleEnglish =
        typeof rawEnglish === "string" && rawEnglish.trim().length > 0
          ? rawEnglish.trim()
          : null;
      const hasEnglishTitle = Boolean(titleEnglish);

      const rawEpisodes = media?.episodes;
      const totalEpisodes =
        typeof rawEpisodes === "number" && rawEpisodes > 0
          ? rawEpisodes
          : null;

      return {
        id: item.id,
        malId: media?.idMal || null,
        anilistId: media?.id || item.mediaId,
        title: {
          romaji: media?.title?.romaji || "",
          english: media?.title?.english || "",
          native: media?.title?.native || "",
          userPreferred:
            media?.title?.userPreferred ||
            media?.title?.english ||
            media?.title?.romaji ||
            media?.title?.native ||
            "Untitled",
        },
        titleEnglish,
        titleNative: media?.title?.native || null,
        titleRomaji: media?.title?.romaji || null,
        hasEnglishTitle,
        totalEpisodes,
        episode: item.episode ?? null,
        airingAt: item.airingAt,
        imageUrl: media?.coverImage?.large || media?.coverImage?.medium || null,
        studio: studioName,
        format: media?.format || null,
      };
    });

    // Save to cache
    releaseCalendarCache.set(cacheKey, {
      cachedAt: Date.now(),
      data: normalizedData,
    });

    return res.json({ data: normalizedData, cached: false });
  } catch (err: any) {
    console.error("Error querying AniList airing schedule:", err);

    // Fallback: check if we have any cached data for this key even if expired
    if (cached) {
      return res.json({
        data: cached.data,
        cached: true,
        stale: true,
        warning: "Served from stale cache due to upstream provider rate limits.",
      });
    }

    return res.status(502).json({
      error: "Unable to load the release schedule. Please try again.",
      details: err.message || String(err),
    });
  }
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
