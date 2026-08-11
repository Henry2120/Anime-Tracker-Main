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
    const fields = [
      "list_status{status,score,num_episodes_watched,is_rewatching,updated_at,start_date,finish_date}",
      "num_episodes",
      "main_picture",
    ].join(",");

    const allItems: any[] = [];
    const seenIds = new Set<number>();
    let nextUrl: string | null = `https://api.myanimelist.net/v2/users/@me/animelist?limit=100&fields=${encodeURIComponent(fields)}`;

    while (nextUrl) {
      const malResponse = await fetch(nextUrl, {
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

      if (Array.isArray(listData.data)) {
        for (const item of listData.data) {
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

      if (listData.paging && typeof listData.paging.next === "string" && listData.paging.next.length > 0) {
        nextUrl = listData.paging.next;
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
