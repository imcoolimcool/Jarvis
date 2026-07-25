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
import { Square, Mic, MessageSquare, Send, Settings, Menu, Sun, Moon, Paperclip, FileText, X, ChevronDown, Sparkles, MessageCircle, Briefcase, Zap, Globe, SlidersHorizontal, AlarmClock, Plus, Camera, Bug, Image as ImageIcon, Monitor, Bot, Webcam, Minimize2, Maximize2 } from 'lucide-react';
import type { Widget } from '@/types/widget';
import { ClockWidget, WeatherWidget, TimerWidget, AlarmWidget, CalendarWidget } from '@/components/widgets';
import { ErrorDetailPanel, type ErrorDetail } from '@/components/error-detail-panel';
import { useScreenShare } from '@/hooks/use-screen-share';
import { JarvisBrowser } from '@/components/jarvis-browser';
import { CameraFeed } from '@/components/camera-feed';

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
  const [plusMenuCoords, setPlusMenuCoords] = useState<{ bottom: number; right: number } | null>(null);
  const plusButtonRef = useRef<HTMLDivElement>(null);

  const { theme, toggle: toggleTheme } = useTheme();
  const { toast } = useToast();

  // Track the last submitted message for retry
  const lastFailedTextRef = useRef<string | null>(null);
  const lastFailedFileRef = useRef<AttachedFile | null>(null);

  // Track connection quality via time-to-first-token
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const latencySamplesRef = useRef<number[]>([]);
  const requestStartRef = useRef<number>(0);

  // Track backend connectivity — show banner when offline
  const [backendOnline, setBackendOnline] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const check = () =>
      fetch('/api/healthz')
        .then(r => { if (!cancelled) setBackendOnline(r.ok); })
        .catch(() => { if (!cancelled) setBackendOnline(false); });
    check();
    const interval = setInterval(check, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

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
        onError: () => onDone(),
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
                // Auto-open PiP browser and navigate to search
                setPipBrowserOpen(true);
                setMessages(prev => prev.slice(0, -1)); // remove empty assistant msg
                // Navigate the browser after a short delay to let it connect
                setTimeout(() => {
                  fetch('/api/jarvis/browse/action', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'navigate', payload: `https://www.google.com/search?q=${encodeURIComponent(parsed.searchQuery)}` }),
                  }).catch(() => {});
                }, 1000);
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
    unlockAudioForIOS(); // must be called synchronously from user gesture for iOS Safari
    const file = attachedFile;
    setChatInput('');
    setAttachedFile(null);

    // Agent mode: open browser PiP and search
    if (agentModeActive) {
      setPipBrowserOpen(true);
      setPipFullscreen(null);
      setMessages(prev => [...prev, { role: 'user', content: text, timestamp: Date.now() }, { role: 'assistant', content: `Searching for "${text}"...`, timestamp: Date.now() }]);
      setTimeout(() => {
        fetch('/api/jarvis/browse/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'navigate', payload: `https://www.google.com/search?q=${encodeURIComponent(text)}` }),
        }).catch(() => {});
      }, 1000);
      return;
    }

    // Keyboard submit: no TTS. Only mic-sourced messages speak in chat mode.
    processUserText(text || `📎 ${file?.fileName ?? 'File'}`, file, false);
  };

  const handleSuggestionClick = useCallback((text: string) => {
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

  const { start: startChatRecording, stop: stopChatRecording } = useSpeechRecognition({
    onTranscript: (text) => {
      setChatRecording(false);
      if (!text.trim()) return;
      // Auto-submit mic input and speak the response (mic → TTS allowed in chat mode)
      unlockAudioForIOS();
      processUserTextRef.current?.(text.trim(), null, true);
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
      unlockAudioForIOS(); // gesture-unlock before mic starts
      vibrate([30, 50, 30]);
      setChatRecording(true);
      startChatRecording();
    }
  };

  const handleStopSpeaking = () => {
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
    idle: 'Ready',
    wake: 'Ready',
    recording: 'Listening',
    transcribing: 'Transcribing',
    thinking: 'Thinking',
    speaking: 'Speaking',
  };

  const statusHint = isChatMode
    ? "Type in the chat panel"
    : status === 'idle' || status === 'wake'
      ? "Say 'hey Jarvis' or tap orb to talk"
    : status === 'recording'    ? "Speak now — pausing will send your message"
    : status === 'speaking'     ? "Tap orb to interrupt"
    : status === 'transcribing' ? "Got it…"
    : "Thinking…";

  return (
    <div className={`${theme} h-dvh bg-background text-foreground flex flex-col overflow-hidden`}>

      {/* ── Backend offline banner ── */}
      {!backendOnline && (
        <div className="px-4 py-2 bg-destructive/5 border-b border-destructive/20 flex items-center justify-center gap-2 flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-destructive flex-shrink-0" />
          <p className="text-[11px] font-mono text-destructive/80">
            Backend offline — API server may not be running
          </p>
        </div>
      )}

      {/* ── Header: Apple-style translucent toolbar ── */}
      <header className="glass-toolbar px-4 py-3 flex items-center gap-3 border-b border-border/50 relative z-50 flex-shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="lg:hidden p-1.5 -ml-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Open history"
          >
            <Menu className="w-5 h-5" />
          </button>
          {/* Logo and title */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #007AFF, #5856D6)' }}
            >
              <span className="text-white text-[9px] font-bold tracking-wider">J</span>
            </div>
            <h1 className="font-sans font-semibold text-base tracking-tight truncate">Jarvis</h1>
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

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Mode picker — Apple segmented control style */}
          <div
            className="flex items-center p-0.5 rounded-lg"
            style={{ background: 'hsl(var(--secondary))' }}
          >
            {([
              { id: 'voice' as const, label: 'Voice', icon: Mic },
              { id: 'chat' as const, label: 'Chat', icon: MessageSquare },
            ]).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setMode(id)}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[11px] font-medium transition-all duration-200 ${
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
                  {label}
                </span>
              </button>
            ))}
          </div>

          {/* Personality button */}
          <div className="relative">
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

          <button onClick={toggleTheme} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-all">
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button onClick={() => setSettingsOpen(true)} title="Settings"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-all">
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

        <main className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">

          {/* ── VOICE MODE ── */}
          {mode === 'voice' && (
            <div className="flex-1 flex flex-col min-h-0 relative">
              <div className="dark:block hidden absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,212,255,0.05)_0%,transparent_70%)] pointer-events-none" />

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
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => { setAgentModeActive(a => !a); if (!agentModeActive) setPipBrowserOpen(true); setPipFullscreen(null); }}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                      agentModeActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground/50 hover:text-foreground'
                    }`}
                  >
                    <Bot className="w-3 h-3 inline mr-1" />
                    {agentModeActive ? 'Agent On' : 'Agent'}
                  </button>
                  <button
                    onClick={() => { setPipBrowserOpen(b => !b); setPipFullscreen(null); }}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                      pipBrowserOpen ? 'bg-primary/10 text-primary' : 'text-muted-foreground/50 hover:text-foreground'
                    }`}
                  >
                    <Globe className="w-3 h-3 inline mr-1" />
                    {pipBrowserOpen ? 'Browser On' : 'Browser'}
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
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={statusHint}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="text-xs text-muted-foreground"
                    >
                      {statusHint}
                    </motion.p>
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
                  <p className="text-xs text-muted-foreground max-w-[160px]">
                    {statusHint}
                  </p>
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
                    {agentModeActive ? 'Agent On' : 'Agent'}
                  </button>
                  <button
                    onClick={() => { setPipBrowserOpen(b => !b); setPipFullscreen(null); }}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                      pipBrowserOpen ? 'bg-primary/10 text-primary' : 'text-muted-foreground/50 hover:text-foreground'
                    }`}
                  >
                    <Globe className="w-3 h-3 inline mr-1" />
                    {pipBrowserOpen ? 'Browser On' : 'Browser'}
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
                    // Navigate browser to search after PiP opens
                    setTimeout(() => {
                      fetch('/api/jarvis/browse/action', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'navigate', payload: `https://www.google.com/search?q=${encodeURIComponent(query)}` }),
                      }).catch(() => {});
                    }, 1000);
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
                      toast({ title: 'File attached', description: file.name });
                    } catch {
                      setUploadProgress(null);
                      toast({ title: 'Could not read file', variant: 'destructive' });
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
                        <p className="font-display text-sm tracking-widest text-primary/70">DROP FILE HERE</p>
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
                  <div className="flex gap-2">
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
                        className={`p-2.5 rounded-lg border transition-all ${
                          attachedFile || webSearchEnabled
                            ? 'border-primary text-primary bg-primary/10'
                            : 'border-border/50 text-muted-foreground hover:border-primary/40 hover:text-primary'
                        } disabled:opacity-30`}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="relative flex-1">
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
                          chatRecording ? '🎙 Listening… speak now'
                          : isBusy ? 'Processing…'
                          : attachedFile ? 'Add a message…'
                          : 'Ask Jarvis anything…'
                        }
                        disabled={isBusy}
                        className={`w-full bg-card border text-foreground placeholder:text-muted-foreground/50 font-mono text-sm px-4 py-2.5 rounded-lg outline-none focus:ring-2 transition-all disabled:opacity-40 resize-none min-h-[42px] max-h-[160px] ${
                          chatRecording
                            ? 'border-red-400/60 focus:border-red-400/80 focus:ring-red-400/10 placeholder:text-red-400/60 animate-pulse'
                            : status === 'thinking'
                            ? 'border-yellow-400/40 focus:border-yellow-400/60 focus:ring-yellow-400/10'
                            : status === 'speaking'
                            ? 'border-primary/40 focus:border-primary/60 focus:ring-primary/10'
                            : 'border-border focus:border-primary/60 focus:ring-primary/10'
                        }`}
                      />
                      {/* Character count */}
                      {chatInput.length > 0 && (
                        <span className="absolute bottom-1.5 right-3 text-[9px] font-mono text-muted-foreground/30 pointer-events-none">
                          {chatInput.length}
                        </span>
                      )}
                    </div>
                    <button onClick={handleChatMicToggle} disabled={isBusy}
                      title={chatRecording ? 'Stop recording' : 'Voice input — Jarvis will speak back'}
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
                            Attach file
                          </button>
                          <button
                            onClick={() => { closePlusMenu(); cameraInputRef.current?.click(); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                          >
                            <Camera className="w-3.5 h-3.5 flex-shrink-0" />
                            Camera
                          </button>
                          <div className="h-px bg-border/30 my-1" />
                          <button
                            onClick={() => { closePlusMenu(); setTimeout(() => inputRef.current?.focus(), 50); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                          >
                            <ImageIcon className="w-3.5 h-3.5 flex-shrink-0" />
                            Generate image
                          </button>
                          <button
                            onClick={() => { closePlusMenu(); handleToggleScreenShare(); }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[11px] font-mono transition-colors ${
                              screenShareActive ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                            }`}
                          >
                            <Monitor className="w-3.5 h-3.5 flex-shrink-0" />
                            {screenShareActive ? 'Stop sharing' : 'Share screen'}
                          </button>
                          <div className="h-px bg-border/30 my-1" />
                          <button
                            onClick={() => { closePlusMenu(); setAgentModeActive(a => !a); }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[11px] font-mono transition-colors ${
                              agentModeActive ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                            }`}
                          >
                            <Bot className="w-3.5 h-3.5 flex-shrink-0" />
                            {agentModeActive ? 'Agent mode ON' : 'Agent mode'}
                          </button>
                          <div className="h-px bg-border/30 my-1" />
                          <button
                            onClick={() => { closePlusMenu(); handleToggleWebSearch(); }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[11px] font-mono transition-colors ${
                              webSearchEnabled ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                            }`}
                          >
                            <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                            Web search {webSearchEnabled ? '(on)' : '(off)'}
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
                    {chatRecording && (
                      <p className="text-[10px] font-mono text-red-400/70 tracking-widest text-center animate-pulse">
                        ● LISTENING — tap mic to cancel · Jarvis will speak when done
                      </p>
                    )}
                    {status === 'thinking' && !chatRecording && (
                      <p className="text-[10px] font-mono text-yellow-400/60 tracking-widest text-center animate-pulse">
                        ◆ THINKING…
                      </p>
                    )}
                    {status === 'speaking' && (
                      <p className="text-[10px] font-mono text-muted-foreground/50 tracking-widest text-center">
                        JARVIS IS SPEAKING —{' '}
                        <button onClick={handleStopSpeaking} className="text-primary hover:underline">STOP</button>
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
                  <span className="text-[10px] font-medium text-muted-foreground">Browser</span>
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
                <JarvisBrowser className="h-full border-0 rounded-b-xl" />
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
                  <span className="text-[10px] font-medium text-muted-foreground">Camera</span>
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

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Error Detail Panel — slides up from bottom when an error occurs */}
      <AnimatePresence>
        {errorDetail && (
          <ErrorDetailPanel detail={errorDetail} onClose={() => setErrorDetail(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
