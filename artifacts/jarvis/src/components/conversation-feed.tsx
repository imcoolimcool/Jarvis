import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  imagePreview?: string; // local object URL shown in the bubble
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
      <div className="p-4 rounded-2xl rounded-tl-sm bg-card border border-border shadow-sm">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="w-2 h-2 rounded-full bg-primary/70"
              animate={{ opacity: [0.3, 1, 0.3], scaleY: [0.6, 1.2, 0.6] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
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
              className={`flex flex-col gap-1.5 max-w-[85%] ${isUser ? 'self-end items-end' : 'self-start items-start'}`}
            >
              {/* Role label */}
              <span className="text-[10px] font-mono text-muted-foreground/50 tracking-widest px-1">
                {isUser ? 'YOU' : 'JARVIS'}
              </span>

              {/* Image preview (user attachments) */}
              {msg.imagePreview && (
                <div className={`rounded-2xl overflow-hidden border border-border max-w-[240px] ${isUser ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}>
                  <img
                    src={msg.imagePreview}
                    alt="Attached"
                    className="block w-full object-cover max-h-48"
                  />
                </div>
              )}

              {/* Text bubble */}
              {msg.content && (
                <div
                  className={`px-4 py-3 rounded-2xl text-sm leading-relaxed font-sans ${
                    isUser
                      ? 'bg-primary text-primary-foreground rounded-tr-sm'
                      : 'bg-card border border-border text-foreground rounded-tl-sm shadow-sm'
                  }`}
                >
                  {msg.content}
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
