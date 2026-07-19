export interface ClockTimezone { label: string; tz: string }
export interface ForecastDay { date: string; maxTemp_c: number; minTemp_c: number; condition: string; conditionCode: number }
export interface CalendarEvent { id: string; title: string; start: string; end?: string; allDay: boolean; calendarName?: string }

export type Widget =
  | { type: 'clock'; timezones: ClockTimezone[] }
  | { type: 'weather'; location: string; temp_c: number; temp_f: number; feelsLike_c: number; condition: string; conditionCode: number; humidity: number; windSpeed_kmh: number; windDir: string; isDay: boolean; forecast: ForecastDay[] }
  | { type: 'timer'; durationSeconds: number; label?: string }
  | { type: 'alarm'; time: string; label?: string }
  | { type: 'calendar'; events: CalendarEvent[]; weekStart: string }
  | { type: 'music'; track?: string; artist?: string; album?: string; albumArt?: string | null; playing: boolean; query?: string }
