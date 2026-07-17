import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Cloud, CalendarDays, Info, Plus, Trash2, Mail, CheckCircle2, LogOut, Brain, Globe, MessageSquare, Rocket, Briefcase, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Settings {
  weather_location: string;
  calendar_ics_url_1: string;
  calendar_ics_url_2: string;
  calendar_ics_url_3: string;
  calendar_ics_url_4: string;
  calendar_ics_url_5: string;
  calendar_name_1: string;
  calendar_name_2: string;
  calendar_name_3: string;
  calendar_name_4: string;
  calendar_name_5: string;
  personality: string;
  web_search_enabled: string;
}

const EMPTY: Settings = {
  weather_location: '',
  calendar_ics_url_1: '',
  calendar_ics_url_2: '',
  calendar_ics_url_3: '',
  calendar_ics_url_4: '',
  calendar_ics_url_5: '',
  calendar_name_1: '',
  calendar_name_2: '',
  calendar_name_3: '',
  calendar_name_4: '',
  calendar_name_5: '',
  personality: 'balanced',
  web_search_enabled: 'false',
};

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<Settings>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [gmailStatus, setGmailStatus] = useState<{ connected: boolean; email?: string } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [memories, setMemories] = useState<{ topic: string; value: string; updatedAt: string }[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [deletingMemory, setDeletingMemory] = useState<string | null>(null);

  // Number of calendar slots currently shown (at least those with values, min 1)
  const [visibleSlots, setVisibleSlots] = useState(1);

  const fetchGmailStatus = useCallback(() => {
    fetch('/api/jarvis/gmail/status')
      .then(r => r.json())
      .then(setGmailStatus)
      .catch(() => setGmailStatus({ connected: false }));
  }, []);

  const fetchMemories = useCallback(async () => {
    setLoadingMemories(true);
    try {
      const res = await fetch('/api/jarvis/memories');
      if (res.ok) setMemories(await res.json());
    } catch {
      setMemories([]);
    } finally {
      setLoadingMemories(false);
    }
  }, []);

  const handleDeleteMemory = async (topic: string) => {
    setDeletingMemory(topic);
    try {
      const res = await fetch(`/api/jarvis/memories/${encodeURIComponent(topic)}`, { method: 'DELETE' });
      if (res.ok) {
        setMemories(prev => prev.filter(m => m.topic !== topic));
        toast({ title: 'Memory deleted', description: `Forgot "${topic}".` });
      } else {
        toast({ title: 'Could not delete memory', variant: 'destructive' });
      }
    } finally {
      setDeletingMemory(null);
    }
  };

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
    fetchGmailStatus();
    fetchMemories();
  }, [open, fetchGmailStatus, fetchMemories]);

  const handleConnectGmail = () => {
    const popup = window.open('/api/jarvis/gmail/auth', 'gmail_auth', 'width=500,height=650,left=200,top=100');
    const onMessage = (e: MessageEvent) => {
      if (e.data === 'gmail_connected') {
        fetchGmailStatus();
        window.removeEventListener('message', onMessage);
        popup?.close();
        toast({
          title: 'Gmail linked',
          description: 'Jarvis now has access to your inbox.',
          className: 'border-primary/40 bg-background text-foreground font-sans [&_[data-title]]:font-display [&_[data-title]]:tracking-widest',
          duration: 4000,
        });
      }
    };
    window.addEventListener('message', onMessage);
    // Fallback: poll if popup closed without postMessage
    const poll = setInterval(() => {
      if (popup?.closed) { clearInterval(poll); fetchGmailStatus(); window.removeEventListener('message', onMessage); }
    }, 800);
  };

  const handleDisconnectGmail = async () => {
    setDisconnecting(true);
    try {
      await fetch('/api/jarvis/gmail/disconnect', { method: 'DELETE' });
      setGmailStatus({ connected: false });
    } finally {
      setDisconnecting(false);
    }
  };

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

  const removeCalendar = (index: number) => {
    // Shift remaining url+name pairs up, clear last
    const newForm = { ...form };
    for (let i = index; i < 4; i++) {
      const n = i + 1;
      newForm[`calendar_ics_url_${n}` as keyof Settings] = newForm[`calendar_ics_url_${n + 1}` as keyof Settings];
      newForm[`calendar_name_${n}` as keyof Settings] = newForm[`calendar_name_${n + 1}` as keyof Settings];
    }
    newForm['calendar_ics_url_5'] = '';
    newForm['calendar_name_5'] = '';
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

              {/* Gmail */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-primary/70" />
                  <label className="font-display text-[11px] tracking-widest text-foreground font-semibold">GMAIL</label>
                </div>

                {gmailStatus?.connected ? (
                  <div className="flex items-center justify-between p-3 border border-primary/30 bg-primary/5 rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[11px] font-mono text-primary">Connected</p>
                        <p className="text-[10px] font-mono text-muted-foreground/60 truncate">{gmailStatus.email}</p>
                      </div>
                    </div>
                    <button
                      onClick={handleDisconnectGmail}
                      disabled={disconnecting}
                      className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-red-400 transition-colors flex-shrink-0 ml-2"
                    >
                      <LogOut className="w-3 h-3" />
                      {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleConnectGmail}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-border/50 rounded-lg text-[11px] font-mono text-muted-foreground hover:border-primary/40 hover:text-primary transition-all"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    Connect Gmail account
                  </button>
                )}
                {gmailStatus?.connected ? (
                  <p className="text-[10px] font-mono text-primary/50 tracking-wide">
                    ↳ monitoring inbox as {gmailStatus.email}
                  </p>
                ) : (
                  <p className="text-[10px] font-mono text-muted-foreground/50">
                    Lets Jarvis read your unread inbox so you can ask about emails by voice.
                  </p>
                )}
              </div>

              {/* Personality */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-primary/70" />
                  <label className="font-display text-[11px] tracking-widest text-foreground font-semibold">PERSONALITY</label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'balanced', label: 'Balanced', icon: MessageSquare },
                    { value: 'talkative', label: 'Talkative', icon: Sparkles },
                    { value: 'helpful', label: 'Helpful', icon: Briefcase },
                    { value: 'concise', label: 'No extra words', icon: MessageSquare },
                    { value: 'terse', label: 'Just gets it done', icon: Rocket },
                  ].map(({ value, label, icon: Icon }) => {
                    const active = form.personality === value;
                    return (
                      <button
                        key={value}
                        onClick={() => setForm(f => ({ ...f, personality: value }))}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-[11px] font-mono transition-all ${
                          active
                            ? 'border-primary/60 bg-primary/10 text-primary'
                            : 'border-border/50 text-muted-foreground hover:border-primary/40 hover:text-primary'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Web Search */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-primary/70" />
                  <label className="font-display text-[11px] tracking-widest text-foreground font-semibold">WEB SEARCH</label>
                </div>
                <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-card/30">
                  <div className="min-w-0">
                    <p className="text-[11px] font-mono text-foreground">Let Jarvis search the web</p>
                    <p className="text-[10px] font-mono text-muted-foreground/60">Requires a Tavily API key in Secrets.</p>
                  </div>
                  <button
                    onClick={() => setForm(f => ({ ...f, web_search_enabled: f.web_search_enabled === 'true' ? 'false' : 'true' }))}
                    className={`relative w-10 h-5 rounded-full transition-colors ${form.web_search_enabled === 'true' ? 'bg-primary' : 'bg-muted'}`}
                    aria-label="Toggle web search"
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-background transition-transform ${form.web_search_enabled === 'true' ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
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

              {/* Memory */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Brain className="w-3.5 h-3.5 text-primary/70" />
                  <label className="font-display text-[11px] tracking-widest text-foreground font-semibold">MEMORY</label>
                </div>

                {loadingMemories ? (
                  <p className="text-[11px] font-mono text-muted-foreground/50">Loading memories…</p>
                ) : memories.length === 0 ? (
                  <p className="text-[11px] font-mono text-muted-foreground/50">
                    Jarvis hasn't learned anything about you yet. Talk to him and he'll remember facts here.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {memories.map(m => (
                      <div key={m.topic} className="flex items-start justify-between gap-2 p-3 border border-border/50 rounded-lg bg-card/30">
                        <div className="min-w-0">
                          <p className="text-[10px] font-mono text-primary/70 uppercase tracking-widest">{m.topic}</p>
                          <p className="text-[11px] font-mono text-foreground/80 leading-snug">{m.value}</p>
                        </div>
                        <button
                          onClick={() => handleDeleteMemory(m.topic)}
                          disabled={deletingMemory === m.topic}
                          className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors flex-shrink-0 disabled:opacity-50"
                          title="Delete this memory"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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
                  {calendarKeys.map((urlKey, i) => {
                    const nameKey = `calendar_name_${i + 1}` as keyof Settings;
                    return (
                      <motion.div
                        key={urlKey}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-1.5 border border-border/30 rounded-lg p-3 bg-card/30"
                      >
                        <div className="flex items-center gap-2">
                          {visibleSlots > 1 && (
                            <span className="text-[10px] font-mono text-muted-foreground/40 flex-shrink-0">
                              #{i + 1}
                            </span>
                          )}
                          <input
                            type="text"
                            value={form[nameKey]}
                            onChange={e => setForm(f => ({ ...f, [nameKey]: e.target.value }))}
                            placeholder="Calendar name (e.g. Work, Personal)…"
                            className="flex-1 bg-background border border-border text-foreground placeholder:text-muted-foreground/40 font-mono text-xs px-3 py-2 rounded-md outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10 transition-all"
                          />
                          {visibleSlots > 1 && (
                            <button
                              onClick={() => removeCalendar(i)}
                              className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors flex-shrink-0"
                              title="Remove this calendar"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <input
                          type="url"
                          value={form[urlKey]}
                          onChange={e => setForm(f => ({ ...f, [urlKey]: e.target.value }))}
                          placeholder="Paste iCal URL…"
                          className="w-full bg-background border border-border text-foreground placeholder:text-muted-foreground/40 font-mono text-xs px-3 py-2 rounded-md outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10 transition-all"
                        />
                      </motion.div>
                    );
                  })}
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
