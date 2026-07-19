import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText } from 'lucide-react';
import type { Widget } from '@/types/widget';
import { ClockWidget, WeatherWidget, TimerWidget, AlarmWidget, CalendarWidget } from '@/components/widgets';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  file?: { preview?: string; fileName?: string };
  widget?: Widget;
}

interface ConversationFeedProps {
  messages: ChatMessage[];
  isThinking?: boolean;
  suggestions?: string[];
  onSuggestionClick?: (text: string) => void;
}

function TypingIndicator() {
  return (
    <motion.div
      key="typing"
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="max-w-[85%] self-start"
    >
      <div className="px-4 py-3.5 rounded-2xl rounded-tl-sm bg-card border border-border/60 shadow-sm">
        <div className="flex items-end gap-[3px] h-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.span
              key={i}
              className="w-[3px] rounded-full bg-primary"
              animate={{ height: [6, 18, 6], opacity: [0.4, 0.9, 0.4] }}
              transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.1, ease: 'easeInOut' }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function InlineWidget({ widget }: { widget: Widget }) {
  switch (widget.type) {
    case 'clock':
      return <ClockWidget timezones={widget.timezones} />;
    case 'weather':
      return <WeatherWidget {...widget} />;
    case 'timer':
      return <TimerWidget durationSeconds={widget.durationSeconds} label={widget.label} />;
    case 'alarm':
      return <AlarmWidget time={widget.time} label={widget.label} />;
    case 'calendar':
      return <CalendarWidget events={widget.events} weekStart={widget.weekStart} />;
    default:
      return null;
  }
}

export function ConversationFeed({
  messages,
  isThinking = false,
  suggestions = [],
  onSuggestionClick,
}: ConversationFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking, suggestions]);

  const showSuggestions =
    !isThinking &&
    suggestions.length > 0 &&
    messages.length > 0 &&
    messages[messages.length - 1]?.role === 'assistant';

  return (
    <div
      ref={scrollRef}
      className="flex-1 w-full overflow-y-auto px-4 sm:px-6 py-6 space-y-4 flex flex-col scroll-smooth relative z-10"
    >
      {messages.length === 0 && !isThinking && (
        <div className="m-auto text-center opacity-30 font-display tracking-widest text-primary flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border border-primary/50 flex items-center justify-center">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
          </div>
          AWAITING INPUT...
        </div>
      )}

      <AnimatePresence initial={false}>
        {messages.map((msg, idx) => {
          const isUser = msg.role === 'user';
          return (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.2 }}
              className={`flex flex-col gap-1.5 ${
                isUser ? 'max-w-[85%] self-end items-end' : 'w-full self-start items-start'
              }`}
            >
              {/* Role label */}
              <span className="text-[10px] font-mono text-muted-foreground/50 tracking-widest px-1">
                {isUser ? 'YOU' : 'JARVIS'}
              </span>

              {/* File preview (user attachments) */}
              {msg.file && (
                <div className={`flex items-center gap-2.5 p-2.5 rounded-2xl border border-border bg-card max-w-[260px] ${isUser ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}>
                  {msg.file.preview ? (
                    <img src={msg.file.preview} alt="Attached" className="w-10 h-10 rounded-lg object-cover border border-border/50 flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg border border-border/50 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-muted-foreground/70" />
                    </div>
                  )}
                  <span className="text-[10px] font-mono text-muted-foreground/70 truncate">{msg.file.fileName ?? 'Attached file'}</span>
                </div>
              )}

              {/* Text bubble */}
              {msg.content && (
                <div
                  className={`px-4 py-3 rounded-2xl text-sm leading-relaxed font-sans ${
                    isUser
                      ? 'bg-primary text-primary-foreground rounded-tr-sm'
                      : 'bg-card border border-border text-foreground rounded-tl-sm shadow-sm max-w-[85%]'
                  }`}
                >
                  {msg.content}
                </div>
              )}

              {/* Widget — only for assistant messages */}
              {!isUser && msg.widget && (
                <div className="w-full max-w-xl">
                  <InlineWidget widget={msg.widget} />
                </div>
              )}
            </motion.div>
          );
        })}

        {isThinking && <TypingIndicator />}
      </AnimatePresence>

      {/* Suggestion chips */}
      <AnimatePresence>
        {showSuggestions && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.25 }}
            className="self-start flex flex-wrap gap-2 pb-2 max-w-[90%]"
          >
            {suggestions.map((s, i) => (
              <motion.button
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.07 }}
                onClick={() => onSuggestionClick?.(s)}
                className="px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary text-xs font-mono hover:bg-primary/15 hover:border-primary/60 transition-all active:scale-95"
              >
                {s}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
