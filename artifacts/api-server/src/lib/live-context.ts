/**
 * Live context utilities — fetches real-world data to inject into Jarvis's system prompt.
 * All sources are free and require no API keys unless noted.
 */

/** Formatted current date + time */
export function getCurrentDatetime(): string {
  const now = new Date();
  return now.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** Current weather via wttr.in — completely free, no API key required */
export async function getWeather(location: string): Promise<string> {
  try {
    const url = `https://wttr.in/${encodeURIComponent(location)}?format=3`;
    const res = await fetch(url, {
      headers: { "User-Agent": "JarvisAssistant/1.0" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return "Weather unavailable";
    const text = await res.text();
    return text.trim();
  } catch {
    return "Weather unavailable";
  }
}

/** Parse upcoming events from a Google Calendar iCal/ICS URL (free secret address) */
export async function getCalendarEvents(
  icsUrl: string,
  days = 7,
): Promise<string> {
  try {
    const res = await fetch(icsUrl, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return "Calendar unavailable";
    const text = await res.text();
    return parseIcsEvents(text, days);
  } catch {
    return "Calendar unavailable";
  }
}

function parseIcsEvents(icsText: string, days: number): string {
  const now = new Date();
  const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  // Split into VEVENT blocks
  const eventBlocks = icsText.split("BEGIN:VEVENT").slice(1);
  const events: { start: Date; summary: string }[] = [];

  for (const block of eventBlocks) {
    const summaryMatch = block.match(/\nSUMMARY[^:]*:(.*)/);
    const dtStartMatch = block.match(/\nDTSTART[^:]*:(.*)/);
    if (!summaryMatch || !dtStartMatch) continue;

    const summary = summaryMatch[1].trim().replace(/\\,/g, ",").replace(/\\n/g, " ");
    const dtRaw = dtStartMatch[1].trim();
    const start = parseIcsDate(dtRaw);
    if (!start) continue;

    if (start >= now && start <= cutoff) {
      events.push({ start, summary });
    }
  }

  if (events.length === 0) return `No events in the next ${days} days`;

  events.sort((a, b) => a.start.getTime() - b.start.getTime());

  return events
    .slice(0, 10)
    .map((e) => {
      const dateStr = e.start.toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      return `• ${dateStr}: ${e.summary}`;
    })
    .join("\n");
}

function parseIcsDate(raw: string): Date | null {
  // All-day: YYYYMMDD
  if (/^\d{8}$/.test(raw)) {
    return new Date(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`);
  }
  // DateTime: YYYYMMDDTHHmmss or YYYYMMDDTHHmmssZ
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] === "Z" ? "Z" : ""}`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/** Build the full live context string to inject into system prompt */
export async function buildLiveContext(opts: {
  weatherLocation?: string;
  calendarIcsUrls?: string[];
}): Promise<string> {
  const parts: string[] = [`Current date/time: ${getCurrentDatetime()}`];

  if (opts.weatherLocation) {
    const weather = await getWeather(opts.weatherLocation);
    parts.push(`Weather: ${weather}`);
  }

  const urls = (opts.calendarIcsUrls ?? []).filter(Boolean);
  if (urls.length > 0) {
    const results = await Promise.all(
      urls.map((url, i) =>
        getCalendarEvents(url).then(
          (events) => `Calendar ${urls.length > 1 ? i + 1 : ""}:\n${events}`.trim(),
        ),
      ),
    );
    parts.push(`Upcoming calendar events (next 7 days):\n${results.join("\n\n")}`);
  }

  return `=== LIVE CONTEXT ===\n${parts.join("\n\n")}\n===================`;
}
