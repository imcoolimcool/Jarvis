import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ConversationFeedProps {
  messages: ChatMessage[];
  isThinking?: boolean;
}

function TypingIndicator() {
  return (
    <motion.div
      key="typing"
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="max-w-[85%] self-start"
    >
      <div className="p-5 rounded-xl backdrop-blur-sm bg-card/80 border border-border shadow-[0_0_15px_rgba(0,0,0,0.5)]">
        <div className="text-[10px] tracking-[0.2em] opacity-60 mb-3 font-display flex items-center gap-2 text-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
          SYSTEM_RESPONSE
        </div>
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="w-2 h-2 rounded-full bg-primary/70"
              animate={{ opacity: [0.3, 1, 0.3], scaleY: [0.6, 1.2, 0.6] }}
              transition={{
                duration: 0.9,
                repeat: Infinity,
                delay: i * 0.18,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

export function ConversationFeed({ messages, isThinking = false }: ConversationFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 w-full overflow-y-auto px-6 py-8 space-y-6 flex flex-col scroll-smooth relative z-10"
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
        {messages.map((msg, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className={`max-w-[85%] p-5 rounded-xl backdrop-blur-sm ${
              msg.role === 'user'
                ? 'self-end bg-primary/10 border border-primary/30 text-primary'
                : 'self-start bg-card/80 border border-border text-foreground shadow-[0_0_15px_rgba(0,0,0,0.5)]'
            }`}
          >
            <div className="text-[10px] tracking-[0.2em] opacity-60 mb-2 font-display flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
              {msg.role === 'user' ? 'USER_INPUT' : 'SYSTEM_RESPONSE'}
            </div>
            <div className="font-mono text-sm leading-relaxed whitespace-pre-wrap">
              {msg.content}
            </div>
          </motion.div>
        ))}

        {isThinking && <TypingIndicator />}
      </AnimatePresence>
    </div>
  );
}
