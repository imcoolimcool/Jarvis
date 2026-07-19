/**
 * Widget intent detection + data hydration.
 * Given a user message (and settings), returns a typed Widget payload
 * to attach to the chat response.
 */

// ─── Shared widget types ─────────────────────────────────────────────────────

export interface ClockTimezone { label: string; tz: string }

export type Widget =
  | { type: 'clock'; timezones: ClockTimezone[] }
  | { type: 'weather'; location: string; temp_c: number; temp_f: number; feelsLike_c: number; condition: string; conditionCode: number; humidity: number; windSpeed_kmh: number; windDir: string; isDay: boolean; forecast: ForecastDay[] }
  | { type: 'timer'; durationSeconds: number; label?: string }
  | { type: 'alarm'; time: string; label?: string }    // "HH:MM" 24-h
  | { type: 'calendar'; events: CalendarEvent[]; weekStart: string }

export interface ForecastDay {
  date: string;           // YYYY-MM-DD
  maxTemp_c: number;
  minTemp_c: number;
  condition: string;
  conditionCode: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;          // ISO datetime or YYYY-MM-DD for all-day
  end?: string;
  allDay: boolean;
  calendarName?: string;
}

// ─── Intent detection ────────────────────────────────────────────────────────

type Intent = 'clock' | 'weather' | 'timer' | 'alarm' | 'calendar' | null;

