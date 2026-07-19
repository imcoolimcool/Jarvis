import { Router } from "express";
import { db, spotifyTokens } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger";

const router = Router();

const SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "streaming",
  "user-read-email",
  "user-read-private",
  "playlist-read-private",
  "user-library-read",
].join(" ");

function getSpotifyRedirectUri(): string {
  const domain =
    process.env["REPLIT_DEV_DOMAIN"] ??
    process.env["REPLIT_DOMAINS"] ??
    "localhost:8080";
  return `https://${domain}/api/jarvis/spotify/callback`;
}

function getClientId() {
  const id = process.env["SPOTIFY_CLIENT_ID"];
  if (!id) throw new Error("SPOTIFY_CLIENT_ID is not set");
  return id;
}

function getClientSecret() {
  const s = process.env["SPOTIFY_CLIENT_SECRET"];
  if (!s) throw new Error("SPOTIFY_CLIENT_SECRET is not set");
  return s;
}

/** GET /api/jarvis/spotify/auth */
router.get("/spotify/auth", (_req, res) => {
  const params = new URLSearchParams({
    client_id: getClientId(),
    response_type: "code",
    redirect_uri: getSpotifyRedirectUri(),
    scope: SCOPES,
    show_dialog: "true",
  });
  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
});

/** GET /api/jarvis/spotify/callback */
router.get("/spotify/callback", async (req, res) => {
  const code = req.query["code"] as string | undefined;
  const error = req.query["error"] as string | undefined;

  if (error || !code) {
    res.send(`<html><body><p>Auth failed: ${error ?? "no code"}. Close this tab.</p><script>setTimeout(()=>window.close(),2000);</script></body></html>`);
    return;
  }

  try {
    const creds = Buffer.from(`${getClientId()}:${getClientSecret()}`).toString("base64");
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${creds}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        redirect_uri: getSpotifyRedirectUri(),
        grant_type: "authorization_code",
      }),
    });

    const data = await tokenRes.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      error?: string;
    };

    if (data.error || !data.access_token) {
      logger.error({ data }, "Spotify token exchange failed");
      res.send("<html><body><p>Auth failed. Close this tab.</p><script>setTimeout(()=>window.close(),2000);</script></body></html>");
      return;
    }

    // Get display name
    const profileRes = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    const profile = await profileRes.json() as { display_name?: string };

    const expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;

    await db
      .insert(spotifyTokens)
      .values({
        id: "default",
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt,
        displayName: profile.display_name ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: spotifyTokens.id,
        set: {
          accessToken: data.access_token,
          ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
          expiresAt,
          displayName: profile.display_name ?? null,
          updatedAt: new Date(),
        },
      });

    res.send(`
      <html><body>
        <p>Spotify connected! You can close this tab.</p>
        <script>
          if (window.opener) { window.opener.postMessage('spotify_connected', '*'); }
          setTimeout(() => window.close(), 1000);
        </script>
      </body></html>
    `);
  } catch (err) {
    logger.error({ err }, "Spotify callback error");
    res.status(500).send("Authentication failed. Close this tab and try again.");
  }
});

/** GET /api/jarvis/spotify/status */
router.get("/spotify/status", async (_req, res) => {
  try {
    const [row] = await db.select().from(spotifyTokens).where(eq(spotifyTokens.id, "default"));
    if (!row) { res.json({ connected: false }); return; }
    res.json({ connected: true, displayName: row.displayName });
  } catch {
    res.json({ connected: false });
  }
});

/** DELETE /api/jarvis/spotify/disconnect */
router.delete("/spotify/disconnect", async (_req, res) => {
  try {
    await db.delete(spotifyTokens).where(eq(spotifyTokens.id, "default"));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to disconnect" });
  }
});

async function refreshSpotifyToken(row: typeof spotifyTokens.$inferSelect): Promise<string | null> {
  try {
    const creds = Buffer.from(`${getClientId()}:${getClientSecret()}`).toString("base64");
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${creds}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: row.refreshToken,
      }),
    });
    const data = await res.json() as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    const expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
    await db.update(spotifyTokens)
      .set({ accessToken: data.access_token, expiresAt, updatedAt: new Date() })
      .where(eq(spotifyTokens.id, "default"));
    return data.access_token;
  } catch {
    return null;
  }
}

