import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileText, Copy, Check, RotateCcw, Pencil, X, Send, Mic, Globe, Camera, Monitor, Globe2, Timer, ChevronDown, Image } from 'lucide-react';
import type { Widget } from '@/types/widget';
import { ClockWidget, WeatherWidget, TimerWidget, AlarmWidget, CalendarWidget } from '@/components/widgets';
import { ImageConfirmationCard, ImageGeneratingCard, ScreenShareConfirmationCard, AgentBrowserConfirmationCard } from '@/components/image-confirmation-card';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  file?: { preview?: string; fileName?: string };
  widget?: Widget;
  timestamp?: number; // epoch ms
  image?: string; // base64 data URL of a generated image
  pendingImage?: { // image confirmation prompt waiting for user response
    imagePrompt: string;
    confirmationMessage: string;
  };
  pendingScreenShare?: boolean; // screen share confirmation
  pendingAgentBrowser?: { // agent browser prompt waiting for user query
    confirmationMessage: string;
  };
}

interface ConversationFeedProps {
  messages: ChatMessage[];
  isThinking?: boolean;
  suggestions?: string[];
  onSuggestionClick?: (text: string) => void;
  onRegenerate?: (messageIndex: number) => void;
  onEditMessage?: (messageIndex: number, newContent: string) => void;
  onImageConfirm?: (prompt: string) => void;
  onImageCancel?: () => void;
  generatingImage?: boolean;
  generatingImagePrompt?: string;
  onScreenShareConfirm?: () => void;
  onScreenShareCancel?: () => void;
  onAgentBrowserConfirm?: (query: string) => void;
  onAgentBrowserCancel?: () => void;
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

/** Format a timestamp into a short relative or absolute time string */
function formatTimestamp(ts?: number): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Floating action bar that appears on hover for a message */
function MessageActions({ content, isUser, onCopy, onRegenerate, onEdit }: {
  content: string;
  isUser: boolean;
  onCopy: () => void;
  onRegenerate?: () => void;
  onEdit?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      onCopy();
      setTimeout(() => setCopied(false), 1500);
    });
  }, [content, onCopy]);

  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
      <button
        onClick={handleCopy}
        title="Copy message"
        className="p-1 rounded text-muted-foreground/40 hover:text-foreground hover:bg-muted/50 transition-colors"
      >
        {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
      </button>
      {!isUser && onRegenerate && (
        <button
          onClick={onRegenerate}
          title="Regenerate response"
          className="p-1 rounded text-muted-foreground/40 hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      )}
      {isUser && onEdit && (
        <button
          onClick={onEdit}
          title="Edit message"
          className="p-1 rounded text-muted-foreground/40 hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <Pencil className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

/** Inline editor for user messages — appears when user clicks edit */
function InlineEditor({ content, onSave, onCancel }: {
  content: string;
  onSave: (newText: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(content);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.setSelectionRange(draft.length, draft.length);
  }, []);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <textarea
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSave(draft.trim()); }
          if (e.key === 'Escape') onCancel();
        }}
        rows={Math.min(draft.split('\n').length + 1, 8)}
        className="w-full bg-background border border-primary/40 text-foreground font-mono text-sm px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-primary/20 resize-none"
      />
      <div className="flex items-center gap-1.5 self-end">
        <button onClick={onCancel} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onSave(draft.trim())}
          disabled={!draft.trim() || draft.trim() === content}
          className="p-1 rounded text-primary hover:bg-primary/10 transition-colors disabled:opacity-30"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export function ConversationFeed({
  messages,
  isThinking = false,
  suggestions = [],
  onSuggestionClick,
  onRegenerate,
  onEditMessage,
  onImageConfirm,
  onImageCancel,
  generatingImage = false,
  generatingImagePrompt = '',
  onScreenShareConfirm,
  onScreenShareCancel,
  onAgentBrowserConfirm,
  onAgentBrowserCancel,
}: ConversationFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const isNearBottomRef = useRef(true);

  // Detect manual scroll vs programmatic scroll
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    isNearBottomRef.current = nearBottom;
    setUserScrolledUp(!nearBottom);
  }, []);

  // Smart auto-scroll: only when user hasn't scrolled up
  useEffect(() => {
    if (userScrolledUp) return;
    const frame = requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, isThinking, suggestions, userScrolledUp]);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    setUserScrolledUp(false);
    isNearBottomRef.current = true;
  }, []);

  const showSuggestions =
    !isThinking &&
    suggestions.length > 0 &&
    messages.length > 0 &&
    messages[messages.length - 1]?.role === 'assistant';

  // Better empty state
  const isEmpty = messages.length === 0 && !isThinking;

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 w-full overflow-y-auto px-4 sm:px-6 py-6 space-y-4 flex flex-col scroll-smooth relative z-10"
    >
      {/* Scroll to bottom button */}
      <AnimatePresence>
        {userScrolledUp && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            onClick={scrollToBottom}
            className="sticky bottom-0 z-20 mx-auto -mb-4 flex items-center gap-1 px-3 py-1.5 rounded-full border border-primary/30 bg-background/90 backdrop-blur-sm text-primary text-[10px] font-mono tracking-wider hover:bg-primary/10 transition-all shadow-lg"
          >
            <ChevronDown className="w-3 h-3" />
            Scroll to bottom
          </motion.button>
        )}
      </AnimatePresence>
      {isEmpty && (
        <div className="m-auto text-center flex flex-col items-center gap-8 py-8 px-4 max-w-2xl w-full">
          {/* Animated logo mark */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border border-primary/20 animate-ping" style={{ animationDuration: '3s' }} />
              <div className="absolute inset-2 rounded-full border border-primary/30" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-3 h-3 bg-primary rounded-full animate-pulse" />
              </div>
            </div>
            <div className="space-y-1">
              <h2 className="font-display text-xl font-bold tracking-[0.2em] glow-text">JARVIS</h2>
              <p className="text-[11px] font-mono text-muted-foreground tracking-wider">
                What can I help you with?
              </p>
            </div>
          </div>

          {/* Capability cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full">
            {[
              { icon: Mic, title: 'Voice Chat', desc: 'Speak naturally — Jarvis listens and responds', color: 'text-green-400' },
              { icon: Globe, title: 'Web Search', desc: 'Search the web in real-time for any topic', color: 'text-blue-400' },
              { icon: Camera, title: 'Camera Vision', desc: 'See and identify objects through your camera', color: 'text-purple-400' },
              { icon: Monitor, title: 'Screen Share', desc: 'Share your screen for real-time analysis', color: 'text-orange-400' },
              { icon: Globe2, title: 'Browse Web', desc: 'Jarvis can browse any website for you', color: 'text-cyan-400' },
              { icon: Timer, title: 'Timers & Alarms', desc: 'Set timers, alarms, and check your calendar', color: 'text-yellow-400' },
              { icon: Image, title: 'Image Gen', desc: 'Generate images from text descriptions with Flux', color: 'text-purple-400' },
            ].map(({ icon: Icon, title, desc, color }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.15 + i * 0.06 }}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border/40 bg-card/30 hover:border-primary/30 hover:bg-card/50 transition-all cursor-default group"
              >
                <Icon className={`w-5 h-5 ${color} opacity-70 group-hover:opacity-100 transition-opacity`} />
                <p className="text-[11px] font-display font-semibold tracking-wider text-foreground">{title}</p>
                <p className="text-[10px] font-mono text-muted-foreground/60 leading-snug">{desc}</p>
              </motion.div>
            ))}
          </div>

          {/* Suggestion chips */}
          <div className="flex flex-wrap justify-center gap-2">
            {[
              "What's the weather right now?",
              "Search the web for something interesting",
              "Set a 5 minute timer",
              "Draw me a cat in a top hat",
            ].map((s, i) => (
              <motion.button
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + i * 0.07 }}
                onClick={() => onSuggestionClick?.(s)}
                className="px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-[11px] font-mono hover:bg-primary/15 hover:border-primary/40 transition-all active:scale-95"
              >
                {s}
              </motion.button>
            ))}
          </div>
        </div>
      )}

      <AnimatePresence initial={false}>
        {messages.map((msg, idx) => {
          const isUser = msg.role === 'user';
          const isEditing = editingIdx === idx;
          const ts = msg.timestamp;

          return (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.2 }}
              className={`group flex flex-col gap-1.5 ${
                isUser ? 'max-w-[85%] self-end items-end' : 'w-full self-start items-start'
              }`}
            >
              {/* Role label + timestamp */}
              <div className="flex items-center gap-2 px-1">
                <span className="text-[10px] font-mono text-muted-foreground/50 tracking-widest">
                  {isUser ? 'YOU' : 'JARVIS'}
                </span>
                {ts && (
                  <span className="text-[9px] font-mono text-muted-foreground/30">
                    {formatTimestamp(ts)}
                  </span>
                )}
              </div>

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

              {/* Image confirmation card (pending image request) */}
              {msg.pendingImage && onImageConfirm && onImageCancel && (
                <ImageConfirmationCard
                  imagePrompt={msg.pendingImage.imagePrompt}
                  confirmationMessage={msg.pendingImage.confirmationMessage}
                  onConfirm={onImageConfirm}
                  onCancel={onImageCancel}
                />
              )}

              {/* Screen share confirmation card */}
              {msg.pendingScreenShare && onScreenShareConfirm && onScreenShareCancel && (
                <ScreenShareConfirmationCard
                  onConfirm={onScreenShareConfirm}
                  onCancel={onScreenShareCancel}
                />
              )}

              {/* Agent browser confirmation card */}
              {msg.pendingAgentBrowser && onAgentBrowserConfirm && onAgentBrowserCancel && (
                <AgentBrowserConfirmationCard
                  onConfirm={onAgentBrowserConfirm}
                  onCancel={onAgentBrowserCancel}
                />
              )}

              {/* Generated image display */}
              {msg.image && (
                <div className={`rounded-2xl overflow-hidden border border-purple-400/20 bg-card max-w-[360px] ${isUser ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}>
                  <img src={msg.image} alt="Generated image" className="w-full h-auto" />
                  {msg.content && (
                    <div className="px-3 py-2 border-t border-border/30">
                      <p className="text-[10px] font-mono text-muted-foreground/60 leading-relaxed">{msg.content}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Text bubble or inline editor */}
              {isEditing ? (
                <InlineEditor
                  content={msg.content}
                  onSave={(newText) => { setEditingIdx(null); onEditMessage?.(idx, newText); }}
                  onCancel={() => setEditingIdx(null)}
                />
              ) : msg.content && (
                <div className="relative">
                  <div
                    className={`px-4 py-3 rounded-2xl text-sm leading-relaxed font-sans ${
                      isUser
                        ? 'bg-primary text-primary-foreground rounded-tr-sm'
                        : 'bg-card border border-border text-foreground rounded-tl-sm shadow-sm max-w-[85%]'
                    }`}
                  >
                    {isUser ? (
                      <div className="text-primary-foreground prose prose-sm max-w-none prose-invert prose-a:text-primary-foreground/80 prose-code:bg-white/20 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[12px] prose-headings:text-primary-foreground prose-strong:text-primary-foreground [&_p]:text-primary-foreground [&_*]:text-primary-foreground">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div className="prose prose-sm max-w-none prose-invert prose-a:text-primary prose-code:bg-muted/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[12px] prose-pre:bg-muted/50 prose-pre:border prose-pre:border-border/50 prose-headings:text-foreground prose-strong:text-foreground prose-strong:font-semibold">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>

                  {/* Action buttons — visible on hover */}
                  <MessageActions
                    content={msg.content}
                    isUser={isUser}
                    onCopy={() => {}}
                    onRegenerate={!isUser ? () => onRegenerate?.(idx) : undefined}
                    onEdit={isUser ? () => setEditingIdx(idx) : undefined}
                  />
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

        {/* Generating image indicator */}
        {generatingImage && generatingImagePrompt && (
          <ImageGeneratingCard prompt={generatingImagePrompt} />
        )}
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
