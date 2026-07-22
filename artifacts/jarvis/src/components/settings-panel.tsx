import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Cloud, CalendarDays, Info, Plus, Trash2, Mail, CheckCircle2, LogOut, Brain, Globe, Music2, Pencil, Check, User } from 'lucide-react';
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
  web_search_enabled: string;
  google_calendar_enabled: string;
  user_profile: string;
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
  web_search_enabled: 'false',
  google_calendar_enabled: 'true',
  user_profile: '',
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
  const [spotifyStatus, setSpotifyStatus] = useState<{ connected: boolean; displayName?: string } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectingSpotify, setDisconnectingSpotify] = useState(false);
  const [memories, setMemories] = useState<{ topic: string; value: string; updatedAt: string }[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [deletingMemory, setDeletingMemory] = useState<string | null>(null);
  const [editingMemory, setEditingMemory] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const [visibleSlots, setVisibleSlots] = useState(1);

  const fetchGmailStatus = useCallback(() => {
    fetch('/api/jarvis/gmail/status')
      .then(r => r.json())
      .then(setGmailStatus)
      .catch(() => setGmailStatus({ connected: false }));
  }, []);

  const fetchSpotifyStatus = useCallback(() => {
    fetch('/api/jarvis/spotify/status')
      .then(r => r.json())
      .then(setSpotifyStatus)
      .catch(() => setSpotifyStatus({ connected: false }));
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

  const startEditMemory = (topic: string, currentValue: string) => {
    setEditingMemory(topic);
    setEditDraft(currentValue);
  };

  const handleSaveMemoryEdit = async (topic: string) => {
    const value = editDraft.trim();
    if (!value) return;
    try {
      const res = await fetch(`/api/jarvis/memories/${encodeURIComponent(topic)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (res.ok) {
        setMemories(prev => prev.map(m => m.topic === topic ? { ...m, value } : m));
        toast({ title: 'Memory updated' });
      } else {
        toast({ title: 'Could not update memory', variant: 'destructive' });
      }
    } finally {
      setEditingMemory(null);
      setEditDraft('');
    }
  };

  useEffect(() => {
    if (!open) return;
    fetch('/api/jarvis/settings')
      .then(r => r.json())
      .then(data => {
        const loaded: Settings = { ...EMPTY, ...data };
        setForm(loaded);
        const filled = [1,2,3,4,5].filter(n => loaded[`calendar_ics_url_${n}` as keyof Settings]);
        setVisibleSlots(Math.max(1, filled.length));
      })
      .catch(() => {});
    fetchGmailStatus();
    fetchSpotifyStatus();
    fetchMemories();
  }, [open, fetchGmailStatus, fetchSpotifyStatus, fetchMemories]);

  const handleConnectGmail = () => {
    const popup = window.open('/api/jarvis/gmail/auth', 'gmail_auth', 'width=500,height=650,left=200,top=100');
    const onMessage = (e: MessageEvent) => {
      if (e.data === 'gmail_connected') {
        fetchGmailStatus();
        window.removeEventListener('message', onMessage);
        popup?.close();
        toast({
          title: 'Gmail + Calendar linked',
          description: 'Jarvis now has access to your inbox and calendar.',
          className: 'border-primary/40 bg-background text-foreground font-sans',
          duration: 4000,
        });
      }
    };
    window.addEventListener('message', onMessage);
    const poll = setInterval(() => {
      if (popup?.closed) { clearInterval(poll); fetchGmailStatus(); window.removeEventListener('message', onMessage); }
    }, 800);
  };

  const handleConnectSpotify = () => {
    const popup = window.open('/api/jarvis/spotify/auth', 'spotify_auth', 'width=500,height=700,left=200,top=100');
    const onMessage = (e: MessageEvent) => {
      if (e.data === 'spotify_connected') {
        fetchSpotifyStatus();
        window.removeEventListener('message', onMessage);
        popup?.close();
        toast({ title: 'Spotify connected', duration: 4000 });
      }
    };
    window.addEventListener('message', onMessage);
    const poll = setInterval(() => {
      if (popup?.closed) { clearInterval(poll); fetchSpotifyStatus(); window.removeEventListener('message', onMessage); }
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

  const handleDisconnectSpotify = async () => {
    setDisconnectingSpotify(true);
    try {
      await fetch('/api/jarvis/spotify/disconnect', { method: 'DELETE' });
      setSpotifyStatus({ connected: false });
    } finally {
      setDisconnectingSpotify(false);
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

              {/* ── USER PROFILE ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-primary/70" />
                  <label className="font-display text-[11px] tracking-widest text-foreground font-semibold">USER PROFILE</label>
                </div>
                <p className="text-[10px] font-mono text-muted-foreground/50">
                  A few sentences about yourself. Jarvis reads this every conversation to personalise replies.
                </p>
                <textarea
                  value={form.user_profile}
                  onChange={e => setForm(f => ({ ...f, user_profile: e.target.value }))}
                  placeholder="e.g. My name is Alex. I'm a software engineer based in London. I prefer concise answers and use metric units."
                  rows={4}
                  maxLength={2000}
                  className="w-full bg-card border border-border text-foreground placeholder:text-muted-foreground/40 font-mono text-[11px] px-4 py-3 rounded-lg outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10 transition-all resize-none leading-relaxed"
                />
                <p className="text-[10px] font-mono text-muted-foreground/40 text-right">
                  {form.user_profile.length}/2000
                </p>
              </div>

              {/* ── MEMORIES ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Brain className="w-3.5 h-3.5 text-primary/70" />
                  <label className="font-display text-[11px] tracking-widest text-foreground font-semibold">MEMORIES</label>
                </div>
                <p className="text-[10px] font-mono text-muted-foreground/50">
                  Facts Jarvis has picked up during conversations. Edit or delete any entry.
                </p>

                {loadingMemories ? (
                  <p className="text-[11px] font-mono text-muted-foreground/50">Loading…</p>
                ) : memories.length === 0 ? (
                  <div className="p-3 border border-border/30 rounded-lg bg-card/20 text-center">
                    <Brain className="w-5 h-5 text-muted-foreground/30 mx-auto mb-1.5" />
                    <p className="text-[11px] font-mono text-muted-foreground/50">
                      No memories yet. Chat with Jarvis and he'll start picking things up.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {memories.map(m => (
                      <div key={m.topic} className="border border-border/50 rounded-lg bg-card/30 overflow-hidden">
                        <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1">
                          <p className="text-[10px] font-mono text-primary/70 uppercase tracking-widest truncate">
                            {m.topic.replace(/_/g, ' ')}
                          </p>
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            {editingMemory === m.topic ? (
                              <button
                                onClick={() => handleSaveMemoryEdit(m.topic)}
                                className="p-1.5 text-primary hover:text-primary/80 transition-colors"
                                title="Save"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <button
                                onClick={() => startEditMemory(m.topic, m.value)}
                                disabled={!!deletingMemory}
                                className="p-1.5 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                                title="Edit"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteMemory(m.topic)}
                              disabled={deletingMemory === m.topic || editingMemory === m.topic}
                              className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors disabled:opacity-50"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        {editingMemory === m.topic ? (
                          <div className="px-3 pb-2.5">
                            <input
                              type="text"
                              value={editDraft}
                              onChange={e => setEditDraft(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleSaveMemoryEdit(m.topic);
                                if (e.key === 'Escape') { setEditingMemory(null); setEditDraft(''); }
                              }}
                              autoFocus
                              className="w-full bg-background border border-primary/40 text-foreground font-mono text-[11px] px-2.5 py-1.5 rounded-md outline-none focus:ring-1 focus:ring-primary/30"
                            />
                          </div>
                        ) : (
                          <p className="px-3 pb-2.5 text-[11px] font-mono text-foreground/80 leading-snug">{m.value}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── GMAIL + GOOGLE CALENDAR ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-primary/70" />
                  <label className="font-display text-[11px] tracking-widest text-foreground font-semibold">GMAIL + GOOGLE CALENDAR</label>
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
                    Connect Google account (Gmail + Calendar)
                  </button>
                )}
                <p className="text-[10px] font-mono text-muted-foreground/50">
                  {gmailStatus?.connected
                    ? `↳ Gmail inbox + Google Calendar synced as ${gmailStatus.email}`
                    : 'Grants Jarvis read access to your Gmail inbox and Google Calendar.'}
                </p>
              </div>

              {/* ── SPOTIFY ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Music2 className="w-3.5 h-3.5 text-primary/70" />
                  <label className="font-display text-[11px] tracking-widest text-foreground font-semibold">SPOTIFY</label>
                </div>

                {spotifyStatus?.connected ? (
                  <div className="flex items-center justify-between p-3 border border-primary/30 bg-primary/5 rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[11px] font-mono text-primary">Connected</p>
                        {spotifyStatus.displayName && (
                          <p className="text-[10px] font-mono text-muted-foreground/60 truncate">{spotifyStatus.displayName}</p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={handleDisconnectSpotify}
                      disabled={disconnectingSpotify}
                      className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-red-400 transition-colors flex-shrink-0 ml-2"
                    >
                      <LogOut className="w-3 h-3" />
                      {disconnectingSpotify ? 'Disconnecting…' : 'Disconnect'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleConnectSpotify}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-green-500/30 rounded-lg text-[11px] font-mono text-green-400/80 hover:border-green-500/60 hover:text-green-400 transition-all"
                  >
                    <Music2 className="w-3.5 h-3.5" />
                    Connect Spotify
                  </button>
                )}
                <p className="text-[10px] font-mono text-muted-foreground/50">
                  Link your Spotify account so Jarvis can see your listening context.
                </p>
              </div>

              {/* ── WEB SEARCH ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-primary/70" />
                  <label className="font-display text-[11px] tracking-widest text-foreground font-semibold">WEB SEARCH</label>
                </div>
                <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-card/30">
                  <div className="min-w-0">
                    <p className="text-[11px] font-mono text-foreground">Let Jarvis search the web</p>
                    <p className="text-[10px] font-mono text-muted-foreground/60">Powered by Tavily.</p>
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

              {/* ── WEATHER ── */}
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
                  Also used for your local timezone when you ask Jarvis the time.
                </p>
              </div>

              {/* ── CALENDAR FEEDS ── */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-3.5 h-3.5 text-primary/70" />
                    <label className="font-display text-[11px] tracking-widest text-foreground font-semibold">MANUAL CALENDAR FEEDS</label>
                  </div>
                  {visibleSlots < 5 && (
                    <button
                      onClick={() => setVisibleSlots(v => Math.min(5, v + 1))}
                      className="flex items-center gap-1 text-[10px] font-mono text-primary hover:text-primary/80 transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Add feed
                    </button>
                  )}
                </div>

                <p className="text-[10px] font-mono text-muted-foreground/50">
                  Optional: add iCal feed URLs as a fallback when Google Calendar is not connected.
                </p>

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
                            placeholder="Feed name (e.g. Work, Personal)…"
                            className="flex-1 bg-background border border-border text-foreground placeholder:text-muted-foreground/40 font-mono text-xs px-3 py-2 rounded-md outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10 transition-all"
                          />
                          {visibleSlots > 1 && (
                            <button
                              onClick={() => removeCalendar(i)}
                              className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors flex-shrink-0"
                              title="Remove this feed"
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
                      <p className="text-primary/70 font-semibold">How to get a Google Calendar iCal URL</p>
                      <p>1. Open <span className="text-primary/60">calendar.google.com</span></p>
                      <p>2. Settings ⚙ → click your calendar name</p>
                      <p>3. Scroll to <span className="text-primary/60">"Integrate calendar"</span></p>
                      <p>4. Copy <span className="text-primary/60">"Secret address in iCal format"</span></p>
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
