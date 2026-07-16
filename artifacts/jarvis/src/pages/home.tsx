import { useState, useEffect, useRef, useCallback } from 'react';
import { useAudioRecorder } from '@/hooks/use-audio-recorder';
import { useSynthesizeSpeech } from '@workspace/api-client-react';
import { Orb, AppState } from '@/components/orb';
import { ConversationFeed, ChatMessage } from '@/components/conversation-feed';
import { ChatSidebar } from '@/components/chat-sidebar';
import { SettingsPanel } from '@/components/settings-panel';
import { useToast } from '@/hooks/use-toast';
import { Square, Mic, MessageSquare, Send, Settings, Menu, Sun, Moon, ImagePlus, X } from 'lucide-react';

type Theme = 'dark' | 'light';

interface AttachedImage {
  base64: string;
  mimeType: string;
  preview: string; // object URL for display
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
  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const { theme, toggle: toggleTheme } = useTheme();

  const messagesRef = useRef<ChatMessage[]>([]);
  const activeConvIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { startRecording, stopRecording } = useAudioRecorder();
  const { toast } = useToast();
  const synthesizeSpeech = useSynthesizeSpeech();
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { activeConvIdRef.current = activeConversationId; }, [activeConversationId]);
  useEffect(() => { if (isChatMode) setTimeout(() => inputRef.current?.focus(), 50); }, [isChatMode]);

  // Revoke object URL on cleanup
  useEffect(() => {
    return () => { if (attachedImage) URL.revokeObjectURL(attachedImage.preview); };
  }, [attachedImage]);

  const handleError = useCallback((msg: string) => {
    toast({ variant: 'destructive', title: 'System Error', description: msg });
    setStatus('idle');
  }, [toast]);

  const refreshSidebar = useCallback(() => setSidebarRefreshTick(t => t + 1), []);

  /** Convert a File/Blob to { base64, mimeType, preview } */
  const readImageFile = useCallback((file: File): Promise<AttachedImage> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const [header, base64] = dataUrl.split(',');
        const mimeType = header.match(/:(.*?);/)?.[1] ?? file.type;
        const preview = URL.createObjectURL(file);
        resolve({ base64, mimeType, preview });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast({ title: 'Only images are supported' }); return; }
    try {
      if (attachedImage) URL.revokeObjectURL(attachedImage.preview);
      setAttachedImage(await readImageFile(file));
    } catch { toast({ title: 'Could not load image' }); }
    e.target.value = '';
  }, [attachedImage, readImageFile, toast]);

  /** Handle paste events — capture images pasted from clipboard */
  const handleInputPaste = useCallback(async (e: React.ClipboardEvent) => {
    const imageItem = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    try {
      if (attachedImage) URL.revokeObjectURL(attachedImage.preview);
      setAttachedImage(await readImageFile(file));
    } catch { toast({ title: 'Could not load image' }); }
  }, [attachedImage, readImageFile, toast]);

  const removeAttachedImage = useCallback(() => {
    if (attachedImage) URL.revokeObjectURL(attachedImage.preview);
    setAttachedImage(null);
  }, [attachedImage]);

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
  }, []);

  const playTTS = useCallback((jarvisText: string, onDone: () => void) => {
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
            el.play();
            el.onended = () => { URL.revokeObjectURL(url); activeAudioRef.current = null; onDone(); };
            el.onerror = () => handleError("Audio playback failed");
          } catch { handleError("Failed to decode audio"); }
        },
        onError: () => onDone(),
      }
    );
  }, [synthesizeSpeech, handleError]);

  const processUserText = useCallback(async (userText: string, image?: AttachedImage | null) => {
    // Optimistically add message (with image preview if any)
    setMessages(prev => [...prev, { role: 'user', content: userText, imagePreview: image?.preview }]);
    setSuggestions([]);
    setStatus('thinking');

    try {
      const body: Record<string, string> = { userMessage: userText };
      if (activeConvIdRef.current) body.conversationId = activeConvIdRef.current;
      if (image) { body.imageBase64 = image.base64; body.imageMimeType = image.mimeType; }

      const res = await fetch('/api/jarvis/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) { handleError("Intelligence module failed"); return; }
      const data = await res.json();
      const jarvisText: string = data.response;
      const convId: string = data.conversationId;
      const newSuggestions: string[] = data.suggestions ?? [];

      if (!activeConvIdRef.current) setActiveConversationId(convId);
      refreshSidebar();

      setMessages(prev => [...prev, { role: 'assistant', content: jarvisText }]);
      setSuggestions(newSuggestions);
      setStatus('speaking');

      playTTS(jarvisText, () => {
        setStatus('idle');
        if (isChatMode) setTimeout(() => inputRef.current?.focus(), 50);
      });
    } catch { handleError("Intelligence module failed"); }
  }, [handleError, refreshSidebar, playTTS, isChatMode]);

  const handleTranscribeAndProcess = async (blob: Blob, mimeType: string) => {
    try {
      setStatus('transcribing');
      const fileExt = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([blob], `recording.${fileExt}`, { type: mimeType });
      const formData = new FormData();
      formData.append('audio', file);
      const res = await fetch('/api/jarvis/transcribe', { method: 'POST', body: formData });
      if (!res.ok) throw new Error("Transcription failed");
      const { transcript } = await res.json();
      if (!transcript?.trim()) { setStatus('idle'); return; }
      await processUserText(transcript);
    } catch { handleError("Processing failed"); }
  };

  const handleToggleRecording = useCallback(async () => {
    if (status === 'speaking') {
      activeAudioRef.current?.pause(); activeAudioRef.current = null; setStatus('idle'); return;
    }
    if (status === 'idle') {
      try { await startRecording(); setStatus('recording'); }
      catch { handleError("Microphone access denied"); }
    } else if (status === 'recording') {
      try { const { blob, mimeType } = await stopRecording(); handleTranscribeAndProcess(blob, mimeType); }
      catch { handleError("Failed to stop recording"); }
    }
  }, [status, startRecording, stopRecording, handleError]);

  const handleChatSubmit = () => {
    const text = chatInput.trim();
    if (!text && !attachedImage) return;
    if (status === 'thinking' || status === 'transcribing') return;
    const img = attachedImage;
    setChatInput('');
    setAttachedImage(null);
    processUserText(text || '📎 Image', img);
  };

  const handleSuggestionClick = useCallback((text: string) => {
    setSuggestions([]);
    processUserText(text);
  }, [processUserText]);

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

  const statusHint = isChatMode
    ? "Type in the chat panel"
    : status === 'idle'         ? "Tap orb or press space"
    : status === 'recording'    ? "Tap orb to finalize"
    : status === 'speaking'     ? "Tap orb to interrupt"
    : status === 'transcribing' ? "Analyzing audio…"
    : "Processing query…";

  return (
    <div className={`${theme} min-h-[100dvh] bg-background text-foreground flex flex-col overflow-hidden`}>

      {/* ── Header ───────────────────────────────── */}
      <header className="px-4 py-3 flex items-center gap-3 border-b border-border/50 bg-background/80 backdrop-blur-md relative z-10 flex-shrink-0">
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

        <main className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
          {/* Orb panel — hidden on mobile in chat mode */}
          <div className={`flex-shrink-0 lg:w-72 xl:w-80 flex-col items-center justify-center p-8 border-b lg:border-b-0 lg:border-r border-border/20 relative ${
            isChatMode ? 'hidden lg:flex' : 'flex'
          }`}>
            <div className="dark:block hidden absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,212,255,0.05)_0%,transparent_70%)] pointer-events-none" />
            <Orb status={status} onClick={isChatMode ? undefined : handleToggleRecording} />
            <div className="mt-8 text-center space-y-2">
              <h2 className="font-display text-xl font-bold tracking-widest text-primary glow-text">
                {status.toUpperCase()}
              </h2>
              <p className="font-mono text-xs text-muted-foreground tracking-wide max-w-[180px]">
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

          {/* Chat area */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-card/5">
            <ConversationFeed
              messages={messages}
              isThinking={status === 'thinking'}
              suggestions={suggestions}
              onSuggestionClick={handleSuggestionClick}
            />

            {/* Input bar */}
            {isChatMode && (
              <div className="border-t border-border/30 bg-background/90 backdrop-blur-md px-4 py-3 flex-shrink-0 space-y-2">

                {/* Image preview strip */}
                {attachedImage && (
                  <div className="flex items-center gap-2">
                    <div className="relative w-14 h-14 rounded-lg overflow-hidden border border-border flex-shrink-0">
                      <img src={attachedImage.preview} alt="Attachment" className="w-full h-full object-cover" />
                      <button
                        onClick={removeAttachedImage}
                        className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-background/80 flex items-center justify-center text-foreground hover:text-red-400 transition-colors"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground/60 tracking-widest">IMAGE ATTACHED</span>
                  </div>
                )}

                {/* Input row */}
                <div className="flex gap-2">
                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileSelect}
                  />

                  {/* Attach image button */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isBusy}
                    title="Attach image (or paste from clipboard)"
                    className={`p-2.5 rounded-lg border transition-all flex-shrink-0 ${
                      attachedImage
                        ? 'border-primary text-primary bg-primary/10'
                        : 'border-border/50 text-muted-foreground hover:border-primary/40 hover:text-primary'
                    } disabled:opacity-30`}
                  >
                    <ImagePlus className="w-4 h-4" />
                  </button>

                  <input
                    ref={inputRef}
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleChatSubmit()}
                    onPaste={handleInputPaste}
                    placeholder={isBusy ? "Processing…" : attachedImage ? "Add a message… (or just send the image)" : "Message Jarvis…"}
                    disabled={isBusy}
                    className="flex-1 bg-card border border-border text-foreground placeholder:text-muted-foreground/50 font-mono text-sm px-4 py-2.5 rounded-lg outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10 transition-all disabled:opacity-40"
                  />

                  <button
                    onClick={handleChatSubmit}
                    disabled={isBusy || (!chatInput.trim() && !attachedImage)}
                    className="px-4 py-2.5 rounded-lg border border-primary/50 text-primary hover:bg-primary/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5 font-display tracking-wider text-xs flex-shrink-0"
                  >
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
            )}
          </div>
        </main>
      </div>

      <div className="dark:block hidden pointer-events-none fixed inset-0 z-30 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(5,5,8,0.7)_100%)]" />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
