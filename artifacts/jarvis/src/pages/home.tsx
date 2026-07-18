import { useState, useEffect, useRef, useCallback } from 'react';
import { useSpeechRecognition, isSpeechRecognitionSupported } from '@/hooks/use-speech-recognition';
import { useSynthesizeSpeech } from '@workspace/api-client-react';
import { Orb, AppState } from '@/components/orb';
import { ConversationFeed, ChatMessage } from '@/components/conversation-feed';
import { ChatSidebar } from '@/components/chat-sidebar';
import { SettingsPanel } from '@/components/settings-panel';
import { useToast } from '@/hooks/use-toast';
import { Square, Mic, MessageSquare, Send, Settings, Menu, Sun, Moon, Paperclip, FileText, ImagePlus, X, ChevronDown, Sparkles, MessageCircle, Briefcase, Zap } from 'lucide-react';

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

  const { theme, toggle: toggleTheme } = useTheme();

  const messagesRef = useRef<ChatMessage[]>([]);
  const activeConvIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { start: startListening, stop: stopListening } = useSpeechRecognition({
    onTranscript: (text) => {
      setStatus('thinking');
      processUserText(text);
    },
    onError: (msg) => handleError(msg),
    onEnd: () => {
      // Only reset to idle if we're still in recording state (no transcript came through)
      setStatus(prev => prev === 'recording' ? 'idle' : prev);
    },
  });
  const { toast } = useToast();
  const synthesizeSpeech = useSynthesizeSpeech();
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

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

  // Load personality from settings
  useEffect(() => {
    fetch('/api/jarvis/settings')
      .then(r => r.json())
      .then(data => {
        if (data.personality) setPersonality(data.personality);
      })
      .catch(() => {});
  }, []);

  const handleSetPersonality = async (value: string) => {
    setPersonality(value);
    setPersonalityMenuOpen(false);
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
            const el = new Audio(url);
            activeAudioRef.current = el;
            onStart(); // flip to 'speaking' only when audio is ready
            el.play();
            el.onended = () => { URL.revokeObjectURL(url); activeAudioRef.current = null; onDone(); };
            el.onerror = () => handleError("Audio playback failed");
          } catch { handleError("Failed to decode audio"); }
        },
        onError: () => onDone(),
      }
    );
  }, [synthesizeSpeech, handleError]);

  const processUserText = useCallback(async (userText: string, file?: AttachedFile | null) => {
    // Optimistically add message (with file preview if any)
    setMessages(prev => [...prev, { role: 'user', content: userText, file: file ?? undefined }]);
    setSuggestions([]);
    setStatus('thinking');

    try {
      const body: Record<string, string> = { userMessage: userText };
      if (activeConvIdRef.current) body.conversationId = activeConvIdRef.current;
      if (file) { body.fileBase64 = file.base64; body.fileMimeType = file.mimeType; }

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

      if (!activeConvIdRef.current) setActiveConversationId(convId);
      refreshSidebar();

      setMessages(prev => [...prev, { role: 'assistant', content: jarvisText }]);
      setSuggestions(newSuggestions);

      playTTS(jarvisText, () => setStatus('speaking'), () => {
        if (isChatMode) {
          setStatus('idle');
          setTimeout(() => inputRef.current?.focus(), 50);
        } else {
          // Auto-restart listening after Jarvis finishes speaking
          setStatus('recording');
          startListening();
        }
      });
    } catch { handleError("Jarvis hit a snag — try again."); }
  }, [handleError, refreshSidebar, playTTS, isChatMode, startListening]);

  const handleToggleRecording = useCallback(() => {
    if (status === 'speaking') {
      activeAudioRef.current?.pause(); activeAudioRef.current = null; setStatus('idle'); return;
    }
    if (status === 'idle') {
      if (!isSpeechRecognitionSupported()) {
        handleError("Voice mode requires Chrome or Edge browser.");
        return;
      }
      setStatus('recording');
      startListening();
    } else if (status === 'recording') {
      stopListening();
      // onEnd callback resets to idle if no transcript came through
    }
  }, [status, startListening, stopListening, handleError]);

  const handleChatSubmit = () => {
    const text = chatInput.trim();
    if (!text && !attachedFile) return;
    if (status === 'thinking' || status === 'transcribing') return;
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
    activeAudioRef.current?.pause(); activeAudioRef.current = null; setStatus('idle');
    if (isChatMode) setTimeout(() => inputRef.current?.focus(), 50);
  };

  useEffect(() => {
    if (isChatMode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        if (e.repeat) return;
        if (status === 'idle' || status === 'recording' || status === 'speaking') handleToggleRecording();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, isChatMode, handleToggleRecording]);

  const isBusy = status === 'thinking' || status === 'transcribing';

  const statusLabels: Record<AppState, string> = {
    idle: 'Ready',
    recording: 'Listening',
    transcribing: 'Transcribing',
    thinking: 'Thinking',
    speaking: 'Speaking',
  };

  const statusHint = isChatMode
    ? "Type in the chat panel"
    : status === 'idle'         ? "Tap orb or press space to talk"
    : status === 'recording'    ? "Tap orb when you're done"
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
              <span className="hidden sm:inline">
                {personality === 'balanced' && 'Balanced'}
                {personality === 'talkative' && 'Talkative'}
                {personality === 'helpful' && 'Helpful'}
                {personality === 'concise' && 'Just gets it done'}
              </span>
              <ChevronDown className={`w-3 h-3 transition-transform ${personalityMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {personalityMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setPersonalityMenuOpen(false)} />
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 min-w-[10rem] p-1 rounded-xl border border-border/50 bg-card shadow-xl overflow-hidden">
                  {[
                    { value: 'balanced', label: 'Balanced', icon: MessageCircle },
                    { value: 'talkative', label: 'Talkative', icon: Sparkles },
                    { value: 'helpful', label: 'Helpful', icon: Briefcase },
                    { value: 'concise', label: 'Just gets it done', icon: Zap },
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
              <div className="flex-1 flex flex-col items-center justify-center p-8">
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

              {/* Subtitle strip — pinned to bottom, never overlaps orb */}
              <div className="flex-shrink-0 px-6 pb-8 pt-4 space-y-2 max-w-2xl w-full mx-auto min-h-[5rem]">
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
            </div>
          )}

          {/* ── CHAT MODE ── */}
          {isChatMode && (
            <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
              {/* Orb panel */}
              <div className="hidden lg:flex flex-shrink-0 lg:w-72 xl:w-80 flex-col items-center justify-center p-8 border-r border-border/20 relative">
                <div className="dark:block hidden absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,212,255,0.05)_0%,transparent_70%)] pointer-events-none" />
                <Orb status={status} />
                <div className="mt-8 text-center space-y-2">
                  <h2 className="font-display text-xl font-bold tracking-widest text-primary glow-text">
                    {statusLabels[status]}
                  </h2>
                  <p className="font-mono text-xs text-muted-foreground tracking-wide max-w-[180px]">
                    {statusHint}
                  </p>
                </div>
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
