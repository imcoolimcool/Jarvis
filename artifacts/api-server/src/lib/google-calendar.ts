/**
 * Google Calendar API helper — fetches upcoming events using an OAuth access token.
 * Shared credentials with Gmail (same OAuth flow, calendar scope added).
 */

import { db, gmailTokens } from "@workspace/db";
import { eq } from "drizzle-orm";

interface GCalEvent {
  id: string;
  summary?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

/** Get a valid access token with calendar scope (reuses Gmail token store) */
async function getCalendarAccessToken(): Promise<string | null> {
  try {
    const [row] = await db.select().from(gmailTokens).where(eq(gmailTokens.id, "default"));
    if (!row) return null;

    // If token is expiring soon, refresh it
    if (row.expiresAt < Date.now() + 5 * 60 * 1000) {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env["GOOGLE_CLIENT_ID"] ?? "",
          client_secret: process.env["GOOGLE_CLIENT_SECRET"] ?? "",
          refresh_token: row.refreshToken,
          grant_type: "refresh_token",
        }),
      });
      const data = await res.json() as { access_token?: string; expires_in?: number };
      if (!data.access_token) return null;
      const expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
      await db.update(gmailTokens)
        .set({ accessToken: data.access_token, expiresAt, updatedAt: new Date() })
        .where(eq(gmailTokens.id, "default"));
      return data.access_token;
    }

    return row.accessToken;
  } catch {
    return null;
  }
}

export interface GoogleCalendarEvent {
  id: string;
  title: string;
  start: string; // ISO
  end?: string;
  allDay: boolean;
  calendarName?: string;
}

/** Fetch upcoming events from Google Calendar API */
export async function fetchGoogleCalendarEvents(
  calendarId = "primary",
  daysAhead = 60,
): Promise<GoogleCalendarEvent[] | null> {
  const token = await getCalendarAccessToken();
  if (!token) return null;

  try {
    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "50");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 403) {
      // Calendar scope not yet granted — token was obtained without calendar scope
      return null;
    }

    if (!res.ok) return null;

    const data = await res.json() as { items?: GCalEvent[]; summary?: string };
    const items = data.items ?? [];
    const calName = data.summary;

    return items.map((ev) => {
      const allDay = !ev.start.dateTime;
      const startStr = ev.start.dateTime ?? ev.start.date ?? "";
      const endStr = ev.end?.dateTime ?? ev.end?.date;
      return {
        id: ev.id,
        title: ev.summary ?? "(No title)",
        start: startStr,
        end: endStr,
        allDay,
        calendarName: calName,
      };
    });
  } catch {
    return null;
  }
}

/** Fetch from multiple Google Calendar IDs */
export async function fetchAllGoogleCalendars(): Promise<GoogleCalendarEvent[]> {
  try {
    const token = await getCalendarAccessToken();
    if (!token) return [];

    // List user's calendars
    const listRes = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=10",
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) }
    );
    if (!listRes.ok) return [];
    const listData = await listRes.json() as { items?: { id: string; summary: string }[] };
    const cals = (listData.items ?? []).filter(c => !c.id.includes("#holiday"));

    const results = await Promise.all(
      cals.slice(0, 5).map(c => fetchGoogleCalendarEvents(c.id).then(evs => evs ?? []))
    );
    return results.flat().sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  } catch {
    return [];
  }
}

/** Format Google Calendar events into a text summary for the LLM context */
export async function getGoogleCalendarContext(): Promise<string | null> {
  const events = await fetchAllGoogleCalendars();
  if (events.length === 0) return null;

  const now = new Date();
  const upcoming = events.filter(e => new Date(e.start) >= new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  if (upcoming.length === 0) return "Google Calendar: No upcoming events.";

  const lines = upcoming.slice(0, 10).map(e => {
    const start = new Date(e.start);
    const dateStr = e.allDay
      ? start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
      : start.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    return `• ${dateStr}: ${e.title}${e.calendarName ? ` (${e.calendarName})` : ""}`;
  });

  return `Google Calendar (${upcoming.length} upcoming):\n${lines.join("\n")}`;
}
