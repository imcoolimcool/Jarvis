import { useState, useEffect, useRef, useCallback } from 'react';
import { useAudioRecorder } from '@/hooks/use-audio-recorder';
import { useSendMessage, useSynthesizeSpeech } from '@workspace/api-client-react';
import { Orb, AppState } from '@/components/orb';
import { ConversationFeed, ChatMessage } from '@/components/conversation-feed';
import { useToast } from '@/hooks/use-toast';
import { Square, Mic, MessageSquare, Send } from 'lucide-react';

export default function Home() {
  const [status, setStatus] = useState<AppState>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isChatMode, setIsChatMode] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const messagesRef = useRef<ChatMessage[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const { startRecording, stopRecording } = useAudioRecorder();
  const { toast } = useToast();
  
  const sendMessage = useSendMessage();
  const synthesizeSpeech = useSynthesizeSpeech();
  
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Focus input whenever chat mode turns on
  useEffect(() => {
    if (isChatMode) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isChatMode]);

  const handleError = useCallback((msg: string) => {
    toast({ variant: 'destructive', title: 'System Error', description: msg });
    setStatus('idle');
  }, [toast]);

  /** Shared: takes a user text string, sends to LLM, then TTS. */
  const processUserText = useCallback(async (userText: string) => {
    const currentMessages = messagesRef.current;
    const newMessages: ChatMessage[] = [...currentMessages, { role: 'user', content: userText }];
    setMessages(newMessages);
    setStatus('thinking');

    sendMessage.mutate(
      { data: { userMessage: userText, messages: currentMessages } },
      {
        onSuccess: (data) => {
          const jarvisText = data.response;
          setMessages(prev => [...prev, { role: 'assistant', content: jarvisText }]);
          setStatus('speaking');

          synthesizeSpeech.mutate(
            { data: { text: jarvisText } },
            {
              onSuccess: (speechData) => {
                try {
                  const binaryString = atob(speechData.audio);
                  const bytes = new Uint8Array(binaryString.length);
                  for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                  }
                  const audioBlob = new Blob([bytes.buffer], { type: speechData.contentType });
                  const audioUrl = URL.createObjectURL(audioBlob);
                  const audioEl = new Audio(audioUrl);
                  activeAudioRef.current = audioEl;
                  audioEl.play();
                  audioEl.onended = () => {
                    URL.revokeObjectURL(audioUrl);
                    activeAudioRef.current = null;
                    setStatus('idle');
                    if (isChatMode) setTimeout(() => inputRef.current?.focus(), 50);
                  };
                  audioEl.onerror = () => handleError("Audio playback failed");
                } catch {
                  handleError("Failed to decode audio");
                }
              },
              onError: () => {
                // TTS failed but we still have the text — just go back to idle
                setStatus('idle');
                if (isChatMode) setTimeout(() => inputRef.current?.focus(), 50);
              },
            }
          );
        },
        onError: () => handleError("Intelligence module failed"),
      }
    );
  }, [sendMessage, synthesizeSpeech, handleError, isChatMode]);

  /** Voice mode: handle recording toggle. */
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

      if (!transcript || transcript.trim().length === 0) {
        setStatus('idle');
        return;
      }

      await processUserText(transcript);
    } catch {
      handleError("Processing failed");
    }
  };

  const handleToggleRecording = async () => {
    if (status === 'speaking') {
      activeAudioRef.current?.pause();
      activeAudioRef.current = null;
      setStatus('idle');
      return;
    }
    if (status === 'idle') {
      try {
        await startRecording();
        setStatus('recording');
      } catch {
        handleError("Microphone access denied");
      }
    } else if (status === 'recording') {
      try {
        const { blob, mimeType } = await stopRecording();
        handleTranscribeAndProcess(blob, mimeType);
      } catch {
        handleError("Failed to stop recording");
      }
    }
  };

  /** Chat mode: submit text input. */
  const handleChatSubmit = () => {
    const text = chatInput.trim();
    if (!text || status === 'thinking' || status === 'transcribing') return;
    setChatInput('');
    processUserText(text);
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleChatSubmit();
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
        if (status === 'idle' || status === 'recording' || status === 'speaking') {
          handleToggleRecording();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, isChatMode]);

  const isBusy = status === 'thinking' || status === 'transcribing';

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col overflow-hidden selection:bg-primary/30">
      {/* Header */}
      <header className="p-6 flex items-center justify-between border-b border-border/50 bg-background/50 backdrop-blur-md relative z-10 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-4">
          <div className="w-2 h-2 bg-primary rounded-full animate-pulse shadow-[0_0_10px_rgba(0,212,255,0.8)]" />
          <h1 className="font-display font-bold tracking-[0.2em] text-lg glow-text">JARVIS ONLINE</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* Mode toggle */}
          <button
            onClick={() => setIsChatMode(m => !m)}
            title={isChatMode ? "Switch to voice mode" : "Switch to text chat"}
            className={`flex items-center gap-2 px-3 py-1.5 border text-xs font-display tracking-widest transition-all ${
              isChatMode
                ? 'border-primary bg-primary/20 text-primary shadow-[0_0_10px_rgba(0,212,255,0.3)]'
                : 'border-border/50 text-muted-foreground hover:border-primary/50 hover:text-primary'
            }`}
          >
            {isChatMode
              ? <><Mic className="w-3 h-3" /> VOICE</>
              : <><MessageSquare className="w-3 h-3" /> CHAT</>
            }
          </button>
          <div className="font-mono text-xs text-primary/60 tracking-widest hidden sm:block">
            SYS_VER: 4.2.0 | UPLINK: SECURE
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row relative z-0 min-h-0">
        {/* Left panel: orb (hidden in chat mode on small screens) */}
        <div className={`flex-shrink-0 lg:flex-1 flex flex-col items-center justify-center p-8 border-b lg:border-b-0 lg:border-r border-border/20 relative ${isChatMode ? 'hidden lg:flex' : 'flex'}`}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,212,255,0.05)_0%,transparent_70%)] pointer-events-none" />

          <Orb status={status} onClick={isChatMode ? undefined : handleToggleRecording} />

          <div className="mt-16 text-center h-24">
            <h2 className="font-display text-2xl font-bold tracking-widest text-primary glow-text transition-all duration-300">
              {status.toUpperCase()}
            </h2>
            <p className="mt-4 font-mono text-[10px] sm:text-xs text-muted-foreground tracking-[0.2em] opacity-80 uppercase">
              {isChatMode
                ? "Type your message in the chat panel"
                : status === 'idle'     ? "Tap orb or press space to initialize input"
                : status === 'recording' ? "Tap orb or press space to finalize input"
                : status === 'speaking'  ? "Tap orb or press space to interrupt response"
                : status === 'transcribing' ? "Analyzing audio signal telemetry"
                : "Processing query via central node"}
            </p>

            {status === 'speaking' && (
              <button
                onClick={handleStopSpeaking}
                className="mt-6 inline-flex items-center gap-2 px-6 py-2 rounded-none border border-primary/50 text-primary hover:bg-primary/10 transition-colors font-display tracking-widest text-xs relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-primary/20 translate-y-[100%] group-hover:translate-y-0 transition-transform" />
                <Square className="w-3 h-3 fill-current relative z-10" />
                <span className="relative z-10">TERMINATE</span>
              </button>
            )}
          </div>
        </div>

        {/* Right panel: conversation + optional chat input */}
        <div className="flex-1 lg:max-w-2xl bg-card/10 flex flex-col relative border-l border-white/5 min-h-0 w-full">
          <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(0,212,255,0.02)_1px,transparent_1px)] bg-[length:100%_4px]" />
          <ConversationFeed messages={messages} />

          {/* Chat text input — only shown in chat mode */}
          {isChatMode && (
            <div className="relative z-10 border-t border-border/30 bg-background/80 backdrop-blur-md p-4">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={handleChatKeyDown}
                  placeholder={isBusy ? "Processing…" : "Type a message and press Enter"}
                  disabled={isBusy}
                  className="flex-1 bg-card/50 border border-border/50 text-foreground placeholder:text-muted-foreground font-mono text-sm px-4 py-2.5 outline-none focus:border-primary/60 focus:shadow-[0_0_10px_rgba(0,212,255,0.15)] transition-all disabled:opacity-40"
                />
                <button
                  onClick={handleChatSubmit}
                  disabled={isBusy || !chatInput.trim()}
                  className="px-4 py-2.5 border border-primary/50 text-primary hover:bg-primary/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed font-display tracking-widest text-xs flex items-center gap-2"
                >
                  {status === 'speaking'
                    ? <><Square className="w-3 h-3 fill-current" /> STOP</>
                    : <><Send className="w-3 h-3" /> SEND</>
                  }
                </button>
              </div>
              <p className="mt-2 text-[10px] font-mono text-muted-foreground/50 tracking-widest">
                {status === 'speaking' ? "JARVIS IS RESPONDING — AUDIO PLAYING" : "ENTER ↵ TO TRANSMIT"}
              </p>
            </div>
          )}
        </div>
      </main>

      <div className="pointer-events-none fixed inset-0 z-50 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(5,5,8,0.9)_100%)] mix-blend-multiply" />
    </div>
  );
}
