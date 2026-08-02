import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSpeechRecognition, isSpeechRecognitionSupported } from '@/hooks/use-speech-recognition';
import { useWakeWord, isWakeWordSupported } from '@/hooks/use-wake-word';
import { useClapDetection } from '@/hooks/use-clap-detection';
import { useSynthesizeSpeech } from '@workspace/api-client-react';
import { Orb, AppState } from '@/components/orb';
import { ConversationFeed, ChatMessage } from '@/components/conversation-feed';
import { ChatSidebar } from '@/components/chat-sidebar';
import { SettingsPanel } from '@/components/settings-panel';
import { useToast } from '@/hooks/use-toast';
import { Square, Mic, MessageSquare, Send, Settings, Menu, Sun, Moon, Paperclip, FileText, X, ChevronDown, Sparkles, MessageCircle, Briefcase, Zap, Globe, SlidersHorizontal, AlarmClock, Plus, Camera, Bug, Image as ImageIcon, Monitor, Bot, Webcam, Minimize2, Maximize2, AudioWaveform } from 'lucide-react';
import type { Widget } from '@/types/widget';
import { ClockWidget, WeatherWidget, TimerWidget, AlarmWidget, CalendarWidget } from '@/components/widgets';
import { ErrorDetailPanel, type ErrorDetail } from '@/components/error-detail-panel';
import { useScreenShare } from '@/hooks/use-screen-share';
import { JarvisBrowser } from '@/components/jarvis-browser';
import { CameraFeed } from '@/components/camera-feed';
import { useI18n } from '@/lib/i18n';
import { haptics } from '@/lib/haptics';

type Theme = 'dark' | 'light' | 'auto';

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
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  // Follow the OS theme while in 'auto' mode
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolved: 'dark' | 'light' = theme === 'auto' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(resolved);
    try { localStorage.setItem('jarvis-theme', theme); } catch { /* noop */ }
  }, [theme, resolved]);

  return {
    theme,
    resolved,
    setTheme,
    /** Pass a target mode, or toggle dark ↔ light when omitted (header quick toggle). */
    toggle: (next?: Theme) => setTheme(next ?? (resolved === 'dark' ? 'light' : 'dark')),
  };
}