function detectIntent(msg: string): Intent {
  const t = msg.toLowerCase();

  if (/\b(what('?s| is) the time|what time is it|current time|time (right )?now|time in\b|time at\b|clock)\b/.test(t)) return 'clock';
  if (/\b(weather|temperature|how (hot|cold|warm)|forecast|raining|sunny|cloudy|humidity|wind speed)\b/.test(t)) return 'weather';
  if (/\b(set( a)? timer|start( a)? timer|timer (for|of)|countdown|count down)\b/.test(t)) return 'timer';
  if (/\b(set( an?)? alarm|wake me up( at)?|alarm( at| for)?|remind me at)\b/.test(t)) return 'alarm';
  if (/\b(calendar|my schedule|agenda|upcoming events?|what('?s| is) (on|happening)|this week|next week|show me (my )?(events?|calendar))\b/.test(t)) return 'calendar';

  return null;
}

// ─── Clock ───────────────────────────────────────────────────────────────────

const CITY_TZ: Record<string, { label: string; tz: string }> = {
  'tokyo':         { label: 'Tokyo',         tz: 'Asia/Tokyo' },
  'london':        { label: 'London',        tz: 'Europe/London' },
  'new york':      { label: 'New York',      tz: 'America/New_York' },
  'los angeles':   { label: 'Los Angeles',   tz: 'America/Los_Angeles' },
  'la':            { label: 'Los Angeles',   tz: 'America/Los_Angeles' },
  'paris':         { label: 'Paris',         tz: 'Europe/Paris' },
  'berlin':        { label: 'Berlin',        tz: 'Europe/Berlin' },
  'sydney':        { label: 'Sydney',        tz: 'Australia/Sydney' },
  'dubai':         { label: 'Dubai',         tz: 'Asia/Dubai' },
  'singapore':     { label: 'Singapore',     tz: 'Asia/Singapore' },
  'mumbai':        { label: 'Mumbai',        tz: 'Asia/Kolkata' },
  'delhi':         { label: 'Delhi',         tz: 'Asia/Kolkata' },
  'beijing':       { label: 'Beijing',       tz: 'Asia/Shanghai' },
  'shanghai':      { label: 'Shanghai',      tz: 'Asia/Shanghai' },
  'moscow':        { label: 'Moscow',        tz: 'Europe/Moscow' },
  'chicago':       { label: 'Chicago',       tz: 'America/Chicago' },
  'toronto':       { label: 'Toronto',       tz: 'America/Toronto' },
  'amsterdam':     { label: 'Amsterdam',     tz: 'Europe/Amsterdam' },
  'seoul':         { label: 'Seoul',         tz: 'Asia/Seoul' },
  'hong kong':     { label: 'Hong Kong',     tz: 'Asia/Hong_Kong' },
  'jakarta':       { label: 'Jakarta',       tz: 'Asia/Jakarta' },
  'bangkok':       { label: 'Bangkok',       tz: 'Asia/Bangkok' },
  'istanbul':      { label: 'Istanbul',      tz: 'Europe/Istanbul' },
  'cairo':         { label: 'Cairo',         tz: 'Africa/Cairo' },
  'johannesburg':  { label: 'Johannesburg',  tz: 'Africa/Johannesburg' },
  'denver':        { label: 'Denver',        tz: 'America/Denver' },
  'sao paulo':     { label: 'São Paulo',     tz: 'America/Sao_Paulo' },
  'mexico city':   { label: 'Mexico City',   tz: 'America/Mexico_City' },
  'auckland':      { label: 'Auckland',      tz: 'Pacific/Auckland' },
};

const DEFAULT_TIMEZONES: ClockTimezone[] = [
  { label: 'New York',    tz: 'America/New_York' },
  { label: 'London',      tz: 'Europe/London' },
  { label: 'Dubai',       tz: 'Asia/Dubai' },
  { label: 'Tokyo',       tz: 'Asia/Tokyo' },
  { label: 'Sydney',      tz: 'Australia/Sydney' },
];

function buildClockWidget(msg: string): Extract<Widget, { type: 'clock' }> {
  const t = msg.toLowerCase();
  const found: ClockTimezone[] = [];
  for (const [city, info] of Object.entries(CITY_TZ)) {
    if (t.includes(city) && !found.some(f => f.tz === info.tz)) found.push(info);
  }
  const timezones = found.length > 0 ? found : DEFAULT_TIMEZONES;
  return { type: 'clock', timezones };
}

// ─── Weather ─────────────────────────────────────────────────────────────────

interface WttrJson {
  current_condition: Array<{
    temp_C: string; temp_F: string; FeelsLikeC: string;
    humidity: string; weatherCode: string;
    weatherDesc: Array<{ value: string }>;
    windspeedKmph: string; winddir16Point: string;
    uvIndex?: string;
  }>;
  weather: Array<{
    date: string; maxTempC: string; minTempC: string;
    hourly: Array<{ weatherCode: string; weatherDesc: Array<{ value: string }> }>;
  }>;
}

async function fetchWeatherWidget(location: string): Promise<Extract<Widget, { type: 'weather' }> | null> {
  try {
    const url = `https://wttr.in/${encodeURIComponent(location)}?format=j1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'JarvisAssistant/1.0' }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json() as WttrJson;
    const cur = data.current_condition?.[0];
    if (!cur) return null;

    const hour = new Date().getHours();
    const isDay = hour >= 6 && hour < 20;

    const forecast: ForecastDay[] = (data.weather ?? []).map(w => ({
      date: w.date,
      maxTemp_c: Number(w.maxTempC),
      minTemp_c: Number(w.minTempC),
      condition: w.hourly?.[4]?.weatherDesc?.[0]?.value ?? cur.weatherDesc?.[0]?.value ?? '',
      conditionCode: Number(w.hourly?.[4]?.weatherCode ?? cur.weatherCode),
    }));

    return {
      type: 'weather',
      location,
      temp_c: Number(cur.temp_C),
      temp_f: Number(cur.temp_F),
      feelsLike_c: Number(cur.FeelsLikeC),
      condition: cur.weatherDesc?.[0]?.value ?? '',
      conditionCode: Number(cur.weatherCode),
      humidity: Number(cur.humidity),
      windSpeed_kmh: Number(cur.windspeedKmph),
      windDir: cur.winddir16Point,
      isDay,
      forecast,
    };
  } catch {
    return null;
  }
}

function extractWeatherLocation(msg: string, settingsLocation: string): string {
  // "weather in London", "weather for Paris", "weather at Tokyo"
  const m = msg.match(/weather\s+(in|for|at)\s+([a-zA-Z\s,]+?)(?:\s*\?|$)/i)
    ?? msg.match(/(?:how\s+(?:hot|cold|warm)|temperature)\s+(?:in|at)\s+([a-zA-Z\s,]+?)(?:\s*\?|$)/i);
  if (m) return (m[2] ?? m[1]).trim();
  return settingsLocation || 'London';
}

// ─── Timer ───────────────────────────────────────────────────────────────────

function parseTimerWidget(msg: string): Extract<Widget, { type: 'timer' }> | null {
  const t = msg.toLowerCase();
  let seconds = 0;

  const hourMin = t.match(/(\d+)\s*h(?:our|r)?s?\s*(?:and\s*)?(\d+)\s*m(?:in(?:ute)?)?s?/);
  const minSec  = t.match(/(\d+)\s*m(?:in(?:ute)?)?s?\s*(?:and\s*)?(\d+)\s*s(?:ec(?:ond)?)?s?/);
  const hoursOnly = t.match(/(\d+)\s*h(?:our|r)?s?/);
  const minsOnly  = t.match(/(\d+)\s*m(?:in(?:ute)?)?s?/);
  const secsOnly  = t.match(/(\d+)\s*s(?:ec(?:ond)?)?s?/);

  if (hourMin) {
    seconds = parseInt(hourMin[1]) * 3600 + parseInt(hourMin[2]) * 60;
  } else if (minSec) {
    seconds = parseInt(minSec[1]) * 60 + parseInt(minSec[2]);
  } else if (hoursOnly) {
    seconds = parseInt(hoursOnly[1]) * 3600;
  } else if (minsOnly) {
    seconds = parseInt(minsOnly[1]) * 60;
  } else if (secsOnly) {
    seconds = parseInt(secsOnly[1]);
  }

  if (seconds <= 0) return null;

  // Extract optional label
  const labelMatch = msg.match(/(?:for|to)\s+([a-zA-Z\s]+?)(?:\s+timer|\s*\?|$)/i);
  const label = labelMatch?.[1]?.trim();

  return { type: 'timer', durationSeconds: seconds, label };
}

// ─── Alarm ───────────────────────────────────────────────────────────────────

function parseAlarmWidget(msg: string): Extract<Widget, { type: 'alarm' }> | null {
  const t = msg.toLowerCase();

  // Match "7:30 am", "7:30am", "7am", "19:45"
  const m = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!m) return null;

  let hours = parseInt(m[1]);
  const mins = m[2] ? parseInt(m[2]) : 0;
  const meridiem = m[3];

  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;

  if (hours > 23 || mins > 59) return null;

  const time = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  return { type: 'alarm', time };
}

// ─── Calendar ────────────────────────────────────────────────────────────────

export async function fetchCalendarWidget(calendars: { url: string; name?: string }[]): Promise<Extract<Widget, { type: 'calendar' }> | null> {
  if (calendars.length === 0) return null;

  const allEvents: CalendarEvent[] = [];

  await Promise.all(calendars.map(async (cal) => {
    try {
      const res = await fetch(cal.url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) return;
      const text = await res.text();
      const events = parseIcsStructured(text, cal.name);
      allEvents.push(...events);
    } catch { /* skip failed calendar */ }
  }));

  // Sort by start
  allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  // Week start = Monday of current week
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  const weekStartStr = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;

  return { type: 'calendar', events: allEvents, weekStart: weekStartStr };
}

function parseIcsStructured(icsText: string, calendarName?: string): CalendarEvent[] {
  const now = new Date();
  const cutoff = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // 60 days ahead

  const eventBlocks = icsText.split('BEGIN:VEVENT').slice(1);
  const events: CalendarEvent[] = [];

  for (const block of eventBlocks) {
    const summary = extractProp(block, 'SUMMARY');
    const dtStart = extractProp(block, 'DTSTART');
    const dtEnd   = extractProp(block, 'DTEND');
    const uid     = extractProp(block, 'UID');
    if (!summary || !dtStart) continue;

    const startParsed = parseIcsDate(dtStart);
    if (!startParsed) continue;

    const endParsed = dtEnd ? parseIcsDate(dtEnd) : null;

    // Only include events in the window
    if (startParsed.date > cutoff) continue;
    if (endParsed && endParsed.date < new Date(now.getFullYear(), now.getMonth(), now.getDate())) continue;
    if (!endParsed && startParsed.date < new Date(now.getFullYear(), now.getMonth(), now.getDate())) continue;

    events.push({
      id: uid ?? `${summary}-${dtStart}`,
      title: summary,
      start: startParsed.date.toISOString(),
      end: endParsed?.date.toISOString(),
      allDay: startParsed.allDay,
      calendarName,
    });
  }

  return events;
}

function extractProp(block: string, name: string): string | null {
  const regex = new RegExp(`\\n${name}[^:]*:([^\\n]*)`);
  const match = block.match(regex);
  if (!match) return null;
  return match[1].trim()
    .replace(/\\,/g, ',').replace(/\\n/g, ' ').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

function parseIcsDate(value: string): { date: Date; allDay: boolean } | null {
  if (/^\d{8}$/.test(value)) {
    return { date: new Date(`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}`), allDay: true };
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) return null;
  const [, y, mo, d, h, min, s, z] = m;
  const iso = `${y}-${mo}-${d}T${h}:${min}:${s}${z === 'Z' ? 'Z' : ''}`;
  const date = new Date(iso);
  if (isNaN(date.getTime())) return null;
  return { date, allDay: false };
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function detectAndBuildWidget(
  userMessage: string,
  settings: Record<string, string>,
): Promise<Widget | null> {
  const intent = detectIntent(userMessage);
  if (!intent) return null;

  switch (intent) {
    case 'clock':
      return buildClockWidget(userMessage);

    case 'weather': {
      const location = extractWeatherLocation(userMessage, settings['weather_location'] ?? 'London');
      return await fetchWeatherWidget(location);
    }

    case 'timer': {
      return parseTimerWidget(userMessage);
    }

    case 'alarm': {
      return parseAlarmWidget(userMessage);
    }

    case 'calendar': {
      const calendars: { url: string; name?: string }[] = [1, 2, 3, 4, 5]
        .map(n => ({ url: settings[`calendar_ics_url_${n}`], name: settings[`calendar_name_${n}`] || undefined }))
        .filter(c => c.url) as { url: string; name?: string }[];
      return await fetchCalendarWidget(calendars);
    }
  }
}
