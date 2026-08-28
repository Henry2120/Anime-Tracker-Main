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

// Trust reverse proxy for HTTPS protocol and forwarded host headers
app.set("trust proxy", 1);

app.use(express.json());
app.use(cookieParser());

// Server-side session and OAuth state interfaces
interface SessionData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface PendingOAuthState {
  codeVerifier: string;
  returnOrigin?: string;
  createdAt: number;
}

interface HandoffExchangePayload {
  sessionToken: string;
  targetOrigin: string;
  issuedAt: number;
  nonce: string;
}

// In-memory cache for fast lookups on warm instances
const userSessions = new Map<string, SessionData>();
const pendingStates = new Map<string, PendingOAuthState>();
const consumedHandoffNonces = new Set<string>();

// Helper to derive a 256-bit encryption key from server secrets
function getSessionEncryptionKey(): Buffer {
  const secret =
    process.env.SESSION_SECRET ||
    process.env.MAL_CLIENT_SECRET ||
    process.env.MAL_CLIENT_ID ||
    "mal-secure-session-encryption-key-v1";
  return crypto.createHash("sha256").update(secret).digest();
}

// Encrypt payload into compact URL-safe base64url string (AES-256-GCM)
function encryptPayload(data: any): string {
  const key = getSessionEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(JSON.stringify(data), "utf8", "base64url");
  encrypted += cipher.final("base64url");
  const tag = cipher.getAuthTag().toString("base64url");
  return `${iv.toString("base64url")}.${encrypted}.${tag}`;
}

// Decrypt payload from AES-256-GCM token
function decryptPayload<T = any>(tokenStr: string): T | null {
  if (!tokenStr || typeof tokenStr !== "string") return null;
  const parts = tokenStr.split(".");
  if (parts.length !== 3) return null;
  try {
    const key = getSessionEncryptionKey();
    const iv = Buffer.from(parts[0], "base64url");
    const encrypted = parts[1];
    const tag = Buffer.from(parts[2], "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted, "base64url", "utf8");
    decrypted += decipher.final("utf8");
    return JSON.parse(decrypted) as T;
  } catch {
    return null;
  }
}

// Clean up expired pending in-memory OAuth states and handoff nonces periodically
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of pendingStates.entries()) {
    if (now - data.createdAt > 15 * 60 * 1000) {
      pendingStates.delete(state);
    }
  }
  // Clear old consumed nonces if set grows large (re-keyed by periodic sweep)
  if (consumedHandoffNonces.size > 2000) {
    consumedHandoffNonces.clear();
  }
}, 5 * 60 * 1000);

// Helper to determine canonical redirect URI
function getRedirectUri(req?: express.Request): string {
  // Always reload dotenv in case environment was updated dynamically
  dotenv.config({ override: true });
  dotenv.config({ path: ".env.local", override: true });

  const rawMalRedirectUri = process.env.MAL_REDIRECT_URI;
  if (
    typeof rawMalRedirectUri === "string" &&
    rawMalRedirectUri.trim() !== "" &&
    rawMalRedirectUri.trim() !== "MY_MAL_REDIRECT_URI"
  ) {
    let uri = rawMalRedirectUri.trim();
    if (!uri.startsWith("http://") && !uri.startsWith("https://")) {
      uri = `https://${uri}`;
    }
    return uri;
  }

  const rawAppUrl = process.env.APP_URL;
  if (
    typeof rawAppUrl === "string" &&
    rawAppUrl.trim() !== "" &&
    rawAppUrl.trim() !== "MY_APP_URL"
  ) {
    const baseUrl = rawAppUrl.trim().replace(/\/$/, "");
    return `${baseUrl}/api/auth/mal/callback`;
  }

  if (req) {
    const forwardedHost = req.get("x-forwarded-host");
    const host = forwardedHost || req.get("host") || "localhost:3000";
    const proto = req.get("x-forwarded-proto") || (req.secure ? "https" : "http");
    return `${proto}://${host}/api/auth/mal/callback`;
  }

  return "https://anime-tracker-henry212.ai.studio/api/auth/mal/callback";
}