export async function getSpotifyToken(): Promise<string | null> {
  try {
    const [row] = await db.select().from(spotifyTokens).where(eq(spotifyTokens.id, "default"));
    if (!row) return null;
    if (row.expiresAt < Date.now() + 5 * 60 * 1000) {
      return await refreshSpotifyToken(row);
    }
    return row.accessToken;
  } catch {
    return null;
  }
}

/** GET /api/jarvis/spotify/current — what's playing now */
router.get("/spotify/current", async (_req, res) => {
  try {
    const token = await getSpotifyToken();
    if (!token) { res.json({ playing: false }); return; }

    const r = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });

    if (r.status === 204 || !r.ok) { res.json({ playing: false }); return; }

    const data = await r.json() as {
      is_playing: boolean;
      item?: {
        name: string;
        artists: { name: string }[];
        album: { name: string; images: { url: string; width: number }[] };
        duration_ms: number;
        id: string;
      };
      progress_ms?: number;
    };

    if (!data.item) { res.json({ playing: false }); return; }

    res.json({
      playing: data.is_playing,
      track: data.item.name,
      artist: data.item.artists.map(a => a.name).join(", "),
      album: data.item.album.name,
      albumArt: data.item.album.images[0]?.url ?? null,
      progressMs: data.progress_ms ?? 0,
      durationMs: data.item.duration_ms,
      trackId: data.item.id,
    });
  } catch {
    res.json({ playing: false });
  }
});

/** POST /api/jarvis/spotify/control — playback control */
router.post("/spotify/control", async (req, res) => {
  const { action, query } = req.body as { action: string; query?: string };

  try {
    const token = await getSpotifyToken();
    if (!token) { res.status(401).json({ error: "Spotify not connected" }); return; }

    switch (action) {
      case "play":
        if (query) {
          // Search and play
          const searchRes = await fetch(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track,album,playlist&limit=5`,
            { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) }
          );
          const searchData = await searchRes.json() as {
            tracks?: { items: { uri: string; name: string; artists: { name: string }[] }[] };
            albums?: { items: { uri: string }[] };
            playlists?: { items: { uri: string }[] };
          };
          const trackUri = searchData.tracks?.items?.[0]?.uri;
          if (trackUri) {
            await fetch("https://api.spotify.com/v1/me/player/play", {
              method: "PUT",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ uris: [trackUri] }),
              signal: AbortSignal.timeout(5000),
            });
            const item = searchData.tracks!.items[0]!;
            res.json({ ok: true, track: item.name, artist: item.artists.map(a => a.name).join(", ") });
          } else {
            res.json({ ok: false, error: "No results found" });
          }
        } else {
          await fetch("https://api.spotify.com/v1/me/player/play", {
            method: "PUT",
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(5000),
          });
          res.json({ ok: true });
        }
        break;

      case "pause":
        await fetch("https://api.spotify.com/v1/me/player/pause", {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(5000),
        });
        res.json({ ok: true });
        break;

      case "next":
        await fetch("https://api.spotify.com/v1/me/player/next", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(5000),
        });
        res.json({ ok: true });
        break;

      case "previous":
        await fetch("https://api.spotify.com/v1/me/player/previous", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(5000),
        });
        res.json({ ok: true });
        break;

      case "volume":
        const vol = Math.min(100, Math.max(0, Number(req.body.volume ?? 50)));
        await fetch(`https://api.spotify.com/v1/me/player/volume?volume_percent=${vol}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(5000),
        });
        res.json({ ok: true });
        break;

      default:
        res.status(400).json({ error: "Unknown action" });
    }
  } catch (err) {
    logger.error({ err }, "Spotify control failed");
    res.status(500).json({ error: "Spotify control failed" });
  }
});

export default router;
