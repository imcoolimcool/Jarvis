import { useState, useEffect, useRef, useCallback } from 'react';
import { useAudioRecorder } from '@/hooks/use-audio-recorder';
import { useSynthesizeSpeech } from '@workspace/api-client-react';
import { Orb, AppState } from '@/components/orb';
import { ConversationFeed, ChatMessage } from '@/components/conversation-feed';
import { ChatSidebar } from '@/components/chat-sidebar';
import { SettingsPanel } from '@/components/settings-panel';
import { useToast } from '@/hooks/use-toast';
import { Square, Mic, MessageSquare, Send, Settings } from 'lucide-react';

export default function Home() {
  const [status, setStatus] = useState<AppState>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isChatMode, setIsChatMode] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [sidebarRefreshTick, setSidebarRefreshTick] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const messagesRef = useRef<ChatMessage[]>([]);
  const activeConvIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { startRecording, stopRecording } = useAudioRecorder();
  const { toast } = useToast();
  const synthesizeSpeech = useSynthesizeSpeech();
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { activeConvIdRef.current = activeConversationId; }, [activeConversationId]);

  useEffect(() => {
    if (isChatMode) setTimeout(() => inputRef.current?.focus(), 50);
  }, [isChatMode]);

  const handleError = useCallback((msg: string) => {
    toast({ variant: 'destructive', title: 'System Error', description: msg });
    setStatus('idle');
  }, [toast]);

  const refreshSidebar = useCallback(() => {
    setSidebarRefreshTick(t => t + 1);
  }, []);

  /** Load a conversation from the server and display its messages */
  const loadConversation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/jarvis/conversations/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      const msgs: ChatMessage[] = (data.messages ?? []).map((m: any) => ({
        role: m.role,
        content: m.content,
      }));
      setMessages(msgs);
      setActiveConversationId(id);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not load conversation' });
    }
  }, [toast]);

  /** Start a fresh chat with no active conversation */
  const handleNewChat = useCallback(() => {
    setMessages([]);
    setActiveConversationId(null);
  }, []);

  /** Play TTS audio for a response */
  const playTTS = useCallback((jarvisText: string, onDone: () => void) => {
    synthesizeSpeech.mutate(
      { data: { text: jarvisText } },
      {
        onSuccess: (speechData) => {
          try {
            const binaryString = atob(speechData.audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
            const audioBlob = new Blob([bytes.buffer], { type: speechData.contentType });
            const audioUrl = URL.createObjectURL(audioBlob);
            const audioEl = new Audio(audioUrl);
            activeAudioRef.current = audioEl;
            audioEl.play();
            audioEl.onended = () => { URL.revokeObjectURL(audioUrl); activeAudioRef.current = null; onDone(); };
            audioEl.onerror = () => handleError("Audio playback failed");
          } catch { handleError("Failed to decode audio"); }
        },
        onError: () => onDone(), // TTS failed but we have the text — just go idle
      }
    );
  }, [synthesizeSpeech, handleError]);

  /** Core: send a user message to the LLM, persist to DB, play TTS */
  const processUserText = useCallback(async (userText: string) => {
    setMessages(prev => [...prev, { role: 'user', content: userText }]);
    setStatus('thinking');

    try {
      const res = await fetch('/api/jarvis/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: userText,
          conversationId: activeConvIdRef.current,
        }),
      });

      if (!res.ok) { handleError("Intelligence module failed"); return; }
      const data = await res.json();
      const jarvisText: string = data.response;
      const convId: string = data.conversationId;

      // Update conversation ID if it was just created
      if (!activeConvIdRef.current) {
        setActiveConversationId(convId);
      }
      refreshSidebar();

      setMessages(prev => [...prev, { role: 'assistant', content: jarvisText }]);
      setStatus('speaking');

      playTTS(jarvisText, () => {
        setStatus('idle');
        if (isChatMode) setTimeout(() => inputRef.current?.focus(), 50);
      });
    } catch { handleError("Intelligence module failed"); }
  }, [handleError, refreshSidebar, playTTS, isChatMode]);

  /** Voice mode: transcribe then process */
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
      activeAudioRef.current?.pause();
      activeAudioRef.current = null;
      setStatus('idle');
      return;
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
    if (!text || status === 'thinking' || status === 'transcribing') return;
    setChatInput('');
    processUserText(text);
  };

  const handleStopSpeaking = () => {
    activeAudioRef.current?.pause();
    activeAudioRef.current = null;
    setStatus('idle');
    if (isChatMode) setTimeout(() => inputRef.current?.focus(), 50);
  };

  // Space bar shortcut (voice mode only)
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

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col overflow-hidden selection:bg-primary/30">
      {/* Header */}
      <header className="p-4 flex items-center justify-between border-b border-border/50 bg-background/50 backdrop-blur-md relative z-10 shadow-[0_4px_30px_rgba(0,0,0,0.5)] flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-2 h-2 bg-primary rounded-full animate-pulse shadow-[0_0_10px_rgba(0,212,255,0.8)]" />
          <h1 className="font-display font-bold tracking-[0.2em] text-lg glow-text">JARVIS ONLINE</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsChatMode(m => !m)}
            title={isChatMode ? "Switch to voice mode" : "Switch to text chat"}
            className={`flex items-center gap-2 px-3 py-1.5 border text-xs font-display tracking-widest transition-all ${
              isChatMode
                ? 'border-primary bg-primary/20 text-primary shadow-[0_0_10px_rgba(0,212,255,0.3)]'
                : 'border-border/50 text-muted-foreground hover:border-primary/50 hover:text-primary'
            }`}
          >
            {isChatMode ? <><Mic className="w-3 h-3" /> VOICE</> : <><MessageSquare className="w-3 h-3" /> CHAT</>}
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            className="p-1.5 border border-border/50 text-muted-foreground hover:border-primary/50 hover:text-primary transition-all"
          >
            <Settings className="w-4 h-4" />
          </button>
          <div className="font-mono text-xs text-primary/60 tracking-widest hidden sm:block">
            SYS_VER: 4.2.0 | UPLINK: SECURE
          </div>
        </div>
      </header>

      {/* Body: sidebar + main */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar — always visible in chat mode, hidden on small screens in voice mode */}
        <div className={isChatMode ? 'flex' : 'hidden lg:flex'}>
          <ChatSidebar
            activeId={activeConversationId}
            onSelect={loadConversation}
            onNew={handleNewChat}
            refreshTick={sidebarRefreshTick}
          />
        </div>

        {/* Main area */}
        <main className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
          {/* Orb panel — hidden in chat mode on small screens */}
          <div className={`flex-shrink-0 lg:w-80 xl:w-96 flex flex-col items-center justify-center p-8 border-b lg:border-b-0 lg:border-r border-border/20 relative ${isChatMode ? 'hidden lg:flex' : 'flex'}`}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,212,255,0.05)_0%,transparent_70%)] pointer-events-none" />
            <Orb status={status} onClick={isChatMode ? undefined : handleToggleRecording} />
            <div className="mt-12 text-center">
              <h2 className="font-display text-2xl font-bold tracking-widest text-primary glow-text">
                {status.toUpperCase()}
              </h2>
              <p className="mt-3 font-mono text-[10px] sm:text-xs text-muted-foreground tracking-[0.2em] opacity-80 uppercase max-w-[200px]">
                {isChatMode
                  ? "Type in the chat panel"
                  : status === 'idle'       ? "Tap orb or press space"
                  : status === 'recording'  ? "Tap orb to finalize"
                  : status === 'speaking'   ? "Tap orb to interrupt"
                  : status === 'transcribing' ? "Analyzing audio…"
                  : "Processing query…"}
              </p>
              {status === 'speaking' && (
                <button
                  onClick={handleStopSpeaking}
                  className="mt-6 inline-flex items-center gap-2 px-5 py-2 border border-primary/50 text-primary hover:bg-primary/10 transition-colors font-display tracking-widest text-xs relative overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-primary/20 translate-y-[100%] group-hover:translate-y-0 transition-transform" />
                  <Square className="w-3 h-3 fill-current relative z-10" />
                  <span className="relative z-10">TERMINATE</span>
                </button>
              )}
            </div>
          </div>

          {/* Conversation + chat input */}
          <div className="flex-1 bg-card/10 flex flex-col relative border-l border-white/5 min-h-0">
            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(0,212,255,0.02)_1px,transparent_1px)] bg-[length:100%_4px]" />
            <ConversationFeed messages={messages} isThinking={status === 'thinking'} />

            {/* Chat text input */}
            {isChatMode && (
              <div className="relative z-10 border-t border-border/30 bg-background/80 backdrop-blur-md p-4 flex-shrink-0">
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleChatSubmit()}
                    placeholder={isBusy ? "Processing…" : "Type a message and press Enter"}
                    disabled={isBusy}
                    className="flex-1 bg-card/50 border border-border/50 text-foreground placeholder:text-muted-foreground font-mono text-sm px-4 py-2.5 outline-none focus:border-primary/60 focus:shadow-[0_0_10px_rgba(0,212,255,0.15)] transition-all disabled:opacity-40"
                  />
                  <button
                    onClick={handleChatSubmit}
                    disabled={isBusy || !chatInput.trim()}
                    className="px-4 py-2.5 border border-primary/50 text-primary hover:bg-primary/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed font-display tracking-widest text-xs flex items-center gap-2"
                  >
                    <Send className="w-3 h-3" />
                    SEND
                  </button>
                </div>
                <p className="mt-1.5 text-[10px] font-mono text-muted-foreground/40 tracking-widest">
                  {status === 'speaking' ? "JARVIS IS RESPONDING — AUDIO PLAYING" : "ENTER ↵ TO TRANSMIT"}
                </p>
              </div>
            )}
          </div>
        </main>
      </div>

      <div className="pointer-events-none fixed inset-0 z-50 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(5,5,8,0.9)_100%)] mix-blend-multiply" />

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