// Helper to validate allowed application origins for handoff postMessage and token exchange
function isAllowedAppOrigin(origin: string): boolean {
  if (!origin || typeof origin !== "string") return false;
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname;
    // Allow production domain
    if (host === "anime-tracker-henry212.ai.studio") return true;
    // Allow Google AI Studio Cloud Run previews
    if (host.endsWith(".run.app") || host.endsWith(".aistudio.google.com") || host.endsWith(".ai.studio")) return true;
    // Allow local development
    if (host === "localhost" || host === "127.0.0.1") return true;
    return false;
  } catch {
    return false;
  }
}

// Helper to extract session token from Authorization header, custom header, or cookie
function extractSessionToken(req: express.Request): string | null {
  const auth = req.headers.authorization;
  if (auth && typeof auth === "string" && auth.startsWith("Bearer ")) {
    const token = auth.substring(7).trim();
    if (token && token !== "null" && token !== "undefined") return token;
  }
  const customHeader = req.headers["x-mal-session"];
  if (typeof customHeader === "string" && customHeader.trim() && customHeader !== "null" && customHeader !== "undefined") {
    return customHeader.trim();
  }
  if (req.cookies && typeof req.cookies.mal_session === "string" && req.cookies.mal_session.trim()) {
    return req.cookies.mal_session.trim();
  }
  return null;
}

