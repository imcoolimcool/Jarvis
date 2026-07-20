import { useState, useEffect, useRef, useCallback } from 'react';
import { useSpeechRecognition, isSpeechRecognitionSupported } from '@/hooks/use-speech-recognition';
import { useWakeWord, isWakeWordSupported } from '@/hooks/use-wake-word';
import { useSynthesizeSpeech } from '@workspace/api-client-react';
import { Orb, AppState } from '@/components/orb';
import { ConversationFeed, ChatMessage } from '@/components/conversation-feed';
import { ChatSidebar } from '@/components/chat-sidebar';
import { SettingsPanel } from '@/components/settings-panel';
import { useToast } from '@/hooks/use-toast';
import { Square, Mic, MessageSquare, Send, Settings, Menu, Sun, Moon, Paperclip, FileText, X, ChevronDown, Sparkles, MessageCircle, Briefcase, Zap, Globe, SlidersHorizontal, Music2, AlarmClock } from 'lucide-react';
import type { Widget } from '@/types/widget';
import { ClockWidget, WeatherWidget, TimerWidget, AlarmWidget, CalendarWidget, MusicWidget } from '@/components/widgets';

type Theme = 'dark' | 'light';

interface AttachedFile {
  base64: string;
  mimeType: string;
  fileName: string;
  preview?: string; // object URL for images
}

function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try { return (localStorage.getItem('jarvis-theme') as Theme) || 'dark'; }
    catch { return 'dark'; }
  });
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(theme);
    try { localStorage.setItem('jarvis-theme', theme); } catch { /* noop */ }
  }, [theme]);
  return { theme, toggle: () => setTheme(t => t === 'dark' ? 'light' : 'dark') };
}

