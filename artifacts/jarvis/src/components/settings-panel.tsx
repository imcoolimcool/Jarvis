import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Cloud, CalendarDays, Info, Plus, Trash2 } from 'lucide-react';

interface Settings {
  weather_location: string;
  calendar_ics_url_1: string;
  calendar_ics_url_2: string;
  calendar_ics_url_3: string;
  calendar_ics_url_4: string;
  calendar_ics_url_5: string;
}

const EMPTY: Settings = {
  weather_location: '',
  calendar_ics_url_1: '',
  calendar_ics_url_2: '',
  calendar_ics_url_3: '',
  calendar_ics_url_4: '',
  calendar_ics_url_5: '',
};

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [form, setForm] = useState<Settings>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Number of calendar slots currently shown (at least those with values, min 1)
  const [visibleSlots, setVisibleSlots] = useState(1);

  useEffect(() => {
    if (!open) return;
    fetch('/api/jarvis/settings')
      .then(r => r.json())
      .then(data => {
        const loaded: Settings = { ...EMPTY, ...data };
        setForm(loaded);
        // Show enough slots for existing values
        const filled = [1,2,3,4,5].filter(n => loaded[`calendar_ics_url_${n}` as keyof Settings]);
        setVisibleSlots(Math.max(1, filled.length));
      })
      .catch(() => {});
  }, [open]);

  const calendarKeys = Array.from({ length: visibleSlots }, (_, i) => `calendar_ics_url_${i + 1}` as keyof Settings);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/jarvis/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const removeCalendar = (key: keyof Settings) => {
    // Shift remaining values up, clear last
    const keys = [1,2,3,4,5].map(n => `calendar_ics_url_${n}` as keyof Settings);
    const idx = keys.indexOf(key);
    const newForm = { ...form };
    for (let i = idx; i < 4; i++) {
      newForm[keys[i]] = newForm[keys[i + 1]];
    }
    newForm[keys[4]] = '';
    setForm(newForm);
    setVisibleSlots(v => Math.max(1, v - 1));
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full max-w-md z-50 bg-background border-l border-border/50 shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-border/30 flex-shrink-0">
              <div>
                <h2 className="font-display font-bold tracking-[0.15em] text-sm text-primary glow-text">SETTINGS</h2>
                <p className="text-[10px] font-mono text-muted-foreground tracking-widest mt-0.5">LIVE CONTEXT CONFIGURATION</p>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Fields */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">

              {/* Always active */}
              <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/15 rounded-lg">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse flex-shrink-0" />
                <p className="text-[11px] font-mono text-muted-foreground">
                  <span className="text-primary font-semibold">Always on:</span> Jarvis always knows the current date &amp; time — no setup needed.
                </p>
              </div>

              {/* Weather */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Cloud className="w-3.5 h-3.5 text-primary/70" />
                  <label className="font-display text-[11px] tracking-widest text-foreground font-semibold">WEATHER</label>
                </div>
                <input
                  type="text"
                  value={form.weather_location}
                  onChange={e => setForm(f => ({ ...f, weather_location: e.target.value }))}
                  placeholder="e.g. London, New York, Tokyo"
                  className="w-full bg-card border border-border text-foreground placeholder:text-muted-foreground/50 font-mono text-sm px-4 py-2.5 rounded-lg outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10 transition-all"
                />
                <p className="text-[10px] font-mono text-muted-foreground/60">
                  Powered by wttr.in — free, no account needed.
                </p>
              </div>

              {/* Google Calendar */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-3.5 h-3.5 text-primary/70" />
                    <label className="font-display text-[11px] tracking-widest text-foreground font-semibold">GOOGLE CALENDAR</label>
                  </div>
                  {visibleSlots < 5 && (
                    <button
                      onClick={() => setVisibleSlots(v => Math.min(5, v + 1))}
                      className="flex items-center gap-1 text-[10px] font-mono text-primary hover:text-primary/80 transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Add calendar
                    </button>
                  )}
                </div>

                <AnimatePresence>
                  {calendarKeys.map((key, i) => (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-1.5"
                    >
                      <div className="flex items-center gap-2">
                        {visibleSlots > 1 && (
                          <span className="text-[10px] font-mono text-muted-foreground/50 w-4 flex-shrink-0">
                            {i + 1}.
                          </span>
                        )}
                        <div className="flex-1 flex items-center gap-1.5">
                          <input
                            type="url"
                            value={form[key]}
                            onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                            placeholder={`Paste iCal URL${visibleSlots > 1 ? ` (calendar ${i + 1})` : ''}…`}
                            className="flex-1 bg-card border border-border text-foreground placeholder:text-muted-foreground/50 font-mono text-xs px-3 py-2.5 rounded-lg outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10 transition-all min-w-0"
                          />
                          {visibleSlots > 1 && (
                            <button
                              onClick={() => removeCalendar(key)}
                              className="p-2 text-muted-foreground hover:text-red-400 transition-colors flex-shrink-0"
                              title="Remove this calendar"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                <div className="p-3.5 border border-border/50 bg-muted/30 rounded-lg space-y-2">
                  <div className="flex items-start gap-2">
                    <Info className="w-3 h-3 text-primary/50 mt-0.5 flex-shrink-0" />
                    <div className="text-[10px] font-mono text-muted-foreground leading-relaxed space-y-1">
                      <p className="text-primary/70 font-semibold">How to get your free iCal URL</p>
                      <p>1. Open <span className="text-primary/60">calendar.google.com</span></p>
                      <p>2. Settings ⚙ → click your calendar name on the left</p>
                      <p>3. Scroll to <span className="text-primary/60">"Integrate calendar"</span></p>
                      <p>4. Copy <span className="text-primary/60">"Secret address in iCal format"</span></p>
                      <p className="text-muted-foreground/50 pt-1">No login or API key needed. Free forever. Up to 5 calendars.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Save */}
            <div className="px-6 py-5 border-t border-border/30 flex-shrink-0">
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-display tracking-widest text-xs disabled:opacity-50 rounded-lg"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'SAVING…' : saved ? 'SAVED ✓' : 'SAVE SETTINGS'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