// Helper to get or refresh valid access token for a session
async function getValidAccessToken(
  rawTokenOrSessionId: string
): Promise<{ accessToken: string; updatedSessionToken?: string } | null> {
  // 1. Check in-memory cache first
  let session = userSessions.get(rawTokenOrSessionId);

  // 2. If not in memory, decrypt from stateless token
  if (!session) {
    const decrypted = decryptPayload<SessionData>(rawTokenOrSessionId);
    if (decrypted && decrypted.accessToken && decrypted.refreshToken) {
      session = decrypted;
      userSessions.set(rawTokenOrSessionId, session);
    }
  }

  if (!session) return null;

  // Check if token is still valid (with 60-second buffer)
  if (Date.now() < session.expiresAt - 60 * 1000) {
    return { accessToken: session.accessToken };
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
      userSessions.delete(rawTokenOrSessionId);
      return null;
    }

    const tokenData = await response.json();
    const newSession: SessionData = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
    };

    const newSessionToken = encryptPayload(newSession);
    userSessions.delete(rawTokenOrSessionId);
    userSessions.set(newSessionToken, newSession);

    return {
      accessToken: newSession.accessToken,
      updatedSessionToken: newSessionToken,
    };
  } catch (err) {
    console.error("Failed to refresh MAL access token", err);
    userSessions.delete(rawTokenOrSessionId);
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
app.get("/api/mal/config", (req, res) => {
  const { isConfigured } = getMalCredentials();
  const redirectUri = getRedirectUri(req);
  res.json({ configured: isConfigured, redirectUri });
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

  // Determine calling origin if provided (e.g. from query param or referer)
  let returnOrigin: string | undefined = undefined;
  const requestedOrigin = typeof req.query.origin === "string" ? req.query.origin.trim() : undefined;
  if (requestedOrigin && isAllowedAppOrigin(requestedOrigin)) {
    returnOrigin = requestedOrigin;
  } else if (req.headers.referer) {
    try {
      const refUrl = new URL(req.headers.referer);
      if (isAllowedAppOrigin(refUrl.origin)) {
        returnOrigin = refUrl.origin;
      }
    } catch {
      // Ignore invalid referer
    }
  }

  // Generate PKCE code verifier (64-128 chars, RFC 7636 compliant)
  const codeVerifier = crypto.randomBytes(48).toString("hex");

  const redirectUri = getRedirectUri(req);

  // Create encrypted stateless CSRF state token containing the PKCE verifier, canonical redirectUri, and returnOrigin
  const statePayload = {
    codeVerifier,
    redirectUri,
    returnOrigin,
    createdAt: Date.now(),
    nonce: crypto.randomBytes(8).toString("hex"),
  };
  const state = encryptPayload(statePayload);

  // Also store in in-memory cache as fallback
  pendingStates.set(state, {
    codeVerifier,
    returnOrigin,
    createdAt: Date.now(),
  });

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

// 2. MAL OAuth Callback Endpoint (handles both /api/auth/mal/callback and trailing slash)
const malCallbackHandler: express.RequestHandler = async (req, res) => {
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

  let codeVerifier: string | null = null;
  let redirectUriFromState: string | null = null;
  let returnOriginFromState: string | null = null;

  // 1. First attempt: stateless decryption of state parameter (works across any Cloud Run instance)
  if (typeof state === "string") {
    const decryptedState = decryptPayload<{ codeVerifier: string; redirectUri?: string; returnOrigin?: string; createdAt: number }>(state);
    if (
      decryptedState &&
      typeof decryptedState.codeVerifier === "string" &&
      Date.now() - (decryptedState.createdAt || 0) < 15 * 60 * 1000
    ) {
      codeVerifier = decryptedState.codeVerifier;
      if (decryptedState.redirectUri) {
        redirectUriFromState = decryptedState.redirectUri;
      }
      if (decryptedState.returnOrigin && isAllowedAppOrigin(decryptedState.returnOrigin)) {
        returnOriginFromState = decryptedState.returnOrigin;
      }
    }
  }

  // 2. Second attempt: in-memory fallback
  if (!codeVerifier && typeof state === "string" && pendingStates.has(state)) {
    const pending = pendingStates.get(state);
    if (pending && Date.now() - pending.createdAt < 15 * 60 * 1000) {
      codeVerifier = pending.codeVerifier;
      if (pending.returnOrigin && isAllowedAppOrigin(pending.returnOrigin)) {
        returnOriginFromState = pending.returnOrigin;
      }
    }
    pendingStates.delete(state);
  }

  if (!codeVerifier) {
    return res.status(400).send("Invalid or expired state parameter.");
  }

  if (typeof code !== "string") {
    return res.status(400).send("Missing authorization code.");
  }

  const { clientId, clientSecret } = getMalCredentials();
  if (!clientId) {
    return res.status(500).send("MAL Client ID is not configured.");
  }
  const redirectUri = redirectUriFromState || getRedirectUri(req);

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
      console.error("MAL Token Exchange Failure Diagnostics:", {
        httpStatus: tokenResponse.status,
        statusText: tokenResponse.statusText,
        responseBody: errText,
        redirectUriSentToToken: redirectUri,
        redirectUriFromState: redirectUriFromState || null,
        hasClientId: Boolean(clientId),
        hasClientSecret: Boolean(clientSecret),
        hasCodeVerifier: Boolean(codeVerifier),
        codeVerifierLength: codeVerifier ? codeVerifier.length : 0,
      });

      return res.status(tokenResponse.status).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>MAL Token Exchange Diagnostic</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; max-width: 650px; margin: 0 auto; color: #1e293b; background: #f8fafc; }
              .box { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
              h2 { color: #dc2626; margin-top: 0; font-size: 18px; }
              pre { background: #0f172a; color: #f8fafc; padding: 14px; border-radius: 8px; font-size: 13px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; }
              table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 13px; }
              td { padding: 6px 0; border-bottom: 1px solid #f1f5f9; }
              td.label { font-weight: 600; width: 180px; color: #475569; }
              code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="box">
              <h2>MAL Token Exchange Failed</h2>
              
              <div style="font-weight: 600; margin-bottom: 6px; font-size: 13px; color: #334155;">MAL Response Body:</div>
              <pre>${errText.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>

              <table>
                <tr><td class="label">HTTP Status:</td><td><code>${tokenResponse.status} ${tokenResponse.statusText}</code></td></tr>
                <tr><td class="label">Redirect URI Used:</td><td><code>${redirectUri}</code></td></tr>
                <tr><td class="label">hasClientId:</td><td><code>${Boolean(clientId)}</code></td></tr>
                <tr><td class="label">hasClientSecret:</td><td><code>${Boolean(clientSecret)}</code></td></tr>
                <tr><td class="label">hasCodeVerifier:</td><td><code>${Boolean(codeVerifier)}</code></td></tr>
                <tr><td class="label">codeVerifierLength:</td><td><code>${codeVerifier ? codeVerifier.length : 0}</code></td></tr>
              </table>

              <button onclick="window.close()" style="margin-top: 18px; padding: 8px 16px; background: #475569; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">Close Window</button>
            </div>
          </body>
        </html>
      `);
    }

    const tokenData = await tokenResponse.json();

    const sessionPayload: SessionData = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
    };

    // Encrypt session data into stateless signed token
    const sessionToken = encryptPayload(sessionPayload);
    userSessions.set(sessionToken, sessionPayload);

    // Set secure HttpOnly cookie with SameSite=None and Partitioned for iframe/cross-origin context on production origin
    res.cookie("mal_session", sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      // @ts-ignore - Partitioned cookie attribute for modern browsers
      partitioned: true,
    });

    res.setHeader("x-mal-session", sessionToken);

    // Create a secure short-lived (60 seconds) single-use handoff ticket for preview cross-origin relay
    const handoffTargetOrigin = returnOriginFromState || "https://anime-tracker-henry212.ai.studio";
    const handoffPayload: HandoffExchangePayload = {
      sessionToken,
      targetOrigin: handoffTargetOrigin,
      issuedAt: Date.now(),
      nonce: crypto.randomBytes(16).toString("hex"),
    };
    const handoffTicket = encryptPayload(handoffPayload);

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
                const targetOrigin = ${JSON.stringify(handoffTargetOrigin)};
                const messageData = {
                  type: 'MAL_OAUTH_SUCCESS',
                  handoffTicket: ${JSON.stringify(handoffTicket)}
                };
                
                // Post specifically to the validated target origin
                window.opener.postMessage(messageData, targetOrigin);
                setTimeout(() => window.close(), 600);
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
};

app.get("/api/auth/mal/callback", malCallbackHandler);
app.get("/api/auth/mal/callback/", malCallbackHandler);

// 2b. Secure Single-Use Handoff Exchange Endpoint (called by Preview backend to establish session cookie)
app.post("/api/mal/handoff", (req, res) => {
  const { handoffTicket } = req.body;
  if (!handoffTicket || typeof handoffTicket !== "string") {
    return res.status(400).json({ error: "Missing handoff ticket." });
  }

  const payload = decryptPayload<HandoffExchangePayload>(handoffTicket);
  if (!payload || !payload.sessionToken || !payload.nonce || !payload.issuedAt) {
    return res.status(400).json({ error: "Invalid handoff ticket." });
  }

  // Ticket valid for max 60 seconds
  if (Date.now() - payload.issuedAt > 60 * 1000) {
    return res.status(400).json({ error: "Handoff ticket has expired." });
  }

  // Prevent replay attacks by checking single-use nonce
  if (consumedHandoffNonces.has(payload.nonce)) {
    return res.status(400).json({ error: "Handoff ticket has already been used." });
  }
  consumedHandoffNonces.add(payload.nonce);

  const sessionToken = payload.sessionToken;

  // Validate the decrypted session data inside sessionToken
  const sessionData = decryptPayload<SessionData>(sessionToken);
  if (!sessionData || !sessionData.accessToken || !sessionData.refreshToken) {
    return res.status(400).json({ error: "Invalid session embedded in handoff ticket." });
  }

  // Cache in memory for this preview instance
  userSessions.set(sessionToken, sessionData);

  // Set the secure HttpOnly cookie on the preview origin
  res.cookie("mal_session", sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    // @ts-ignore
    partitioned: true,
  });

  res.setHeader("x-mal-session", sessionToken);

  return res.json({
    success: true,
    sessionToken,
  });
});

// 3. Authenticated MAL User Profile Endpoint
app.get("/api/mal/me", async (req, res) => {
  const sessionToken = extractSessionToken(req);
  if (!sessionToken) {
    return res.json({ authenticated: false });
  }

  const tokenInfo = await getValidAccessToken(sessionToken);
  if (!tokenInfo) {
    res.clearCookie("mal_session", { httpOnly: true, secure: true, sameSite: "none", path: "/" });
    return res.json({ authenticated: false });
  }

  if (tokenInfo.updatedSessionToken) {
    res.cookie("mal_session", tokenInfo.updatedSessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
      maxAge: 30 * 24 * 60 * 60 * 1000,
      // @ts-ignore
      partitioned: true,
    });
    res.setHeader("x-mal-session", tokenInfo.updatedSessionToken);
  }

  try {
    const malResponse = await fetch("https://api.myanimelist.net/v2/users/@me", {
      headers: { Authorization: `Bearer ${tokenInfo.accessToken}` },
    });

    if (!malResponse.ok) {
      if (malResponse.status === 401) {
        userSessions.delete(sessionToken);
        res.clearCookie("mal_session", { httpOnly: true, secure: true, sameSite: "none", path: "/" });
        return res.json({ authenticated: false });
      }
      return res.status(malResponse.status).json({ error: "Failed to fetch MAL profile" });
    }

    const userData = await malResponse.json();
    res.json({
      authenticated: true,
      user: userData,
      sessionToken: tokenInfo.updatedSessionToken || sessionToken,
    });
  } catch (err) {
    console.error("Error fetching MAL user profile:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 4. Authenticated MAL User Anime List Endpoint
app.get("/api/mal/animelist", async (req, res) => {
  const sessionToken = extractSessionToken(req);
  if (!sessionToken) {
    return res.status(401).json({ error: "Not authenticated with MyAnimeList" });
  }

  const tokenInfo = await getValidAccessToken(sessionToken);
  if (!tokenInfo) {
    res.clearCookie("mal_session", { httpOnly: true, secure: true, sameSite: "none", path: "/" });
    return res.status(401).json({ error: "Session expired or invalid" });
  }

  if (tokenInfo.updatedSessionToken) {
    res.cookie("mal_session", tokenInfo.updatedSessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
      maxAge: 30 * 24 * 60 * 60 * 1000,
      // @ts-ignore
      partitioned: true,
    });
    res.setHeader("x-mal-session", tokenInfo.updatedSessionToken);
  }

  try {
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
        headers: { Authorization: `Bearer ${tokenInfo.accessToken}` },
      });

      if (!malResponse.ok) {
        if (malResponse.status === 401) {
          userSessions.delete(sessionToken);
          res.clearCookie("mal_session", { httpOnly: true, secure: true, sameSite: "none", path: "/" });
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
  const sessionToken = extractSessionToken(req);
  if (sessionToken) {
    userSessions.delete(sessionToken);
  }
  res.clearCookie("mal_session", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
  });
  res.json({ success: true });
});

// 6. Seasonal Anime Endpoint (with pagination & client-id fallback)
app.get("/api/mal/season/:year/:season", async (req, res) => {
  const { year, season } = req.params;
  const sessionToken = extractSessionToken(req);

  let headers: Record<string, string> = {};

  if (sessionToken) {
    const tokenInfo = await getValidAccessToken(sessionToken);
    if (tokenInfo) {
      headers["Authorization"] = `Bearer ${tokenInfo.accessToken}`;
      if (tokenInfo.updatedSessionToken) {
        res.cookie("mal_session", tokenInfo.updatedSessionToken, {
          httpOnly: true,
          secure: true,
          sameSite: "none",
          path: "/",
          maxAge: 30 * 24 * 60 * 60 * 1000,
          // @ts-ignore
          partitioned: true,
        });
        res.setHeader("x-mal-session", tokenInfo.updatedSessionToken);
      }
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
        if (malResponse.status === 401 && sessionToken) {
          userSessions.delete(sessionToken);
          res.clearCookie("mal_session", { httpOnly: true, secure: true, sameSite: "none", path: "/" });
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
    const sessionToken = extractSessionToken(req);
    let malHeaders: Record<string, string> = {};
    if (sessionToken) {
      const tokenInfo = await getValidAccessToken(sessionToken);
      if (tokenInfo) malHeaders["Authorization"] = `Bearer ${tokenInfo.accessToken}`;
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

// Single Anime Details Endpoint (with fallback / enrichment)
app.get("/api/mal/anime/:id", async (req, res) => {
  const { id } = req.params;
  const sessionToken = extractSessionToken(req);
  let headers: Record<string, string> = {};

  if (sessionToken) {
    const tokenInfo = await getValidAccessToken(sessionToken);
    if (tokenInfo) {
      headers["Authorization"] = `Bearer ${tokenInfo.accessToken}`;
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