export default function Home() {
  const { t, lang } = useI18n();
  const [status, setStatus] = useState<AppState>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // #13: Persist modes across iOS Safari tab reloads
  const [mode, setMode] = useState<'voice' | 'chat' | 'agent' | 'camera'>(() => {
    try { return (localStorage.getItem('jarvis-mode') as any) || 'voice'; } catch { return 'voice'; }
  });
  const isChatMode = mode === 'chat';
  const isAgentMode = mode === 'agent';
  const isCameraMode = mode === 'camera';
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
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const openPlusMenu = useCallback(() => {
    if (plusButtonRef.current) {
      const rect = plusButtonRef.current.getBoundingClientRect();
      setPlusMenuCoords({ bottom: window.innerHeight - rect.top + 8, right: window.innerWidth - rect.right - 8 });
    }
    setPlusMenuOpen(true);
  }, []);
  const closePlusMenu = useCallback(() => {
    setPlusMenuOpen(false);
    setPlusMenuCoords(null);
  }, []);
  const [errorDetail, setErrorDetail] = useState<ErrorDetail | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatingImagePrompt, setGeneratingImagePrompt] = useState('');
  const [screenShareActive, setScreenShareActive] = useState(false);
  const [pipBrowserOpen, setPipBrowserOpen] = useState(false);
  const [pipCameraOpen, setPipCameraOpen] = useState(false);
  const [pipFullscreen, setPipFullscreen] = useState<'browser' | 'camera' | null>(null);
  const [agentModeActive, setAgentModeActive] = useState(false);
  const [agentGoal, setAgentGoal] = useState<string | null>(null);
  const [plusMenuCoords, setPlusMenuCoords] = useState<{ bottom: number; right: number } | null>(null);
  const plusButtonRef = useRef<HTMLDivElement>(null);

  const { theme, resolved, toggle: toggleTheme } = useTheme();
  const { toast } = useToast();

  // Track the last submitted message for retry
  const lastFailedTextRef = useRef<string | null>(null);
  const lastFailedFileRef = useRef<AttachedFile | null>(null);

  // Track connection quality via time-to-first-token
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const latencySamplesRef = useRef<number[]>([]);
  const requestStartRef = useRef<number>(0);


  const messagesRef = useRef<ChatMessage[]>([]);
  const activeConvIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Timer tracking for chat mode — timer lives inline in the feed, not in the sidebar
  const chatTimerMsgIdxRef = useRef<number | null>(null);
  const timerStartedAtRef = useRef<number | null>(null);
  const timerOriginalDurationRef = useRef<number | null>(null);

  // Keep a ref so speech-recognition callbacks never hold stale closures.
  const isChatModeRef = useRef(isChatMode);
  useEffect(() => { isChatModeRef.current = isChatMode; }, [isChatMode]);
  // #13: Persist chat mode to localStorage
  useEffect(() => {
    try { localStorage.setItem('jarvis-mode', mode); } catch { /* noop */ }
  }, [mode]);

  const { start: startListening, stop: stopListening } = useSpeechRecognition({
    lang: lang === 'nl' ? 'nl-NL' : 'en-US',
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

  // Activation method: 'wake' for "Hey Jarvis", 'clap' for double clap
  const [activationMethod, setActivationMethod] = useState<'wake' | 'clap'>(() => {
    try { return (localStorage.getItem('jarvis-activation-method') as 'wake' | 'clap') || 'wake'; }
    catch { return 'wake'; }
  });

  const { start: startWakeWord, stop: stopWakeWord, reset: resetWakeWord, suppress: suppressWakeWord, unsuppress: unsuppressWakeWord, activateCommand } = useWakeWord({
    lang: lang === 'nl' ? 'nl-NL' : 'en-US',
    onWake: () => {
      if (isChatMode) return;
      playWakeSound();
      vibrate([50, 30, 50]);
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
      // Direct-command mode timed out with no speech — fall back to idle.
      setStatus(prev => prev === 'recording' ? 'idle' : prev);
    },
  });

  // Double clap detection — alternative activation method
  const { start: startClapDetection, stop: stopClapDetection } = useClapDetection({
    onClap: () => {
      if (isChatMode) return;
      if (status === 'idle' || status === 'wake') {
        playWakeSound();
        vibrate([50, 30, 50]);
        setStatus('recording');
        activateCommand(true);
      }
    },
    enabled: activationMethod === 'clap' && !isChatMode,
  });

  // Persist activation method to localStorage
  useEffect(() => {
    try { localStorage.setItem('jarvis-activation-method', activationMethod); } catch { /* noop */ }
  }, [activationMethod]);
  const synthesizeSpeech = useSynthesizeSpeech();

  // Screen share — start/stop + track active state + latest frame for AI
  const { start: startScreenShare, stop: stopScreenShare, latestFrame: screenFrame } = useScreenShare({
    onFrame: (frame) => {
      // Store latest frame for AI context
    },
  });
  const activeAudioRef = useRef<{ stop: () => void } | null>(null);
  // Audio context shared across all TTS playback. Using Web Audio API with
  // decodeAudioData fully buffers the audio before playing — eliminates the
  // "l...lo... ho...w..." stutter on Android Chrome.
  const audioContextRef = useRef<AudioContext | null>(null);
  // The unlocked Audio element is kept only for the iOS gesture unlock (the
  // silent play that tells Safari "this origin is allowed audio").
  const iosUnlockedAudioRef = useRef<HTMLAudioElement | null>(null);
  const unlockAudioForIOS = useCallback(() => {
    if (!audioContextRef.current) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new Ctor();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
    if (!iosUnlockedAudioRef.current) {
      const el = new Audio();
      el.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
      el.volume = 0;
      el.play().catch(() => {});
      iosUnlockedAudioRef.current = el;
    }
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

  /** Fire haptic vibration on mobile — silently no-ops on desktop */
  const vibrate = useCallback((pattern: number | number[]) => {
    try { navigator.vibrate?.(pattern); } catch { /* not supported */ }
  }, []);

  const playWakeSound = useCallback(() => {
    // #44: Reuse the shared AudioContext — creating a new one per wake-word leaks browser
    // audio handles and eventually exhausts the limit (~6 contexts on Chrome/Safari).
    try {
      if (!audioContextRef.current) {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioContextRef.current = new Ctor();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
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

  const handleError = useCallback((msg: string, detail?: ErrorDetail, onRetry?: () => void) => {
    setErrorDetail(detail ?? null);
    toast({
      variant: 'destructive',
      title: 'Something went wrong',
      description: (
        <span className="flex items-center gap-2">
          <span className="flex-1">{msg}</span>
          <span className="flex items-center gap-1 flex-shrink-0">
            {detail && (
              <button
                onClick={() => setErrorDetail(detail)}
                className="flex items-center gap-1 px-2 py-0.5 rounded border border-red-400/30 bg-red-400/10 text-red-400 text-[10px] font-mono tracking-wider hover:bg-red-400/20 transition-colors"
              >
                <Bug className="w-2.5 h-2.5" />
                DETAILS
              </button>
            )}
            {onRetry && (
              <button
                onClick={onRetry}
                className="px-2 py-0.5 rounded border border-amber-400/30 bg-amber-400/10 text-amber-400 text-[10px] font-mono tracking-wider hover:bg-amber-400/20 transition-colors"
              >
                RETRY
              </button>
            )}
          </span>
        </span>
      ),
      duration: 8000,
    });
    vibrate([100, 50, 100]);
    setStatus('idle');
  }, [toast, vibrate]);

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
    haptics.light();
    setMessages([]);
    setActiveConversationId(null);
    setSuggestions([]);
    setSubtitle(null);
    setActiveWidget(null);
    chatTimerMsgIdxRef.current = null;
    timerStartedAtRef.current = null;
    timerOriginalDurationRef.current = null;
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

            // Use Web Audio API for stutter-free playback on Android.
            // decodeAudioData fully decodes the buffer into memory before
            // playback starts, so there's no gap/choppiness on any browser.
            // The pre-unlocked Audio element (iosUnlockedAudioRef) is kept
            // solely for the iOS gesture unlock at the top of this flow.
            const ctx = audioContextRef.current;
            if (!ctx) { handleError("Audio not ready"); URL.revokeObjectURL(url); onDone(); return; }

            void ctx.resume();
            fetch(url)
              .then(r => r.arrayBuffer())
              .then(buf => ctx.decodeAudioData(buf))
              .then(decoded => {
                URL.revokeObjectURL(url);
                const source = ctx.createBufferSource();
                source.buffer = decoded;
                source.connect(ctx.destination);

                source.onended = () => {
                  activeAudioRef.current = null;
                  onDone();
                };
                // MUST set onended BEFORE start(0) — on some browsers the
                // callback won't fire if registered after playback begins.
                activeAudioRef.current = {
                  stop: () => { try { source.stop(); } catch {} },
                } as any;

                onStart();
                source.start(0);
              })
              .catch(() => { URL.revokeObjectURL(url); handleError("Audio playback failed"); });
          } catch { handleError("Failed to decode audio"); }
        },
        onError: (err) => {
          // Surface TTS failures instead of silently returning to idle — a
          // missing/invalid ElevenLabs key otherwise looks like "voice mode
          // errors when I talk".
          const detail = (err as any)?.error?.detail as ErrorDetail | undefined;
          handleError(
            (err as any)?.error?.error || 'Speech synthesis failed. Check your ElevenLabs API key.',
            detail,
          );
          onDone();
        },
      }
    );
  }, [synthesizeSpeech, handleError, iosUnlockedAudioRef]);

  const processUserText = useCallback(async (userText: string, file?: AttachedFile | null, speak = true) => {
    // Optimistically add message (with file preview if any)
    setMessages(prev => [...prev, { role: 'user', content: userText, file: file ?? undefined, timestamp: Date.now() }]);
    setSuggestions([]);
    setStatus('thinking');
    vibrate(20);
    requestStartRef.current = Date.now();

    try {
      const body: Record<string, string> = { userMessage: userText };
      if (activeConvIdRef.current) body.conversationId = activeConvIdRef.current;
      if (file) { body.fileBase64 = file.base64; body.fileMimeType = file.mimeType; }
      // Include screen share frame as image for AI to see (don't overwrite manual file)
      if (screenShareActive && screenFrame && !file) {
        const base64 = screenFrame.split(',')[1] || screenFrame;
        if (base64.length > 100) {
          body.fileBase64 = base64;
          body.fileMimeType = 'image/jpeg';
        }
      }
      if (webSearchEnabled) body.webSearchEnabled = 'true';
      body.responseStyle = isChatMode ? 'chat' : 'voice';

      const res = await fetch('/api/jarvis/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        try {
          const errBody = await res.json();
          handleError(errBody?.error || `Server error (${res.status})`, errBody?.detail, () => processUserTextRef.current?.(userText, file, speak));
        } catch {
          handleError(`Server error (${res.status})`, undefined, () => processUserTextRef.current?.(userText, file, speak));
        }
        return;
      }

      // ── SSE stream consumption ──────────────────────────────────
      const reader = res.body?.getReader();
      if (!reader) { handleError('No response stream'); return; }

      const decoder = new TextDecoder();
      let streamBuffer = '';
      let jarvisText = '';
      let convId = activeConvIdRef.current ?? '';
      let newSuggestions: string[] = [];
      let widget: Widget | null = null;

      // Add an empty assistant message that we'll update as tokens arrive
      setMessages(prev => [...prev, { role: 'assistant', content: '', timestamp: Date.now() }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        streamBuffer += decoder.decode(value, { stream: true });

        // Process complete SSE lines
        const lines = streamBuffer.split('\n');
        streamBuffer = lines.pop() ?? ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            switch (parsed.type) {
              case 'token':
                // Track time-to-first-token for connection quality
                if (requestStartRef.current > 0) {
                  const ttft = Date.now() - requestStartRef.current;
                  requestStartRef.current = 0; // only measure once
                  const samples = latencySamplesRef.current;
                  samples.push(ttft);
                  if (samples.length > 5) samples.shift(); // keep last 5
                  // Compute average of last 3
                  const last3 = samples.slice(-3);
                  setLatencyMs(last3.reduce((a, b) => a + b, 0) / last3.length);
                }
                jarvisText += parsed.content;
                // Update the last message (assistant) with accumulated text
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { ...updated[updated.length - 1], content: jarvisText };
                  return updated;
                });
                break;
              case 'done':
                convId = parsed.conversationId ?? convId;
                break;
              case 'suggestions':
                newSuggestions = parsed.suggestions ?? [];
                break;
              case 'widget':
                widget = parsed.widget ?? null;
                break;
              case 'agent_browser_detected':
                // Auto-open PiP browser and kick off the autonomous agent loop
                setPipBrowserOpen(true);
                setPipFullscreen(null);
                setMessages(prev => prev.slice(0, -1)); // remove empty assistant msg
                // Start the vision-driven agent loop (it navigates + clicks itself)
                setAgentGoal(parsed.searchQuery ? `search for ${parsed.searchQuery}` : 'search the web');
                break;
              case 'screen_share_detected':
                // Show screen share confirmation card
                setMessages(prev => {
                  const withoutEmpty = prev.slice(0, -1);
                  return [...withoutEmpty, {
                    role: 'assistant' as const,
                    content: '',
                    timestamp: Date.now(),
                    pendingScreenShare: true,
                  }];
                });
                // If in voice mode, switch to chat so card is visible
                if (mode === 'voice') setMode('chat');
                break;
              case 'image_request_detected':
                // If in voice mode, switch to chat mode so the confirmation card is visible
                if (mode === 'voice') setMode('chat');
                // Show image generation confirmation card — embed it in the message list
                setMessages(prev => {
                  const withoutEmpty = prev.slice(0, -1); // remove the empty assistant message
                  return [...withoutEmpty, {
                    role: 'assistant' as const,
                    content: '',
                    timestamp: Date.now(),
                    pendingImage: {
                      imagePrompt: parsed.imagePrompt,
                      confirmationMessage: parsed.confirmationMessage,
                    },
                  }];
                });
                break;
              case 'error':
                handleError(parsed.message ?? 'Stream error');
                return;
            }
          } catch { /* skip malformed lines */ }
        }
      }

      if (!activeConvIdRef.current && convId) setActiveConversationId(convId);
      refreshSidebar();

      // Apply widget and suggestions after stream completes
      if (widget) {
        if (widget.type === 'timer' && isChatMode) {
          setMessages(prev => {
            const existingIdx = chatTimerMsgIdxRef.current;
            if (widget.timerAction === 'cancel') {
              chatTimerMsgIdxRef.current = null;
              timerStartedAtRef.current = null;
              timerOriginalDurationRef.current = null;
              if (existingIdx !== null && existingIdx < prev.length) {
                const copy = [...prev];
                copy[existingIdx] = { ...copy[existingIdx], widget: undefined };
                return copy;
              }
              return prev;
            } else if (existingIdx !== null && existingIdx < prev.length) {
              let newDuration = widget.durationSeconds;
              if (widget.timerAction === 'add' && widget.deltaSeconds) {
                const elapsed = timerStartedAtRef.current
                  ? Math.floor((Date.now() - timerStartedAtRef.current) / 1000) : 0;
                const currentRemaining = Math.max(0, (timerOriginalDurationRef.current ?? 0) - elapsed);
                newDuration = currentRemaining + widget.deltaSeconds;
              }
              timerStartedAtRef.current = Date.now();
              timerOriginalDurationRef.current = newDuration;
              const copy = [...prev];
              copy[existingIdx] = { ...copy[existingIdx], widget: { ...widget, durationSeconds: newDuration, timerAction: 'set' } };
              return copy;
            } else {
              chatTimerMsgIdxRef.current = prev.length - 1;
              timerStartedAtRef.current = Date.now();
              timerOriginalDurationRef.current = widget.durationSeconds;
              const copy = [...prev];
              copy[copy.length - 1] = { ...copy[copy.length - 1], widget };
              return copy;
            }
          });
        } else {
          setMessages(prev => {
            const copy = [...prev];
            copy[copy.length - 1] = { ...copy[copy.length - 1], widget: widget! };
            return copy;
          });
          setActiveWidget(widget);
        }
      }
      setSuggestions(newSuggestions);

      // In chat mode, only speak if the request came from the mic (speak=true).
      if (speak) {
        playTTS(jarvisText, () => { vibrate([20, 30, 20]); setStatus('speaking'); }, () => {
          setStatus('idle');
          if (isChatMode) setTimeout(() => inputRef.current?.focus(), 50);
        });
      } else {
        setStatus('idle');
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    } catch (err) {
      const msg = err instanceof TypeError ? 'Network error — is the server running?' : 'Request failed';
      handleError(msg, undefined, () => processUserTextRef.current?.(userText, file, speak));
    }
  }, [handleError, refreshSidebar, playTTS, isChatMode, webSearchEnabled, activateCommand, vibrate]);

  const handleToggleRecording = useCallback(() => {
    unlockAudioForIOS(); // must be called synchronously from user gesture for iOS Safari
    vibrate(30);
    if (status === 'speaking') {
      activeAudioRef.current?.stop?.();
      activeAudioRef.current = null;
      // Barge-in: stop TTS and immediately start recording
      setStatus('recording');
      if (isChatMode) {
        // In chat mode, start chat mic recording for barge-in
        unlockAudioForIOS();
        vibrate([30, 50, 30]);
        startChatRecording();
      } else {
        activateCommand(true); // user gesture — safe on iOS, starts listening immediately
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
    haptics.medium();
    unlockAudioForIOS(); // must be called synchronously from user gesture for iOS Safari
    const file = attachedFile;
    setChatInput('');
    setAttachedFile(null);

    // Agent mode: open browser PiP and start the autonomous agent loop
    if (agentModeActive) {
      setPipBrowserOpen(true);
      setPipFullscreen(null);
      setMessages(prev => [...prev, { role: 'user', content: text, timestamp: Date.now() }, { role: 'assistant', content: `Agent mode — searching for "${text}"...`, timestamp: Date.now() }]);
      setAgentGoal(`search for ${text}`);
      return;
    }

    // Keyboard submit: no TTS. Only mic-sourced messages speak in chat mode.
    processUserText(text || `📎 ${file?.fileName ?? 'File'}`, file, false);
  };

  const handleSuggestionClick = useCallback((text: string) => {
    haptics.light();
    setSuggestions([]);
    // Suggestions in chat mode don't speak; in voice mode they do (speak defaults to true).
    processUserText(text, null, !isChatMode);
  }, [processUserText, isChatMode]);

  // ── Image generation ────────────────────────────────────────────

  const handleImageCancel = useCallback(() => {
    setMessages(prev => prev.filter(m => !m.pendingImage));
    setStatus('idle');
  }, []);

  const handleGenerateImage = useCallback(async (prompt: string) => {
    setMessages(prev => prev.filter(m => !m.pendingImage));
    setGeneratingImage(true);
    setGeneratingImagePrompt(prompt);
    setStatus('thinking');

    // Add a user message about the image request
    setMessages(prev => [...prev, { role: 'user', content: prompt, timestamp: Date.now() }]);

    try {
      const res = await fetch('/api/jarvis/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        handleError(errBody?.error || `Image generation failed (${res.status})`, errBody?.detail);
        return;
      }

      const data = await res.json();
      // Add the generated image as an assistant message
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Here's your image of: ${prompt}`,
        image: data.image,
        timestamp: Date.now(),
      }]);
    } catch (err) {
      const msg = err instanceof TypeError ? 'Network error — is the server running?' : 'Image generation failed';
      handleError(msg);
    } finally {
      setGeneratingImage(false);
      setGeneratingImagePrompt('');
      setStatus('idle');
      refreshSidebar();
    }
  }, [handleError, refreshSidebar]);

  const handleImageConfirm = useCallback((prompt: string) => {
    handleGenerateImage(prompt);
  }, [handleGenerateImage]);

  // ── Screen sharing ────────────────────────────────────────────

  const handleToggleScreenShare = useCallback(async () => {
    if (screenShareActive) {
      stopScreenShare();
      setScreenShareActive(false);
      toast({ title: 'Screen sharing stopped' });
    } else {
      try {
        await startScreenShare();
        setScreenShareActive(true);
        toast({ title: 'Screen sharing started', description: 'Jarvis can now see your screen' });
      } catch {
        setScreenShareActive(false);
        toast({ variant: 'destructive', title: 'Screen sharing failed' });
      }
    }
  }, [screenShareActive, startScreenShare, stopScreenShare, toast]);

  const [chatRecording, setChatRecording] = useState(false);
  const [chatInterim, setChatInterim] = useState('');
  // Ref so the transcript callback can call processUserText without stale closure
  const processUserTextRef = useRef<typeof processUserText | null>(null);
  useEffect(() => { processUserTextRef.current = processUserText; }, [processUserText]);

  // Auto-grow/shrink the chat textarea when input changes
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [chatInput]);

  // Barge-in recognizer — orb tap while Jarvis is speaking in chat mode:
  // auto-submit + speak back (kept separate from the input-bar dictation).
  const { start: startChatRecording, stop: stopChatRecording } = useSpeechRecognition({
    onTranscript: (text) => {
      setChatRecording(false);
      if (!text.trim()) return;
      unlockAudioForIOS();
      processUserTextRef.current?.(text.trim(), null, true);
    },
    onError: (msg) => { toast({ title: 'Voice input failed', description: msg }); setChatRecording(false); },
    onEnd: () => setChatRecording(false),
  });

  // In-chat dictation recognizer — Whisper transcribes into the input box and
  // STAYS in chat mode. Continuous + interim: it keeps listening until the user
  // taps the square stop button; nothing is auto-submitted while talking.
  const { start: startChatDictation, stop: stopChatDictation } = useSpeechRecognition({
    continuous: true,
    interimResults: true,
    onTranscript: (text) => {
      if (!text.trim()) return;
      setChatInput(prev => prev ? `${prev.trimEnd()} ${text.trim()}` : text.trim());
      setChatInterim('');
    },
    onInterim: (text) => setChatInterim(text),
    onError: (msg) => { toast({ title: 'Voice input failed', description: msg }); setChatDictating(false); setChatInterim(''); },
    onEnd: () => { setChatDictating(false); setChatInterim(''); },
  });

  /** In-chat dictation toggle — mic button beside the input. While active it
      becomes a square button; tap it to stop recording. Stays in chat mode. */
  const [chatDictating, setChatDictating] = useState(false);
  const handleChatMicToggle = () => {
    if (chatDictating) {
      haptics.light();
      stopChatDictation();
      setChatDictating(false);
      setChatInterim('');
      return;
    }
    if (!isSpeechRecognitionSupported()) {
      toast({ title: 'Voice input unavailable', description: 'Speech recognition needs Chrome or Edge.' });
      return;
    }
    haptics.heavy();
    unlockAudioForIOS(); // must run synchronously from the user gesture (iOS)
    setChatDictating(true);
    setChatInterim('');
    startChatDictation();
  };

  /** The blue circular waveform button — opens the full-screen voice assistant. */
  const handleOpenVoiceMode = () => {
    haptics.heavy();
    setMode('voice');
  };

  const handleStopSpeaking = () => {
    haptics.light();
    activeAudioRef.current?.stop?.();
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
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K / Cmd+K → focus chat input
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (isChatMode) {
          inputRef.current?.focus();
        } else {
          setMode('chat');
          setTimeout(() => inputRef.current?.focus(), 100);
        }
        return;
      }
      // Spacebar for voice mode PTT
      if (isChatMode) return;
      if (e.code !== 'Space' || e.repeat) return;
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      e.preventDefault();
      if (status === 'idle' || status === 'wake' || status === 'recording' || status === 'speaking') handleToggleRecording();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, isChatMode, handleToggleRecording]);

  /** Regenerate the assistant's response from a given message index */
  const handleRegenerate = useCallback((messageIndex: number) => {
    // Find the last user message before this assistant message
    const msg = messages[messageIndex];
    if (!msg || msg.role !== 'assistant') return;
    // Walk backwards to find the user message that triggered this response
    let userText = '';
    for (let i = messageIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { userText = messages[i].content; break; }
    }
    if (!userText) return;
    // Remove everything from the assistant message onward
    setMessages(prev => prev.slice(0, messageIndex));
    // Re-send
    processUserText(userText, null, false);
  }, [messages, processUserText]);

  /** Edit a user message and re-send from that point */
  const handleEditMessage = useCallback((messageIndex: number, newContent: string) => {
    const msg = messages[messageIndex];
    if (!msg || msg.role !== 'user') return;
    if (newContent === msg.content) return; // no change
    // Trim history to before this message, then re-send with edited text
    setMessages(prev => prev.slice(0, messageIndex));
    processUserText(newContent, null, false);
  }, [messages, processUserText]);

  const isBusy = status === 'thinking' || status === 'transcribing';

  const statusLabels: Record<AppState, string> = {
    idle: t('voice.status.idle'),
    wake: t('voice.status.wake'),
    recording: t('voice.status.recording'),
    transcribing: t('voice.status.transcribing'),
    thinking: t('voice.status.thinking'),
    speaking: t('voice.status.speaking'),
  };


  return (
    <div className={`${resolved} h-dvh bg-background text-foreground flex flex-col overflow-hidden`}>

      {/* ── Header: Apple-style translucent toolbar ── */}
      {/* Hidden in voice mode — the orb view takes the full screen. */}
      <header className={`glass-toolbar px-4 py-3 flex items-center gap-3 border-b border-border/50 relative z-50 flex-shrink-0 ${mode === 'voice' ? 'hidden' : ''}`}>
        <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
          {/* Mobile hamburger — ChatGPT-style circular button with red badge */}
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="relative lg:hidden w-9 h-9 rounded-full bg-white dark:bg-[#1c1c1e] border border-black/10 dark:border-white/15 text-foreground flex items-center justify-center shadow-sm transition-all hover:bg-secondary/70 active:scale-95"
            aria-label="Open history"
          >
            <Menu className="w-[18px] h-[18px]" />
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-semibold flex items-center justify-center border border-white/80 leading-none">1</span>
          </button>
          {/* Logo and title */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #007AFF, #5856D6)' }}
            >
              <span className="text-white text-[9px] font-bold tracking-wider">J</span>
            </div>
            <h1 className="font-sans font-semibold text-base tracking-tight whitespace-nowrap">Jarvis</h1>
            {/* Connection quality */}
            {latencyMs !== null && (
              <span className={`hidden sm:inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full ${
                latencyMs < 1500 ? 'text-green-600 dark:text-green-400 bg-green-500/8' :
                latencyMs < 3500 ? 'text-yellow-600 dark:text-yellow-400 bg-yellow-500/8' :
                'text-red-600 dark:text-red-400 bg-red-500/8'
              }`}>
                <span className={`w-1 h-1 rounded-full ${
                  latencyMs < 1500 ? 'bg-green-500' :
                  latencyMs < 3500 ? 'bg-yellow-500' :
                  'bg-red-500'
                }`} />
                {latencyMs < 1000 ? '<1s' : `${Math.round(latencyMs / 100) / 10}s`}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {/* Mode picker — Apple segmented control style */}
          <div
            className="flex items-center p-0.5 rounded-lg"
            style={{ background: 'hsl(var(--secondary))' }}
          >
            {([
              { id: 'chat' as const, label: t('header.mode.chat'), icon: MessageSquare },
              { id: 'camera' as const, label: t('header.mode.camera'), icon: Webcam },
            ]).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => { haptics.light(); setMode(id); }}
                className={`relative flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-[7px] text-[11px] font-medium transition-all duration-200 ${
                  mode === id
                    ? 'bg-white dark:bg-[#1a1a2e] text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {mode === id && (
                  <motion.div
                    layoutId="mode-pill"
                    className="absolute inset-0 rounded-[7px] bg-white dark:bg-[#1a1a2e] shadow-sm"
                    transition={{ type: 'spring', bounce: 0, duration: 0.25 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                </span>
              </button>
            ))}
          </div>

          {/* Personality button — hidden on small screens to keep the header uncluttered */}
          <div className="relative hidden sm:block">
            <button
              onClick={() => setPersonalityMenuOpen(o => !o)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-all"
              aria-label="Change personality"
            >
              {personality === 'auto' && <Sparkles className="w-4 h-4" />}
              {personality === 'balanced' && <MessageCircle className="w-4 h-4" />}
              {personality === 'talkative' && <Sparkles className="w-4 h-4" />}
              {personality === 'helpful' && <Briefcase className="w-4 h-4" />}
              {personality === 'concise' && <Zap className="w-4 h-4" />}
              {personality === 'custom' && <SlidersHorizontal className="w-4 h-4" />}
            </button>

            {personalityMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setPersonalityMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 z-50 min-w-[12rem] p-1.5 rounded-xl border border-border/60 bg-card shadow-apple-xl overflow-hidden">
                  {[
                    { value: 'auto', label: 'Auto (AI decides)', icon: Sparkles },
                    { value: 'balanced', label: 'Balanced', icon: MessageCircle },
                    { value: 'talkative', label: 'Talkative', icon: Sparkles },
                    { value: 'helpful', label: 'Helpful', icon: Briefcase },
                    { value: 'concise', label: 'Just gets it done', icon: Zap },
                    { value: 'custom', label: 'Custom', icon: SlidersHorizontal },
                  ].map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => handleSetPersonality(value)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] font-medium transition-colors ${
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
                <div className="absolute right-0 top-full mt-2 z-50 w-72 p-4 rounded-xl border border-border/60 bg-card shadow-apple-xl space-y-3">
                  <p className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Custom Personality</p>
                  <textarea
                    value={customPrompt}
                    onChange={e => setCustomPrompt(e.target.value)}
                    placeholder="Describe how you want Jarvis to behave…"
                    className="w-full h-28 bg-background border border-border text-foreground placeholder:text-muted-foreground/40 font-mono text-[11px] px-3 py-2 rounded-lg outline-none focus:border-primary/50 resize-none"
                  />
                  <button
                    onClick={handleSaveCustomPrompt}
                    className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90 transition-opacity"
                  >
                    Save
                  </button>
                </div>
              </>
            )}
          </div>

          <button onClick={() => { haptics.light(); toggleTheme(); }} title={resolved === 'dark' ? t('header.lightMode') : t('header.darkMode')}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-all">
            {resolved === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button onClick={() => { haptics.light(); setSettingsOpen(true); }} title={t('header.settings')}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-all">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar hidden in voice mode — full screen orb experience */}
        {mode !== 'voice' && (
          <ChatSidebar
            activeId={activeConversationId}
            onSelect={loadConversation}
            onNew={handleNewChat}
            refreshTick={sidebarRefreshTick}
            mobileOpen={mobileSidebarOpen}
            onMobileClose={() => setMobileSidebarOpen(false)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}

        <main className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">

          {/* ── CAMERA MODE — full-screen object detection ── */}
          {mode === 'camera' && (
            <div className="flex-1 flex flex-col min-h-0 relative">
              <div className="flex-1 min-h-0 p-4 sm:p-8 flex flex-col">
                <div className="liquid-glass-soft rounded-2xl overflow-hidden flex-1 min-h-0 relative">
                  <CameraFeed className="h-full" enableDetection />
                </div>
                <p className="text-center text-xs text-muted-foreground mt-3">
                  {t('header.mode.camera')} — object detection runs 100% in your browser
                </p>
              </div>
            </div>
          )}

          {/* ── VOICE MODE — full screen ── */}
          {mode === 'voice' && (
            <div className="flex-1 flex flex-col min-h-0 relative">
              {/* Back to chat — header is hidden in voice mode */}
              <button
                onClick={() => { haptics.light(); setMode('chat'); }}
                className="absolute top-3 left-3 z-30 w-9 h-9 rounded-full bg-white dark:bg-[#1c1c1e] border border-black/10 dark:border-white/15 text-foreground flex items-center justify-center shadow-sm hover:bg-secondary/70 active:scale-95 transition-all"
                aria-label={t('voice.backToChat')}
                title={t('voice.backToChat')}
              >
                <MessageSquare className="w-[18px] h-[18px]" />
              </button>
              {/* Ambient liquid-gradient blobs — iOS 26 liquid feel.
                  STATIC radial gradients (no blur filter, no animation) so the
                  paint cost is zero — soft falloff comes from the gradient. */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
                <div
                  className="absolute -top-24 -left-24 w-[28rem] h-[28rem] rounded-full opacity-25"
                  style={{ background: 'radial-gradient(circle at 35% 35%, rgba(0,122,255,0.55), transparent 70%)' }}
                />
                <div
                  className="absolute -bottom-32 -right-24 w-[30rem] h-[30rem] rounded-full opacity-20"
                  style={{ background: 'radial-gradient(circle at 60% 40%, rgba(175,82,222,0.55), transparent 70%)' }}
                />
                <div
                  className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[24rem] h-[24rem] rounded-full opacity-15"
                  style={{ background: 'radial-gradient(circle at 50% 50%, rgba(52,199,89,0.4), transparent 70%)' }}
                />
              </div>

              {/* Orb + status */}
              <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 min-h-0">
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

                {/* PiP toggles — agent + browser + camera */}
                <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
                  <button
                    onClick={() => { haptics.light(); setAgentModeActive(a => !a); if (!agentModeActive) setPipBrowserOpen(true); setPipFullscreen(null); }}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                      agentModeActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground/50 hover:text-foreground'
                    }`}
                  >
                    <Bot className="w-3 h-3 inline mr-1" />
                    {agentModeActive ? t('voice.agentOn') : t('voice.agent')}
                  </button>
                  <button
                    onClick={() => { haptics.light(); setPipBrowserOpen(b => !b); setPipFullscreen(null); }}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                      pipBrowserOpen ? 'bg-primary/10 text-primary' : 'text-muted-foreground/50 hover:text-foreground'
                    }`}
                  >
                    <Globe className="w-3 h-3 inline mr-1" />
                    {pipBrowserOpen ? t('voice.browserOn') : t('voice.browser')}
                  </button>
                  <button
                    onClick={() => { haptics.light(); setPipCameraOpen(c => !c); setPipFullscreen(null); }}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                      pipCameraOpen ? 'bg-primary/10 text-primary' : 'text-muted-foreground/50 hover:text-foreground'
                    }`}
                  >
                    <Webcam className="w-3 h-3 inline mr-1" />
                    {pipCameraOpen ? t('voice.camOn') : t('voice.cam')}
                  </button>
                </div>
                <div className="mt-6 text-center space-y-2">
                  <AnimatePresence mode="wait">
                    <motion.h2
                      key={status}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2 }}
                      className={`text-lg font-semibold tracking-tight ${
                        status === 'recording' ? 'text-red-500 dark:text-red-400' :
                        status === 'speaking' ? 'text-green-500 dark:text-green-400' :
                        status === 'thinking' || status === 'transcribing' ? 'text-amber-500 dark:text-amber-400' :
                        'text-foreground'
                      }`}
                    >
                      {statusLabels[status]}
                    </motion.h2>
                  </AnimatePresence>
                  {status === 'speaking' && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      onClick={handleStopSpeaking}
                      className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/60 text-foreground/70 hover:bg-secondary/80 transition-colors text-xs font-medium">
                      <Square className="w-3 h-3 fill-current" /> Stop
                    </motion.button>
                  )}
                </div>
              </div>

              {/* Widget panel OR conversation history — pinned to bottom */}
              <div className="flex-shrink-0 px-4 sm:px-6 pb-4 sm:pb-8 pt-2 max-w-2xl w-full mx-auto">
                {activeWidget && activeWidget.type !== 'alarm' && activeWidget.type !== 'timer' ? (
                  <div className="overflow-y-auto max-h-[40vh] sm:max-h-[55vh]">
                    {activeWidget.type === 'clock'    && <ClockWidget {...activeWidget} onClose={() => setActiveWidget(null)} />}
                    {activeWidget.type === 'weather'  && <WeatherWidget {...activeWidget} onClose={() => setActiveWidget(null)} />}
                    {activeWidget.type === 'calendar' && <CalendarWidget {...activeWidget} onClose={() => setActiveWidget(null)} />}
                  </div>
                ) : messages.length > 0 ? (
                  /* Compact conversation history strip */
                  <div className="max-h-[40vh] overflow-y-auto space-y-2 scrollbar-thin px-2">
                    {messages.slice(-8).map((msg, i) => (
                      <motion.div
                        key={messages.length - 8 + i}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className={`flex items-start gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`max-w-[85%] px-3 py-1.5 rounded-2xl text-sm leading-snug font-sans ${
                          msg.role === 'user'
                            ? 'bg-primary/20 text-foreground rounded-tr-sm'
                            : 'bg-card/60 border border-border/30 text-foreground/90 rounded-tl-sm'
                        }`}>
                          <p className="text-[10px] font-mono tracking-widest text-muted-foreground/50 mb-0.5">
                            {msg.role === 'user' ? 'YOU' : 'JARVIS'}
                          </p>
                          <p className="text-[13px] leading-relaxed line-clamp-3">
                            {msg.content}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2 min-h-[5rem]">
                    {subtitle?.user && (
                      <p className="text-center text-sm text-muted-foreground/70 leading-snug">
                        <span className="text-[10px] tracking-widest text-muted-foreground/40 block mb-0.5">YOU</span>
                        {subtitle.user}
                      </p>
                    )}
                    {subtitle?.jarvis && (
                      <p className="text-center text-sm text-primary/80 leading-snug">
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
          {mode === 'chat' && (
            <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
              {/* Orb panel */}
              <div className="hidden lg:flex flex-shrink-0 lg:w-72 xl:w-80 flex-col items-center justify-center p-6 border-r border-border/30 relative overflow-y-auto">
                {activeWidget?.type === 'alarm' && (
                  <div className="mb-3 flex flex-col items-center gap-1">
                    <AlarmClock className="w-5 h-5 text-primary/70" />
                    <AlarmWidget {...activeWidget} compact onClose={() => setActiveWidget(null)} />
                  </div>
                )}
                <Orb status={status} />
                <div className="mt-6 text-center space-y-2">
                  <h2 className="text-base font-semibold tracking-tight text-foreground">
                    {statusLabels[status]}
                  </h2>
                </div>
                {activeWidget && activeWidget.type !== 'alarm' && (
                  <div className="mt-4 w-full space-y-3">
                    {activeWidget.type === 'clock'    && <ClockWidget {...activeWidget} onClose={() => setActiveWidget(null)} />}
                    {activeWidget.type === 'weather'  && <WeatherWidget {...activeWidget} onClose={() => setActiveWidget(null)} />}
                    {activeWidget.type === 'timer'    && <TimerWidget {...activeWidget} onClose={() => setActiveWidget(null)} />}
                    {activeWidget.type === 'calendar' && <CalendarWidget {...activeWidget} onClose={() => setActiveWidget(null)} />}
                  </div>
                )}

                {/* PiP toggles — agent + browser + camera */}
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => { setAgentModeActive(a => !a); if (!agentModeActive) setPipBrowserOpen(true); setPipFullscreen(null); }}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                      agentModeActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground/50 hover:text-foreground'
                    }`}
                  >
                    <Bot className="w-3 h-3 inline mr-1" />
                    {agentModeActive ? t('voice.agentOn') : t('voice.agent')}
                  </button>
                  <button
                    onClick={() => { setPipBrowserOpen(b => !b); setPipFullscreen(null); }}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                      pipBrowserOpen ? 'bg-primary/10 text-primary' : 'text-muted-foreground/50 hover:text-foreground'
                    }`}
                  >
                    <Globe className="w-3 h-3 inline mr-1" />
                    {pipBrowserOpen ? t('voice.browserOn') : t('voice.browser')}
                  </button>
                  <button
                    onClick={() => { setPipCameraOpen(c => !c); setPipFullscreen(null); }}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                      pipCameraOpen ? 'bg-primary/10 text-primary' : 'text-muted-foreground/50 hover:text-foreground'
                    }`}
                  >
                    <Webcam className="w-3 h-3 inline mr-1" />
                    {pipCameraOpen ? 'Cam On' : 'Cam'}
                  </button>
                </div>
              </div>

              {/* Chat area */}
              <div className="flex-1 flex flex-col h-full min-h-0 bg-card/5">

                {/* Mobile-only widget strip (orb panel is hidden on mobile) */}
                {activeWidget && (
                  <div className="lg:hidden flex-shrink-0 px-3 pt-2 pb-1 border-b border-border/20">
                    {activeWidget.type === 'timer'    && <TimerWidget {...activeWidget} compact onClose={() => setActiveWidget(null)} />}
                    {activeWidget.type === 'alarm'    && <AlarmWidget {...activeWidget} compact onClose={() => setActiveWidget(null)} />}
                    {activeWidget.type === 'clock'    && <ClockWidget {...activeWidget} onClose={() => setActiveWidget(null)} />}
                    {activeWidget.type === 'weather'  && <WeatherWidget {...activeWidget} onClose={() => setActiveWidget(null)} />}
                    {activeWidget.type === 'calendar' && <CalendarWidget {...activeWidget} onClose={() => setActiveWidget(null)} />}
                  </div>
                )}

                <ConversationFeed
                  messages={messages}
                  isThinking={status === 'thinking'}
                  suggestions={suggestions}
                  onSuggestionClick={handleSuggestionClick}
                  onRegenerate={handleRegenerate}
                  onEditMessage={handleEditMessage}
                  onImageConfirm={(prompt) => {
                    // Remove pending image messages and generate
                    setMessages(prev => prev.filter(m => !m.pendingImage));
                    handleGenerateImage(prompt);
                  }}
                  onImageCancel={() => {
                    // Remove pending image messages
                    setMessages(prev => prev.filter(m => !m.pendingImage));
                    setStatus('idle');
                  }}
                  generatingImage={generatingImage}
                  generatingImagePrompt={generatingImagePrompt}
                  onScreenShareConfirm={() => {
                    setMessages(prev => prev.filter(m => !m.pendingScreenShare));
                    handleToggleScreenShare();
                  }}
                  onScreenShareCancel={() => {
                    setMessages(prev => prev.filter(m => !m.pendingScreenShare));
                    setStatus('idle');
                  }}
                  onAgentBrowserConfirm={(query) => {
                    setMessages(prev => prev.filter(m => !m.pendingAgentBrowser));
                    setPipBrowserOpen(true);
                    setPipFullscreen(null);
                    // Start the autonomous agent loop with the confirmed query
                    setAgentGoal(`search for ${query}`);
                  }}
                  onAgentBrowserCancel={() => {
                    setMessages(prev => prev.filter(m => !m.pendingAgentBrowser));
                    setStatus('idle');
                  }}
                />

                {/* Input bar — #21: padding-bottom accounts for Safari's home indicator / safe area */}
                <div
                  className={`border-t border-border/30 bg-background/90 backdrop-blur-md px-4 pt-3 flex-shrink-0 space-y-2 relative ${dragOver ? 'border-primary/50' : ''}`}
                  style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={e => { e.preventDefault(); setDragOver(false); }}
                  onDrop={async e => {
                    e.preventDefault();
                    setDragOver(false);
                    const file = e.dataTransfer.files?.[0];
                    if (!file) return;
                    setUploadProgress(0);
                    try {
                      // Simulate progress during file read
                      const progressInterval = setInterval(() => {
                        setUploadProgress(p => Math.min(95, (p ?? 0) + Math.random() * 15));
                      }, 200);
                      const result = await readFile(file);
                      clearInterval(progressInterval);
                      setUploadProgress(100);
                      setTimeout(() => setUploadProgress(null), 500);
                      if (attachedFile?.preview) URL.revokeObjectURL(attachedFile.preview);
                      setAttachedFile(result);
                      toast({ title: t('input.fileAttached'), description: file.name });
                    } catch {
                      setUploadProgress(null);
                      toast({ title: t('input.couldNotRead'), variant: 'destructive' });
                    }
                  }}
                >
                  {/* Drag-over overlay */}
                  <AnimatePresence>
                    {dragOver && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-20 rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 flex items-center justify-center pointer-events-none"
                      >
                        <p className="font-display text-sm tracking-widest text-primary/70">{t('input.dropHere')}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {/* Upload progress bar */}
                  <AnimatePresence>
                    {uploadProgress !== null && (
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="h-1 bg-card rounded-full overflow-hidden"
                      >
                        <motion.div
                          className="h-full bg-primary rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${uploadProgress}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
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
                  <div className="flex items-center gap-1 px-2 py-1.5 rounded-full border border-border/50 bg-card shadow-md">
                    {/* Hidden file inputs */}
                    <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
                    <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileSelect} />

                    {/* + menu button */}
                    <div className="relative flex-shrink-0" ref={plusButtonRef}>
                      <button
                        id="plus-menu-button"
                        onClick={() => plusMenuOpen ? closePlusMenu() : openPlusMenu()}
                        disabled={isBusy}
                        title="Attach, camera, or search"
                        className={`p-2 rounded-full transition-all disabled:opacity-30 ${
                          attachedFile || webSearchEnabled
                            ? 'text-primary bg-primary/10'
                            : 'text-foreground/70 hover:text-foreground hover:bg-secondary/70'
                        }`}
                      >
                        <Plus className="w-[18px] h-[18px]" strokeWidth={2} />
                      </button>
                    </div>

                    <div className="relative flex-1 min-w-0">
                      <textarea ref={e => { inputRef.current = e; textareaRef.current = e; }} value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSubmit(); }
                          if (e.key === 'Escape' && chatInput) { setChatInput(''); e.preventDefault(); }
                          if (e.key === 'ArrowUp' && !chatInput && messages.length > 0) {
                            // Find last user message for quick edit
                            const lastUserIdx = [...messages].reverse().findIndex(m => m.role === 'user');
                            if (lastUserIdx >= 0) {
                              const realIdx = messages.length - 1 - lastUserIdx;
                              const lastUserMsg = messages[realIdx].content;
                              if (lastUserMsg) {
                                setChatInput(lastUserMsg);
                                e.preventDefault();
                              }
                            }
                          }
                        }}
                        onPaste={handleInputPaste}
                        rows={1}
                        placeholder={
                          chatDictating
                            ? (chatInterim || t('input.listening'))
                            : isBusy ? t('input.processing')
                            : attachedFile ? t('input.placeholderFile')
                            : t('input.placeholder')
                        }
                        disabled={isBusy}
                        className="w-full bg-transparent text-foreground placeholder:text-muted-foreground/60 font-sans text-[15px] px-2 py-2.5 outline-none resize-none min-h-[24px] max-h-[140px]"
                      />
                      {/* Character count */}
                      {chatInput.length > 0 && (
                        <span className="absolute bottom-1.5 right-3 text-[9px] font-mono text-muted-foreground/30 pointer-events-none">
                          {chatInput.length}
                        </span>
                      )}
                    </div>
                    <button onClick={handleChatMicToggle} disabled={isBusy}
                      title={chatDictating ? t('input.stopDictate') : t('input.dictate')}
                      className={`p-2 rounded-full transition-all flex-shrink-0 disabled:opacity-30 ${
                        chatDictating
                          ? 'text-red-500 bg-red-500/10 animate-pulse'
                          : 'text-foreground/70 hover:text-foreground hover:bg-secondary/70'
                      }`}>
                      {chatDictating ? <Square className="w-[18px] h-[18px] fill-current" /> : <Mic className="w-[18px] h-[18px]" strokeWidth={2} />}
                    </button>
                    {/* Blue circular button — opens full-screen voice mode */}
                    <button onClick={handleOpenVoiceMode} disabled={isBusy}
                      title={t('input.voiceMode')}
                      className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:opacity-90 active:scale-95 transition-all flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed">
                      <AudioWaveform className="w-5 h-5" strokeWidth={2} />
                    </button>
                  </div>

                  {/* Fixed + menu popover — NOT clipped by overflow ancestors */}
                  <AnimatePresence>
                    {plusMenuOpen && !isBusy && plusMenuCoords && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={closePlusMenu} />
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 6, scale: 0.95 }}
                          transition={{ duration: 0.15 }}
                          className="fixed z-50 w-44 p-1 rounded-xl border border-border/50 bg-background shadow-xl overflow-hidden"
                          style={{ bottom: plusMenuCoords.bottom, right: plusMenuCoords.right }}
                        >
                          <button
                            onClick={() => { closePlusMenu(); fileInputRef.current?.click(); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                          >
                            <Paperclip className="w-3.5 h-3.5 flex-shrink-0" />
                            {t('input.attachFile')}
                          </button>
                          <button
                            onClick={() => { closePlusMenu(); cameraInputRef.current?.click(); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                          >
                            <Camera className="w-3.5 h-3.5 flex-shrink-0" />
                            {t('input.camera')}
                          </button>
                          <div className="h-px bg-border/30 my-1" />
                          <button
                            onClick={() => { closePlusMenu(); setTimeout(() => inputRef.current?.focus(), 50); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                          >
                            <ImageIcon className="w-3.5 h-3.5 flex-shrink-0" />
                            {t('input.generateImage')}
                          </button>
                          <button
                            onClick={() => { closePlusMenu(); handleToggleScreenShare(); }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[11px] font-mono transition-colors ${
                              screenShareActive ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                            }`}
                          >
                            <Monitor className="w-3.5 h-3.5 flex-shrink-0" />
                            {screenShareActive ? t('input.stopSharing') : t('input.shareScreen')}
                          </button>
                          <div className="h-px bg-border/30 my-1" />
                          <button
                            onClick={() => { closePlusMenu(); setAgentModeActive(a => !a); }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[11px] font-mono transition-colors ${
                              agentModeActive ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                            }`}
                          >
                            <Bot className="w-3.5 h-3.5 flex-shrink-0" />
                            {agentModeActive ? t('input.agentModeOn') : t('input.agentMode')}
                          </button>
                          <div className="h-px bg-border/30 my-1" />
                          <button
                            onClick={() => { closePlusMenu(); handleToggleWebSearch(); }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[11px] font-mono transition-colors ${
                              webSearchEnabled ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                            }`}
                          >
                            <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                            {t('input.webSearch')} {webSearchEnabled ? '(on)' : '(off)'}
                          </button>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>

                  {/* Agent mode indicator */}
                  {agentModeActive && (
                    <div className="flex items-center gap-1.5 px-1 pb-1">
                      <Bot className="w-3 h-3 text-primary" />
                      <span className="text-[9px] font-mono text-primary/70 tracking-wider">AGENT MODE ON — your message will search the web</span>
                    </div>
                  )}

                  {/* Status bar below input */}
                  <div className="min-h-[16px]">
                    {chatDictating && (
                      <p className="text-[10px] font-mono text-red-400/70 tracking-widest text-center animate-pulse">
                        {t('input.listeningStatus')}
                      </p>
                    )}
                    {status === 'thinking' && !chatDictating && (
                      <p className="text-[10px] font-mono text-yellow-400/60 tracking-widest text-center animate-pulse">
                        {t('input.thinkingStatus')}
                      </p>
                    )}
                    {status === 'speaking' && (
                      <p className="text-[10px] font-mono text-muted-foreground/50 tracking-widest text-center">
                        {t('input.speakingStatus')}
                        <button onClick={handleStopSpeaking} className="text-primary hover:underline">{t('input.stop')}</button>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

        </main>

        {/* ── PiP Floating Windows ── */}
        <AnimatePresence>
          {pipBrowserOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
              className={`fixed z-50 bg-card border border-border/50 rounded-xl shadow-apple-lg overflow-hidden flex flex-col ${
                pipFullscreen === 'browser'
                  ? 'inset-4'
                  : 'bottom-20 right-4 w-80 h-60'
              }`}
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-primary/60" />
                  <span className="text-[10px] font-medium text-muted-foreground">{t('sidebar.navBrowser')}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPipFullscreen(f => f === 'browser' ? null : 'browser')} className="p-1 rounded hover:bg-secondary/80 text-muted-foreground transition-colors">
                    {pipFullscreen === 'browser' ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                  </button>
                  <button onClick={() => { setPipBrowserOpen(false); setPipFullscreen(null); }} className="p-1 rounded hover:bg-secondary/80 text-muted-foreground transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0">
                <JarvisBrowser
                  className="h-full border-0 rounded-b-xl"
                  autoRunGoal={agentGoal}
                  onGoalHandled={() => setAgentGoal(null)}
                />
              </div>
            </motion.div>
          )}

          {pipCameraOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
              className={`fixed z-50 bg-card border border-border/50 rounded-xl shadow-apple-lg overflow-hidden flex flex-col ${
                pipFullscreen === 'camera'
                  ? 'inset-4'
                  : pipBrowserOpen
                    ? 'bottom-20 right-[340px] w-64 h-48'
                    : 'bottom-20 right-4 w-64 h-48'
              }`}
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Webcam className="w-3.5 h-3.5 text-primary/60" />
                  <span className="text-[10px] font-medium text-muted-foreground">{t('header.mode.camera')}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPipFullscreen(f => f === 'camera' ? null : 'camera')} className="p-1 rounded hover:bg-secondary/80 text-muted-foreground transition-colors">
                    {pipFullscreen === 'camera' ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                  </button>
                  <button onClick={() => { setPipCameraOpen(false); setPipFullscreen(null); }} className="p-1 rounded hover:bg-secondary/80 text-muted-foreground transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0">
                <CameraFeed className="h-full rounded-b-xl" enableDetection />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* Error Detail Panel — slides up from bottom when an error occurs */}
      <AnimatePresence>
        {errorDetail && (
          <ErrorDetailPanel detail={errorDetail} onClose={() => setErrorDetail(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
