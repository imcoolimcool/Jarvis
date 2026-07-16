import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Cloud, CalendarDays, Info } from 'lucide-react';

interface Settings {
  weather_location: string;
  calendar_ics_url: string;
}

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [form, setForm] = useState<Settings>({ weather_location: '', calendar_ics_url: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch('/api/jarvis/settings')
      .then(r => r.json())
      .then(data => setForm({
        weather_location: data.weather_location ?? '',
        calendar_ics_url: data.calendar_ics_url ?? '',
      }))
      .catch(() => {});
  }, [open]);

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

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full max-w-md z-50 bg-background border-l border-border/50 shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-border/30">
              <div>
                <h2 className="font-display font-bold tracking-[0.2em] text-primary glow-text">SETTINGS</h2>
                <p className="text-[10px] font-mono text-muted-foreground tracking-widest mt-1">LIVE CONTEXT CONFIGURATION</p>
              </div>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Fields */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">

              {/* Weather */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-primary/70" />
                  <label className="font-display text-xs tracking-widest text-foreground">WEATHER LOCATION</label>
                </div>
                <input
                  type="text"
                  value={form.weather_location}
                  onChange={e => setForm(f => ({ ...f, weather_location: e.target.value }))}
                  placeholder="e.g. London, New York, Tokyo"
                  className="w-full bg-card/50 border border-border/50 text-foreground placeholder:text-muted-foreground font-mono text-sm px-4 py-3 outline-none focus:border-primary/60 focus:shadow-[0_0_10px_rgba(0,212,255,0.1)] transition-all"
                />
                <p className="text-[10px] font-mono text-muted-foreground/60 leading-relaxed">
                  Jarvis will know your current weather. Uses wttr.in — free, no account needed.
                </p>
              </div>

              {/* Google Calendar */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-primary/70" />
                  <label className="font-display text-xs tracking-widest text-foreground">GOOGLE CALENDAR</label>
                </div>
                <textarea
                  value={form.calendar_ics_url}
                  onChange={e => setForm(f => ({ ...f, calendar_ics_url: e.target.value }))}
                  placeholder="Paste your Google Calendar secret iCal URL here…"
                  rows={3}
                  className="w-full bg-card/50 border border-border/50 text-foreground placeholder:text-muted-foreground font-mono text-xs px-4 py-3 outline-none focus:border-primary/60 focus:shadow-[0_0_10px_rgba(0,212,255,0.1)] transition-all resize-none"
                />
                <div className="p-3 border border-primary/20 bg-primary/5 space-y-2">
                  <div className="flex items-start gap-2">
                    <Info className="w-3 h-3 text-primary/60 mt-0.5 flex-shrink-0" />
                    <p className="text-[10px] font-mono text-muted-foreground/80 leading-relaxed">
                      <span className="text-primary/80">How to get your free iCal URL:</span>
                      <br />1. Open <span className="text-primary/70">calendar.google.com</span>
                      <br />2. Settings (⚙) → click your calendar name on the left
                      <br />3. Scroll to <span className="text-primary/70">"Integrate calendar"</span>
                      <br />4. Copy <span className="text-primary/70">"Secret address in iCal format"</span>
                      <br /><br />
                      No account connection, no OAuth — it's just a URL. Free forever.
                    </p>
                  </div>
                </div>
              </div>

              {/* What Jarvis always knows */}
              <div className="p-4 border border-border/20 bg-card/20 space-y-2">
                <p className="font-display text-[10px] tracking-widest text-muted-foreground">ALWAYS ACTIVE</p>
                <p className="text-[11px] font-mono text-muted-foreground/70 leading-relaxed">
                  ✓ Current date &amp; time — Jarvis always knows what time it is, no setup needed.
                </p>
              </div>
            </div>

            {/* Save */}
            <div className="p-6 border-t border-border/30">
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 border border-primary/50 text-primary hover:bg-primary/10 transition-all font-display tracking-widest text-xs disabled:opacity-50 relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-primary/10 translate-y-[100%] group-hover:translate-y-0 transition-transform" />
                <Save className="w-3 h-3 relative z-10" />
                <span className="relative z-10">
                  {saving ? 'SAVING…' : saved ? 'SAVED ✓' : 'SAVE SETTINGS'}
                </span>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
