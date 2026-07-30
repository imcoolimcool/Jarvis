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
  | { type: 'timer'; durationSeconds: number; label?: string; timerAction?: 'set' | 'add' | 'cancel'; deltaSeconds?: number }
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

type Intent = 'clock' | 'weather' | 'timer' | 'timer_edit' | 'timer_cancel' | 'alarm' | 'calendar' | null;

function detectIntent(msg: string): Intent {
  const t = msg.toLowerCase();

  if (/\b(what('?s| is) the time|what time is it|current time|time (right )?now|time in\b|time at\b|clock)\b/.test(t)) return 'clock';
  if (/\b(weather|temperature|how (hot|cold|warm)|forecast|raining|sunny|cloudy|humidity|wind speed)\b/.test(t)) return 'weather';
  // Timer cancel must be checked before edit/set to avoid misclassification
  if (/\b(cancel|stop|clear|dismiss|delete|remove)\s+(the\s+)?timer\b/.test(t)) return 'timer_cancel';
  // Timer edit: change/update/extend/shorten/add to existing timer
  if (/\b(change|update|extend|shorten|modify|adjust)\s+(the\s+)?timer\b/.test(t)) return 'timer_edit';
  if (/\badd\s+\d+.*\s*(more\s+)?(minutes?|mins?|seconds?|secs?|hours?|hrs?)\s+(to|on)\s+(the\s+)?timer\b/.test(t)) return 'timer_edit';
  if (/\b(subtract|remove|take off)\s+\d+.*\s*(minutes?|mins?|seconds?|secs?|hours?|hrs?)\s+(from|off)\s+(the\s+)?timer\b/.test(t)) return 'timer_edit';
  if (/\bset\s+(the\s+)?timer\s+to\b/.test(t)) return 'timer_edit';
  if (/\bmake\s+(the\s+)?timer\b/.test(t)) return 'timer_edit';
  // "set a 5 minute timer", "set a timer for pasta", "start a 30 second timer", etc.
  if (/\b(set|start)\s+(?:a\s+)?(?:\d+[\s\w]*?\s+)?timer\b/.test(t)) return 'timer';
  if (/\btimer\s+(for|of)\b/.test(t)) return 'timer';
  if (/\b(countdown|count down)\b/.test(t)) return 'timer';
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

/** Map a free-form location string to an IANA timezone — used for weather_location → clock tz */
function getTimezoneFromLocation(location: string): string {
  const t = location.toLowerCase().trim();
  // Direct city match
  for (const [city, info] of Object.entries(CITY_TZ)) {
    if (t.includes(city) || city.includes(t.split(',')[0].trim())) return info.tz;
  }
  // Country / region fallbacks
  const COUNTRY_TZ: Record<string, string> = {
    'uk': 'Europe/London', 'england': 'Europe/London', 'britain': 'Europe/London', 'scotland': 'Europe/London', 'wales': 'Europe/London',
    'usa': 'America/New_York', 'united states': 'America/New_York', 'america': 'America/New_York',
    'germany': 'Europe/Berlin', 'france': 'Europe/Paris', 'spain': 'Europe/Madrid',
    'italy': 'Europe/Rome', 'japan': 'Asia/Tokyo', 'china': 'Asia/Shanghai',
    'australia': 'Australia/Sydney', 'india': 'Asia/Kolkata', 'brazil': 'America/Sao_Paulo',
    'canada': 'America/Toronto', 'mexico': 'America/Mexico_City', 'russia': 'Europe/Moscow',
    'netherlands': 'Europe/Amsterdam', 'sweden': 'Europe/Stockholm', 'norway': 'Europe/Oslo',
    'denmark': 'Europe/Copenhagen', 'switzerland': 'Europe/Zurich', 'austria': 'Europe/Vienna',
    'poland': 'Europe/Warsaw', 'turkey': 'Europe/Istanbul', 'egypt': 'Africa/Cairo',
    'nigeria': 'Africa/Lagos', 'kenya': 'Africa/Nairobi', 'south africa': 'Africa/Johannesburg',
    'argentina': 'America/Argentina/Buenos_Aires', 'colombia': 'America/Bogota',
    'chile': 'America/Santiago', 'peru': 'America/Lima', 'new zealand': 'Pacific/Auckland',
    'portugal': 'Europe/Lisbon', 'ireland': 'Europe/Dublin', 'greece': 'Europe/Athens',
    'czech': 'Europe/Prague', 'hungary': 'Europe/Budapest', 'romania': 'Europe/Bucharest',
    'ukraine': 'Europe/Kiev', 'finland': 'Europe/Helsinki', 'israel': 'Asia/Jerusalem',
    'saudi': 'Asia/Riyadh', 'iran': 'Asia/Tehran', 'pakistan': 'Asia/Karachi',
    'bangladesh': 'Asia/Dhaka', 'thailand': 'Asia/Bangkok', 'vietnam': 'Asia/Ho_Chi_Minh',
    'malaysia': 'Asia/Kuala_Lumpur', 'philippines': 'Asia/Manila', 'indonesia': 'Asia/Jakarta',
  };
  for (const [key, tz] of Object.entries(COUNTRY_TZ)) {
    if (t.includes(key)) return tz;
  }
  return 'UTC';
}

function buildClockWidget(msg: string, settings: Record<string, string>): Extract<Widget, { type: 'clock' }> {
  const t = msg.toLowerCase();
  const found: ClockTimezone[] = [];
  for (const [city, info] of Object.entries(CITY_TZ)) {
    if (t.includes(city) && !found.some(f => f.tz === info.tz)) found.push(info);
  }
  if (found.length > 0) return { type: 'clock', timezones: found };

  // No specific city mentioned — use the user's weather location for local time
  const weatherLoc = settings['weather_location']?.trim();
  if (weatherLoc) {
    const tz = getTimezoneFromLocation(weatherLoc);
    const label = weatherLoc.split(',')[0].trim();
    return { type: 'clock', timezones: [{ label, tz }] };
  }

  return { type: 'clock', timezones: DEFAULT_TIMEZONES };
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

/** Parse a human-readable duration string into total seconds. Returns 0 if nothing found. */
function parseDurationSeconds(t: string): number {
  const hourMin = t.match(/(\d+)\s*h(?:our|r)?s?\s*(?:and\s*)?(\d+)\s*m(?:in(?:ute)?)?s?/);
  const minSec  = t.match(/(\d+)\s*m(?:in(?:ute)?)?s?\s*(?:and\s*)?(\d+)\s*s(?:ec(?:ond)?)?s?/);
  const hoursOnly = t.match(/(\d+)\s*h(?:our|r)?s?/);
  const minsOnly  = t.match(/(\d+)\s*m(?:in(?:ute)?)?s?/);
  const secsOnly  = t.match(/(\d+)\s*s(?:ec(?:ond)?)?s?/);

  if (hourMin) return parseInt(hourMin[1]) * 3600 + parseInt(hourMin[2]) * 60;
  if (minSec)  return parseInt(minSec[1])  * 60   + parseInt(minSec[2]);
  if (hoursOnly) return parseInt(hoursOnly[1]) * 3600;
  if (minsOnly)  return parseInt(minsOnly[1])  * 60;
  if (secsOnly)  return parseInt(secsOnly[1]);
  return 0;
}

function parseTimerWidget(msg: string): Extract<Widget, { type: 'timer' }> | null {
  const seconds = parseDurationSeconds(msg.toLowerCase());
  if (seconds <= 0) return null;

  // Extract optional label (e.g. "set a timer for pasta" → label="pasta")
  const labelMatch = msg.match(/(?:for|to)\s+([a-zA-Z\s]+?)(?:\s+timer|\s*\?|$)/i);
  const label = labelMatch?.[1]?.trim();

  return { type: 'timer', durationSeconds: seconds, label, timerAction: 'set' };
}

function parseTimerEditWidget(msg: string): Extract<Widget, { type: 'timer' }> | null {
  const t = msg.toLowerCase();

  // "cancel"/"stop" the timer
  if (/\b(cancel|stop|clear|dismiss|delete|remove)\s+(the\s+)?timer\b/.test(t)) {
    return { type: 'timer', durationSeconds: 0, timerAction: 'cancel' };
  }

  // "add X to the timer" / "extend by X"
  const addMatch = t.match(/(?:add|extend(?:\s+by)?)\s+([\d\s\w]+?)\s+(?:more\s+)?(?:to|on)\s+(?:the\s+)?timer/);
  if (addMatch) {
    const delta = parseDurationSeconds(addMatch[1]);
    if (delta > 0) return { type: 'timer', durationSeconds: 0, deltaSeconds: delta, timerAction: 'add' };
  }

  // "subtract/remove X from the timer"
  const subMatch = t.match(/(?:subtract|remove|take off)\s+([\d\s\w]+?)\s+(?:from|off)\s+(?:the\s+)?timer/);
  if (subMatch) {
    const delta = parseDurationSeconds(subMatch[1]);
    if (delta > 0) return { type: 'timer', durationSeconds: 0, deltaSeconds: delta, timerAction: 'add', };
    // Negative delta handled on frontend
  }

  // "change/set/make/update the timer to X" or "make it X"
  const seconds = parseDurationSeconds(t);
  if (seconds > 0) return { type: 'timer', durationSeconds: seconds, timerAction: 'set' };

  return null;
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

// ─── Google Calendar (via API) ───────────────────────────────────────────────

async function fetchGoogleCalendarWidget(): Promise<Extract<Widget, { type: 'calendar' }> | null> {
  try {
    const { fetchAllGoogleCalendars } = await import("./google-calendar");
    const events = await fetchAllGoogleCalendars();
    if (events.length === 0) return null;

    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
    const weekStartStr = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;

    // Map to CalendarEvent format
    const calEvents: CalendarEvent[] = events.map(e => ({
      id: e.id,
      title: e.title,
      start: e.start,
      end: e.end,
      allDay: e.allDay,
      calendarName: e.calendarName,
    }));

    return { type: 'calendar', events: calEvents, weekStart: weekStartStr };
  } catch {
    return null;
  }
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
      return buildClockWidget(userMessage, settings);

    case 'weather': {
      const location = extractWeatherLocation(userMessage, settings['weather_location'] ?? 'London');
      return await fetchWeatherWidget(location);
    }

    case 'timer': {
      return parseTimerWidget(userMessage);
    }

    case 'timer_edit': {
      return parseTimerEditWidget(userMessage);
    }

    case 'timer_cancel': {
      return { type: 'timer', durationSeconds: 0, timerAction: 'cancel' };
    }

    case 'alarm': {
      return parseAlarmWidget(userMessage);
    }

    case 'calendar': {
      // Try Google Calendar API first (if Gmail/Calendar is connected)
      if (settings['google_calendar_enabled'] !== 'false') {
        const gcal = await fetchGoogleCalendarWidget();
        if (gcal) return gcal;
      }
      // Fallback: iCal URLs
      const calendars: { url: string; name?: string }[] = [1, 2, 3, 4, 5]
        .map(n => ({ url: settings[`calendar_ics_url_${n}`], name: settings[`calendar_name_${n}`] || undefined }))
        .filter(c => c.url) as { url: string; name?: string }[];
      return await fetchCalendarWidget(calendars);
    }

  }
}
