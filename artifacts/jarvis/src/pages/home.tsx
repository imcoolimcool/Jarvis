import { useState, useEffect, useRef, useCallback } from 'react';
import { useAudioRecorder } from '@/hooks/use-audio-recorder';
import { useSendMessage, useSynthesizeSpeech } from '@workspace/api-client-react';
import { Orb, AppState } from '@/components/orb';
import { ConversationFeed, ChatMessage } from '@/components/conversation-feed';
import { useToast } from '@/hooks/use-toast';
import { Square } from 'lucide-react';

export default function Home() {
  const [status, setStatus] = useState<AppState>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const { startRecording, stopRecording } = useAudioRecorder();
  const { toast } = useToast();
  
  const sendMessage = useSendMessage();
  const synthesizeSpeech = useSynthesizeSpeech();
  
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const handleError = useCallback((msg: string) => {
    toast({ variant: 'destructive', title: 'System Error', description: msg });
    setStatus('idle');
  }, [toast]);

  const handleTranscribeAndProcess = async (blob: Blob, mimeType: string) => {
    try {
      setStatus('transcribing');
      
      const fileExt = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([blob], `recording.${fileExt}`, { type: mimeType });
      const formData = new FormData();
      formData.append('audio', file);
      
      const res = await fetch('/api/jarvis/transcribe', {
        method: 'POST',
        body: formData,
      });
      
      if (!res.ok) throw new Error("Transcription failed");
      const { transcript } = await res.json();
      
      if (!transcript || transcript.trim().length === 0) {
        setStatus('idle');
        return;
      }
      
      const currentMessages = messagesRef.current;
      const newMessages: ChatMessage[] = [...currentMessages, { role: 'user', content: transcript }];
      setMessages(newMessages);
      setStatus('thinking');
      
      sendMessage.mutate({ data: { userMessage: transcript, messages: currentMessages } }, {
        onSuccess: (data) => {
          const jarvisText = data.response;
          setMessages(prev => [...prev, { role: 'assistant', content: jarvisText }]);
          setStatus('speaking');
          
          synthesizeSpeech.mutate({ data: { text: jarvisText } }, {
            onSuccess: (speechData) => {
              try {
                const binaryString = atob(speechData.audio);
                const len = binaryString.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
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
                };
                
                audioEl.onerror = () => {
                  handleError("Audio playback failed");
                }
              } catch (err) {
                handleError("Failed to decode audio");
              }
            },
            onError: () => handleError("Speech synthesis failed")
          });
        },
        onError: () => handleError("Intelligence module failed")
      });
      
    } catch (err) {
      handleError("Processing failed");
    }
  };

  const handleToggleRecording = async () => {
    if (status === 'speaking') {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
      setStatus('idle');
      return;
    }
    
    if (status === 'idle') {
      try {
        await startRecording();
        setStatus('recording');
      } catch (err) {
        handleError("Microphone access denied");
      }
    } else if (status === 'recording') {
      try {
        const { blob, mimeType } = await stopRecording();
        handleTranscribeAndProcess(blob, mimeType);
      } catch (err) {
        handleError("Failed to stop recording");
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        if (e.target === document.body) e.preventDefault();
        if (e.repeat) return;
        
        if (status === 'idle' || status === 'recording' || status === 'speaking') {
          handleToggleRecording();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, startRecording, stopRecording, handleTranscribeAndProcess, handleToggleRecording]);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col overflow-hidden selection:bg-primary/30">
      <header className="p-6 flex items-center justify-between border-b border-border/50 bg-background/50 backdrop-blur-md relative z-10 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-4">
          <div className="w-2 h-2 bg-primary rounded-full animate-pulse shadow-[0_0_10px_rgba(0,212,255,0.8)]" />
          <h1 className="font-display font-bold tracking-[0.2em] text-lg glow-text">JARVIS ONLINE</h1>
        </div>
        <div className="font-mono text-xs text-primary/60 tracking-widest hidden sm:block">
          SYS_VER: 4.2.0 | UPLINK: SECURE
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row relative z-0">
        <div className="flex-1 flex flex-col items-center justify-center p-8 border-b lg:border-b-0 lg:border-r border-border/20 relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,212,255,0.05)_0%,transparent_70%)] pointer-events-none" />
          
          <Orb status={status} onClick={handleToggleRecording} />
          
          <div className="mt-16 text-center h-24">
            <h2 className="font-display text-2xl font-bold tracking-widest text-primary glow-text transition-all duration-300">
              {status.toUpperCase()}
            </h2>
            <p className="mt-4 font-mono text-[10px] sm:text-xs text-muted-foreground tracking-[0.2em] opacity-80 uppercase">
              {status === 'idle' && "Tap orb or press space to initialize input"}
              {status === 'recording' && "Tap orb or press space to finalize input"}
              {status === 'speaking' && "Tap orb or press space to interrupt response"}
              {status === 'transcribing' && "Analyzing audio signal telemetry"}
              {status === 'thinking' && "Processing query via central node"}
            </p>
            
            {status === 'speaking' && (
              <button 
                onClick={handleToggleRecording}
                className="mt-6 inline-flex items-center gap-2 px-6 py-2 rounded-none border border-primary/50 text-primary hover:bg-primary/10 transition-colors font-display tracking-widest text-xs relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-primary/20 translate-y-[100%] group-hover:translate-y-0 transition-transform" />
                <Square className="w-3 h-3 fill-current relative z-10" />
                <span className="relative z-10">TERMINATE</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 max-w-2xl bg-card/10 flex flex-col relative border-l border-white/5 mx-auto w-full">
          <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(0,212,255,0.02)_1px,transparent_1px)] bg-[length:100%_4px]" />
          <ConversationFeed messages={messages} />
        </div>
      </main>
      
      <div className="pointer-events-none fixed inset-0 z-50 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(5,5,8,0.9)_100%)] mix-blend-multiply" />
    </div>
  );
}