export default function Home() {
  const [status, setStatus] = useState<AppState>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isChatMode, setIsChatMode] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [sidebarRefreshTick, setSidebarRefreshTick] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [subtitle, setSubtitle] = useState<{ user: string; jarvis: string } | null>(null);
  const [personality, setPersonality] = useState('balanced');
  const [personalityMenuOpen, setPersonalityMenuOpen] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [activeWidget, setActiveWidget] = useState<Widget | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [customPromptOpen, setCustomPromptOpen] = useState(false);

  const { theme, toggle: toggleTheme } = useTheme();

  const messagesRef = useRef<ChatMessage[]>([]);
  const activeConvIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keep a ref so speech-recognition callbacks never hold stale closures.
  const isChatModeRef = useRef(isChatMode);
  useEffect(() => { isChatModeRef.current = isChatMode; }, [isChatMode]);

  const { start: startListening, stop: stopListening } = useSpeechRecognition({
    onTranscript: (text) => {
      setStatus('thinking');
      processUserText(text);
    },
    onError: (msg) => handleError(msg),
    onEnd: () => {
      // Called when the orb-tap recording session ends (no transcript came through).
      // IMPORTANT: do NOT call startWakeWord() here — this callback fires from inside
      // a SpeechRecognition event, and iOS WebKit blocks new SR instances from that
      // context. Setting status to 'wake' is enough — the useEffect will call
      // startWakeWord() after React's commit phase (safely outside the SR callback).
      setStatus(prev => {
        if (prev === 'recording') {
          return isChatModeRef.current ? 'idle' : 'wake';
        }
        return prev;
      });
    },
  });

  const { start: startWakeWord, stop: stopWakeWord, reset: resetWakeWord, suppress: suppressWakeWord, unsuppress: unsuppressWakeWord, activateCommand } = useWakeWord({
    onWake: () => {
      if (isChatMode) return;
      playWakeSound();
      // The recognizer stays alive — command capture happens in the same session.
      setStatus('recording');
    },
    onCommand: (text) => {
      // Command captured within the wake-word session (no new recognizer spawned).
      // The wake-word hook restarts itself in wake mode after this fires.
      setStatus('thinking');
      processUserText(text);
    },
    onError: (msg) => {
      if (msg.includes('denied')) toast({ title: 'Wake word needs mic access', description: msg });
      setStatus('idle');
    },
    onCommandTimeout: () => {
      // Direct-command mode timed out with no speech — fall back to wake-word state.
      setStatus(prev => prev === 'recording' ? 'wake' : prev);
    },
  });
  const { toast } = useToast();
  const synthesizeSpeech = useSynthesizeSpeech();
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  // iOS Safari requires audio.play() to be triggered synchronously from a user
  // gesture. We pre-create and "unlock" one Audio element on first tap, then
  // reuse it for every TTS response so the async network gap doesn't block it.
  const iosUnlockedAudioRef = useRef<HTMLAudioElement | null>(null);
  const unlockAudioForIOS = useCallback(() => {
    if (iosUnlockedAudioRef.current) return; // already unlocked
    const el = new Audio();
    // Play a silent data-URI — this gesture-unlocks the element on iOS.
    el.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
    el.volume = 0;
    el.play().catch(() => {}); // ignore — only purpose is to unlock
    el.onended = () => { el.volume = 1; }; // restore volume for real playback
    iosUnlockedAudioRef.current = el;
  }, []);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { activeConvIdRef.current = activeConversationId; }, [activeConversationId]);

  // Keep subtitle in sync with latest exchange
  useEffect(() => {
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    const lastJarvis = [...messages].reverse().find(m => m.role === 'assistant');
    if (lastUser || lastJarvis) {
      setSubtitle({ user: lastUser?.content ?? '', jarvis: lastJarvis?.content ?? '' });
    }
  }, [messages]);
  useEffect(() => { if (isChatMode) setTimeout(() => inputRef.current?.focus(), 50); }, [isChatMode]);

  // Revoke object URL on cleanup
  useEffect(() => {
    return () => { if (attachedFile?.preview) URL.revokeObjectURL(attachedFile.preview); };
  }, [attachedFile]);

  // Load personality and web search from settings
  useEffect(() => {
    fetch('/api/jarvis/settings')
      .then(r => r.json())
      .then(data => {
        if (data.personality) setPersonality(data.personality);
        setWebSearchEnabled(data.web_search_enabled === 'true');
        if (data.custom_personality_prompt) setCustomPrompt(data.custom_personality_prompt);
      })
      .catch(() => {});
  }, []);

  // Wake-word lifecycle
  useEffect(() => {
    if (isChatMode) { stopWakeWord(); return; }

    if (status === 'idle' || status === 'wake') {
      // Ensure recognizer is running and not suppressed.
      if (isWakeWordSupported()) startWakeWord(); // guard in hook prevents double-start
      unsuppressWakeWord();
    } else if (status === 'thinking' || status === 'speaking' || status === 'transcribing') {
      // Suppress instead of stop: keeps the recognizer alive so activateCommand()
      // only needs to flip a ref (no recognition.start()), which is iOS-safe.
      suppressWakeWord();
    }
    // 'recording' → leave alone. Either:
    //   • orb-tap: stopWakeWord() already called inside handleToggleRecording
    //   • wake-word command capture: hook must keep running to capture the command
  }, [isChatMode, status, startWakeWord, stopWakeWord, suppressWakeWord, unsuppressWakeWord]);

  const handleSetPersonality = async (value: string) => {
    setPersonality(value);
    if (value === 'custom') {
      setCustomPromptOpen(true);
      setPersonalityMenuOpen(false);
      return;
    }
    setPersonalityMenuOpen(false);
    setCustomPromptOpen(false);
    try {
      await fetch('/api/jarvis/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personality: value }),
      });
    } catch {
      toast({ variant: 'destructive', title: 'Could not save personality' });
    }
  };

  const handleSaveCustomPrompt = async () => {
    try {
      await fetch('/api/jarvis/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personality: 'custom', custom_personality_prompt: customPrompt }),
      });
      setCustomPromptOpen(false);
      toast({ title: 'Custom personality saved' });
    } catch {
      toast({ variant: 'destructive', title: 'Could not save personality' });
    }
  };

  const handleToggleWebSearch = async () => {
    const next = !webSearchEnabled;
    setWebSearchEnabled(next);
    try {
      await fetch('/api/jarvis/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ web_search_enabled: next ? 'true' : 'false' }),
      });
    } catch {
      toast({ variant: 'destructive', title: 'Could not save web search setting' });
    }
  };

  const playWakeSound = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch { /* audio not supported */ }
  }, []);

  const handleError = useCallback((msg: string) => {
    toast({ variant: 'destructive', title: 'Something went wrong', description: msg });
    setStatus('idle');
  }, [toast]);

  const refreshSidebar = useCallback(() => setSidebarRefreshTick(t => t + 1), []);

  /** Convert a File to base64 + metadata */
  const readFile = useCallback((file: File): Promise<AttachedFile> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const [header, base64] = dataUrl.split(',');
        const mimeType = header.match(/:(.*?);/)?.[1] ?? file.type;
        const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
        resolve({ base64, mimeType, fileName: file.name, preview });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const maxSize = 1024 * 1024 * 1024; // 1 GB
    if (file.size > maxSize) { toast({ title: 'File too large', description: 'Max 1 GB' }); return; }
    try {
      if (attachedFile?.preview) URL.revokeObjectURL(attachedFile.preview);
      setAttachedFile(await readFile(file));
    } catch { toast({ title: 'Could not read file' }); }
    e.target.value = '';
  }, [attachedFile, readFile, toast]);

  /** Handle paste events — capture images pasted from clipboard */
  const handleInputPaste = useCallback(async (e: React.ClipboardEvent) => {
    const imageItem = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    try {
      if (attachedFile?.preview) URL.revokeObjectURL(attachedFile.preview);
      setAttachedFile(await readFile(file));
    } catch { toast({ title: 'Could not load image' }); }
  }, [attachedFile, readFile, toast]);

  const removeAttachedFile = useCallback(() => {
    if (attachedFile?.preview) URL.revokeObjectURL(attachedFile.preview);
    setAttachedFile(null);
  }, [attachedFile]);

  const loadConversation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/jarvis/conversations/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages((data.messages ?? []).map((m: any) => ({ role: m.role, content: m.content })));
      setActiveConversationId(id);
      setSuggestions([]);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not load conversation' });
    }
  }, [toast]);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setActiveConversationId(null);
    setSuggestions([]);
    setSubtitle(null);
    setActiveWidget(null);
  }, []);

  const playTTS = useCallback((jarvisText: string, onStart: () => void, onDone: () => void) => {
    synthesizeSpeech.mutate(
      { data: { text: jarvisText } },
      {
        onSuccess: (speechData) => {
          try {
            const binaryString = atob(speechData.audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
            const blob = new Blob([bytes.buffer], { type: speechData.contentType });
            const url = URL.createObjectURL(blob);

            // Reuse the pre-unlocked Audio element so iOS doesn't block play()
            // called from this async context. Fall back to a fresh element on
            // desktop browsers that don't have the gesture restriction.
            const el = iosUnlockedAudioRef.current ?? new Audio();
            // Reset any previous src/state before loading new audio
            el.pause();
            el.removeAttribute('src');
            el.load();
            el.src = url;
            el.volume = 1;
            activeAudioRef.current = el;
            onStart(); // flip to 'speaking' only when audio is ready
            el.play().catch(() => handleError("Audio playback failed"));
            el.onended = () => { URL.revokeObjectURL(url); activeAudioRef.current = null; onDone(); };
            el.onerror = () => { URL.revokeObjectURL(url); handleError("Audio playback failed"); };
          } catch { handleError("Failed to decode audio"); }
        },
        onError: () => onDone(),
      }
    );
  }, [synthesizeSpeech, handleError, iosUnlockedAudioRef]);

  const processUserText = useCallback(async (userText: string, file?: AttachedFile | null) => {
    // Optimistically add message (with file preview if any)
    setMessages(prev => [...prev, { role: 'user', content: userText, file: file ?? undefined }]);
    setSuggestions([]);
    setStatus('thinking');

    try {
      const body: Record<string, string> = { userMessage: userText };
      if (activeConvIdRef.current) body.conversationId = activeConvIdRef.current;
      if (file) { body.fileBase64 = file.base64; body.fileMimeType = file.mimeType; }
      if (webSearchEnabled) body.webSearchEnabled = 'true';

      const res = await fetch('/api/jarvis/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) { handleError("Jarvis hit a snag — try again."); return; }
      const data = await res.json();
      const jarvisText: string = data.response;
      const convId: string = data.conversationId;
      const newSuggestions: string[] = data.suggestions ?? [];
      const widget: Widget | null = data.widget ?? null;

      if (!activeConvIdRef.current) setActiveConversationId(convId);
      refreshSidebar();

      setMessages(prev => [...prev, { role: 'assistant', content: jarvisText, widget: widget ?? undefined }]);
      setSuggestions(newSuggestions);
      if (widget) setActiveWidget(widget);

      playTTS(jarvisText, () => setStatus('speaking'), () => {
        if (isChatMode) {
          setStatus('idle');
          setTimeout(() => inputRef.current?.focus(), 50);
        } else {
          // Auto-activate command capture: reuse the wake-word recognizer in
          // direct-command mode so no second mic session is needed, "hey Jarvis"
          // still works when Jarvis is idle, and a tap cancels cleanly.
          setStatus('recording');
          setTimeout(() => activateCommand(), 150);
        }
      });
    } catch { handleError("Jarvis hit a snag — try again."); }
  }, [handleError, refreshSidebar, playTTS, isChatMode, startWakeWord, webSearchEnabled]);

  const handleToggleRecording = useCallback(() => {
    unlockAudioForIOS(); // must be called synchronously from user gesture for iOS Safari
    if (status === 'speaking') {
      activeAudioRef.current?.pause();
      activeAudioRef.current = null;
      if (!isChatMode) {
        setStatus('wake');
        startWakeWord(); // call directly here — we're in a user-gesture context (iOS safe)
      } else {
        setStatus('idle');
      }
      return;
    }
    if (status === 'idle' || status === 'wake') {
      if (!isSpeechRecognitionSupported()) {
        handleError("Voice mode requires Chrome or Edge browser.");
        return;
      }
      // Use activateCommand() instead of stopWakeWord() + startListening().
      // This keeps a single recognizer alive — critical on iOS where start()
      // is only allowed from a user gesture. Here we ARE in a gesture, so
      // activateCommand()'s fallback start() is also iOS-safe.
      setStatus('recording');
      activateCommand(true); // user gesture — safe to start a fresh recognizer on iOS
    } else if (status === 'recording') {
      // Cancel: reset the wake-word hook to idle wake mode without stopping it.
      // suppress() clears command mode, unsuppress() re-enables callbacks —
      // net effect: recognizer stays alive in wake-word detection mode.
      suppressWakeWord();
      stopListening(); // no-op if orb-tap recognizer isn't running
      if (!isChatMode) {
        setStatus('wake');
        unsuppressWakeWord();
      } else {
        setStatus('idle');
      }
    }
  }, [status, isChatMode, startListening, stopListening, stopWakeWord, startWakeWord, suppressWakeWord, unsuppressWakeWord, activateCommand, handleError]);

  const handleChatSubmit = () => {
    const text = chatInput.trim();
    if (!text && !attachedFile) return;
    if (status === 'thinking' || status === 'transcribing') return;
    unlockAudioForIOS(); // must be called synchronously from user gesture for iOS Safari
    const file = attachedFile;
    setChatInput('');
    setAttachedFile(null);
    processUserText(text || `📎 ${file?.fileName ?? 'File'}`, file);
  };

  const handleSuggestionClick = useCallback((text: string) => {
    setSuggestions([]);
    processUserText(text);
  }, [processUserText]);

  const [chatRecording, setChatRecording] = useState(false);
  const { start: startChatRecording, stop: stopChatRecording } = useSpeechRecognition({
    onTranscript: (text) => {
      setChatInput(prev => prev ? `${prev} ${text}` : text);
      setChatRecording(false);
    },
    onError: (msg) => { toast({ title: 'Voice input failed', description: msg }); setChatRecording(false); },
    onEnd: () => setChatRecording(false),
  });

  const handleChatMicToggle = () => {
    if (chatRecording) {
      stopChatRecording();
      setChatRecording(false);
    } else {
      if (!isSpeechRecognitionSupported()) {
        toast({ title: 'Voice input not supported', description: 'Try Chrome or Edge.' });
        return;
      }
      setChatRecording(true);
      startChatRecording();
    }
  };

  const handleStopSpeaking = () => {
    activeAudioRef.current?.pause();
    activeAudioRef.current = null;
    if (isChatMode) {
      setStatus('idle');
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setStatus('wake');
      startWakeWord(); // call directly — user-gesture context (iOS safe)
    }
  };

  useEffect(() => {
    if (isChatMode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        if (e.repeat) return;
        if (status === 'idle' || status === 'wake' || status === 'recording' || status === 'speaking') handleToggleRecording();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, isChatMode, handleToggleRecording]);

  const isBusy = status === 'thinking' || status === 'transcribing';

  const statusLabels: Record<AppState, string> = {
    idle: 'Ready',
    wake: 'Listening for wake word',
    recording: 'Listening',
    transcribing: 'Transcribing',
    thinking: 'Thinking',
    speaking: 'Speaking',
  };

  const statusHint = isChatMode
    ? "Type in the chat panel"
    : status === 'idle' || status === 'wake'
      ? "Say 'hey Jarvis' or tap orb to talk"
    : status === 'recording'    ? "Listening… stops automatically when you finish speaking"
    : status === 'speaking'     ? "Tap orb to interrupt"
    : status === 'transcribing' ? "Converting speech to text…"
    : "Processing your request…";

  return (
    <div className={`${theme} min-h-[100dvh] bg-background text-foreground flex flex-col overflow-hidden`}>

      {/* ── Header ───────────────────────────────── */}
      <header className="px-4 py-3 flex items-center gap-3 border-b border-border/50 bg-background/80 backdrop-blur-md relative z-50 flex-shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="lg:hidden p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Open history"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse flex-shrink-0" />
            <h1 className="font-display font-bold tracking-[0.15em] text-base sm:text-lg glow-text truncate">JARVIS</h1>
          </div>
        </div>

        {/* Personality selector — centered in header */}
        <div className="absolute left-1/2 -translate-x-1/2">
          <div className="relative">
            <button
              onClick={() => setPersonalityMenuOpen(o => !o)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/50 bg-card/50 text-[11px] font-display tracking-wider text-muted-foreground hover:border-primary/40 hover:text-primary transition-all"
              aria-label="Change personality"
            >
              {personality === 'balanced' && <MessageCircle className="w-3 h-3" />}
              {personality === 'talkative' && <Sparkles className="w-3 h-3" />}
              {personality === 'helpful' && <Briefcase className="w-3 h-3" />}
              {personality === 'concise' && <Zap className="w-3 h-3" />}
              {personality === 'custom' && <SlidersHorizontal className="w-3 h-3" />}
              <span className="hidden sm:inline">
                {personality === 'balanced' && 'Balanced'}
                {personality === 'talkative' && 'Talkative'}
                {personality === 'helpful' && 'Helpful'}
                {personality === 'concise' && 'Just gets it done'}
                {personality === 'custom' && 'Custom'}
              </span>
              <ChevronDown className={`w-3 h-3 transition-transform ${personalityMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {personalityMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setPersonalityMenuOpen(false)} />
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 min-w-[11rem] p-1 rounded-xl border border-border/50 bg-card shadow-xl overflow-hidden">
                  {[
                    { value: 'balanced', label: 'Balanced', icon: MessageCircle },
                    { value: 'talkative', label: 'Talkative', icon: Sparkles },
                    { value: 'helpful', label: 'Helpful', icon: Briefcase },
                    { value: 'concise', label: 'Just gets it done', icon: Zap },
                    { value: 'custom', label: 'Custom', icon: SlidersHorizontal },
                  ].map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => handleSetPersonality(value)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-display tracking-wider transition-colors ${
                        personality === value
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Custom personality prompt editor */}
            {customPromptOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setCustomPromptOpen(false)} />
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 w-72 p-3 rounded-xl border border-primary/30 bg-card shadow-xl space-y-2">
                  <p className="text-[10px] font-display tracking-widest text-primary/70">CUSTOM PERSONALITY</p>
                  <textarea
                    value={customPrompt}
                    onChange={e => setCustomPrompt(e.target.value)}
                    placeholder="Describe how you want Jarvis to behave… e.g. 'Speak like a pirate but stay helpful.'"
                    className="w-full h-28 bg-background border border-border text-foreground placeholder:text-muted-foreground/40 font-mono text-[11px] px-3 py-2 rounded-lg outline-none focus:border-primary/60 resize-none"
                  />
                  <button
                    onClick={handleSaveCustomPrompt}
                    className="w-full py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-display tracking-widest hover:opacity-90 transition-opacity"
                  >
                    SAVE
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setIsChatMode(m => !m)}
            title={isChatMode ? "Switch to voice" : "Switch to chat"}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-display tracking-wider transition-all ${
              isChatMode
                ? 'border-primary bg-primary/15 text-primary'
                : 'border-border/50 text-muted-foreground hover:border-primary/40 hover:text-primary'
            }`}
          >
            {isChatMode
              ? <><Mic className="w-3 h-3" /><span className="hidden sm:inline">VOICE</span></>
              : <><MessageSquare className="w-3 h-3" /><span className="hidden sm:inline">CHAT</span></>}
          </button>
          <button onClick={toggleTheme} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            className="p-1.5 rounded-md border border-border/50 text-muted-foreground hover:border-primary/40 hover:text-primary transition-all">
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button onClick={() => setSettingsOpen(true)} title="Settings"
            className="p-1.5 rounded-md border border-border/50 text-muted-foreground hover:border-primary/40 hover:text-primary transition-all">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <ChatSidebar
          activeId={activeConversationId}
          onSelect={loadConversation}
          onNew={handleNewChat}
          refreshTick={sidebarRefreshTick}
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />

        <main className="flex-1 flex flex-col min-h-0 overflow-hidden">

          {/* ── VOICE MODE ── */}
          {!isChatMode && (
            <div className="flex-1 flex flex-col min-h-0 relative">
              <div className="dark:block hidden absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,212,255,0.05)_0%,transparent_70%)] pointer-events-none" />

              {/* Orb + status — centred in the available space above subtitles */}
              <div className="flex-1 flex flex-col items-center justify-center p-8 min-h-0">
                {/* Compact timer / alarm above orb */}
                {(activeWidget?.type === 'alarm' || activeWidget?.type === 'timer') && (
                  <div className="mb-4 flex flex-col items-center">
                    {activeWidget.type === 'alarm' && (
                      <AlarmWidget {...activeWidget} compact onClose={() => setActiveWidget(null)} />
                    )}
                    {activeWidget.type === 'timer' && (
                      <TimerWidget {...activeWidget} compact onClose={() => setActiveWidget(null)} />
                    )}
                  </div>
                )}
                <Orb status={status} onClick={handleToggleRecording} />
                <div className="mt-8 text-center space-y-2">
                  <h2 className="font-display text-xl font-bold tracking-widest text-primary glow-text">
                    {statusLabels[status]}
                  </h2>
                  <p className="font-mono text-xs text-muted-foreground tracking-wide">
                    {statusHint}
                  </p>
                  {status === 'speaking' && (
                    <button onClick={handleStopSpeaking}
                      className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-md border border-primary/50 text-primary hover:bg-primary/10 transition-colors font-display tracking-widest text-xs">
                      <Square className="w-3 h-3 fill-current" /> STOP
                    </button>
                  )}
                </div>
              </div>

              {/* Widget panel OR subtitle strip — pinned to bottom */}
              <div className="flex-shrink-0 px-6 pb-8 pt-2 max-w-2xl w-full mx-auto">
                {activeWidget && activeWidget.type !== 'alarm' ? (
                  <div className="overflow-y-auto max-h-[55vh]">
                    {activeWidget.type === 'clock'    && <ClockWidget {...activeWidget} onClose={() => setActiveWidget(null)} />}
                    {activeWidget.type === 'weather'  && <WeatherWidget {...activeWidget} onClose={() => setActiveWidget(null)} />}
                    {activeWidget.type === 'timer'    && <TimerWidget {...activeWidget} onClose={() => setActiveWidget(null)} />}
                    {activeWidget.type === 'calendar' && <CalendarWidget {...activeWidget} onClose={() => setActiveWidget(null)} />}
                    {activeWidget.type === 'music'    && <MusicWidget {...activeWidget} onClose={() => setActiveWidget(null)} />}
                  </div>
                ) : (
                  <div className="space-y-2 min-h-[5rem]">
                    {subtitle?.user && (
                      <p className="text-center font-mono text-sm text-muted-foreground/70 leading-snug">
                        <span className="text-[10px] tracking-widest text-muted-foreground/40 block mb-0.5">YOU</span>
                        {subtitle.user}
                      </p>
                    )}
                    {subtitle?.jarvis && (
                      <p className="text-center font-mono text-sm text-primary/80 leading-snug">
                        <span className="text-[10px] tracking-widest text-primary/40 block mb-0.5">JARVIS</span>
                        {subtitle.jarvis}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── CHAT MODE ── */}
          {isChatMode && (
            <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
              {/* Orb panel */}
              <div className="hidden lg:flex flex-shrink-0 lg:w-72 xl:w-80 flex-col items-center justify-center p-6 border-r border-border/20 relative overflow-y-auto">
                <div className="dark:block hidden absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,212,255,0.05)_0%,transparent_70%)] pointer-events-none" />
                {/* Compact alarm above orb in chat mode */}
                {activeWidget?.type === 'alarm' && (
                  <div className="mb-3 flex flex-col items-center gap-1">
                    <AlarmClock className="w-5 h-5 text-primary/70" />
                    <AlarmWidget {...activeWidget} compact onClose={() => setActiveWidget(null)} />
                  </div>
                )}
                <Orb status={status} />
                <div className="mt-6 text-center space-y-2">
                  <h2 className="font-display text-xl font-bold tracking-widest text-primary glow-text">
                    {statusLabels[status]}
                  </h2>
                  <p className="font-mono text-xs text-muted-foreground tracking-wide max-w-[180px]">
                    {statusHint}
                  </p>
                </div>
                {/* Widget strip in chat mode — below orb */}
                {activeWidget && activeWidget.type !== 'alarm' && (
                  <div className="mt-4 w-full space-y-3">
                    {activeWidget.type === 'clock'    && <ClockWidget {...activeWidget} onClose={() => setActiveWidget(null)} />}
                    {activeWidget.type === 'weather'  && <WeatherWidget {...activeWidget} onClose={() => setActiveWidget(null)} />}
                    {activeWidget.type === 'timer'    && <TimerWidget {...activeWidget} onClose={() => setActiveWidget(null)} />}
                    {activeWidget.type === 'calendar' && <CalendarWidget {...activeWidget} onClose={() => setActiveWidget(null)} />}
                    {activeWidget.type === 'music'    && <MusicWidget {...activeWidget} onClose={() => setActiveWidget(null)} />}
                  </div>
                )}
              </div>

              {/* Chat area */}
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-card/5">
                <ConversationFeed
                  messages={messages}
                  isThinking={status === 'thinking'}
                  suggestions={suggestions}
                  onSuggestionClick={handleSuggestionClick}
                />

                {/* Input bar */}
                <div className="border-t border-border/30 bg-background/90 backdrop-blur-md px-4 py-3 flex-shrink-0 space-y-2">
                  {attachedFile && (
                    <div className="flex items-center gap-2">
                      <div className="relative w-14 h-14 rounded-lg overflow-hidden border border-border flex-shrink-0 flex items-center justify-center bg-card/40">
                        {attachedFile.preview ? (
                          <img src={attachedFile.preview} alt="Attachment" className="w-full h-full object-cover" />
                        ) : (
                          <FileText className="w-5 h-5 text-muted-foreground/60" />
                        )}
                        <button onClick={removeAttachedFile}
                          className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-background/80 flex items-center justify-center text-foreground hover:text-red-400 transition-colors">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-mono text-foreground/80 tracking-widest truncate">{attachedFile.fileName}</p>
                        <p className="text-[9px] font-mono text-muted-foreground/50 tracking-widest">FILE ATTACHED</p>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
                    <button onClick={() => fileInputRef.current?.click()} disabled={isBusy}
                      title="Attach a file or image (or paste from clipboard)"
                      className={`p-2.5 rounded-lg border transition-all flex-shrink-0 ${
                        attachedFile ? 'border-primary text-primary bg-primary/10' : 'border-border/50 text-muted-foreground hover:border-primary/40 hover:text-primary'
                      } disabled:opacity-30`}>
                      <Paperclip className="w-4 h-4" />
                    </button>
                    <button onClick={handleToggleWebSearch} disabled={isBusy}
                      title={webSearchEnabled ? 'Web search enabled' : 'Web search disabled'}
                      className={`p-2.5 rounded-lg border transition-all flex-shrink-0 ${
                        webSearchEnabled
                          ? 'border-primary text-primary bg-primary/10'
                          : 'border-border/50 text-muted-foreground hover:border-primary/40 hover:text-primary'
                      } disabled:opacity-30`}>
                      <Globe className="w-4 h-4" />
                    </button>
                    <input ref={inputRef} type="text" value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleChatSubmit()}
                      onPaste={handleInputPaste}
                      placeholder={isBusy ? "Processing…" : attachedFile ? "Add a message…" : "Message Jarvis…"}
                      disabled={isBusy}
                      className="flex-1 bg-card border border-border text-foreground placeholder:text-muted-foreground/50 font-mono text-sm px-4 py-2.5 rounded-lg outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10 transition-all disabled:opacity-40"
                    />
                    <button onClick={handleChatMicToggle} disabled={isBusy}
                      title={chatRecording ? 'Stop recording' : 'Voice input'}
                      className={`p-2.5 rounded-lg border transition-all flex-shrink-0 ${
                        chatRecording
                          ? 'border-red-400/60 text-red-400 bg-red-400/10 animate-pulse'
                          : 'border-border/50 text-muted-foreground hover:border-primary/40 hover:text-primary'
                      } disabled:opacity-30`}>
                      <Mic className="w-4 h-4" />
                    </button>
                    <button onClick={handleChatSubmit} disabled={isBusy || (!chatInput.trim() && !attachedFile)}
                      className="px-4 py-2.5 rounded-lg border border-primary/50 text-primary hover:bg-primary/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5 font-display tracking-wider text-xs flex-shrink-0">
                      <Send className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">SEND</span>
                    </button>
                  </div>
                  {status === 'speaking' && (
                    <p className="text-[10px] font-mono text-muted-foreground/50 tracking-widest text-center">
                      JARVIS IS SPEAKING —{' '}
                      <button onClick={handleStopSpeaking} className="text-primary hover:underline">STOP</button>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      <div className="dark:block hidden pointer-events-none fixed inset-0 z-30 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(5,5,8,0.7)_100%)]" />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
