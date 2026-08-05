import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileText, Copy, Check, RotateCcw, Pencil, X, Send, Globe, Timer, ChevronDown, Image, Eye, EyeOff, Sunrise, BrainCircuit, Volume2, ThumbsUp, ThumbsDown, Share, MoreHorizontal, ShieldCheck, Loader2, Wand2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { haptics } from '@/lib/haptics';
import type { Widget, VerifyClaim, TerminalResult } from '@/types/widget';
import { ClockWidget, WeatherWidget, TimerWidget, AlarmWidget, CalendarWidget, ImageResultsWidget, DateWidget, CalculatorWidget, DefineWidget, UnitConverterWidget, CurrencyWidget, MapWidget, RandomWidget, MusicWidget } from '@/components/widgets';
import type { FileEdit } from '@/types/widget';
import { FigmaWidget, type FigmaTokenCard } from '@/components/widgets';
import { CommandCard } from '@/components/widgets/CommandCard';
import { FileEditCard } from '@/components/widgets/FileEditCard';
import { ImageConfirmationCard, ImageGeneratingCard, ScreenShareConfirmationCard, AgentBrowserConfirmationCard, SourceCodeConfirmationCard, BuildModeConfirmationCard } from '@/components/image-confirmation-card';

export interface ChatMessage {
  /** Stable client-side id — avoids duplicate-key warnings during stream updates. */
  id?: string;
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
  pendingSourceCode?: { // "Use code for this answer?" confirmation
    userText: string;
  };
  pendingBuildMode?: { // "Open Build Mode?" confirmation
    userText: string;
  };
  /** Thinking mode — private reasoning chain shown in a collapsible block. */
  reasoning?: string;
  /** Terminal command cards the AI ran while answering (from run_terminal). */
  terminalResults?: TerminalResult[];
  /** File edits the AI made while answering (from write_source_file). */
  fileEdits?: FileEdit[];
  /** Figma design data the AI fetched (from figma_design tool). */
  figma?: FigmaTokenCard;
}

interface ConversationFeedProps {
  messages: ChatMessage[];
  isThinking?: boolean;
  suggestions?: string[];
  onSuggestionClick?: (text: string) => void;
  onRegenerate?: (messageIndex: number) => void;
  onEditMessage?: (messageIndex: number, newContent: string) => void;
  /** Read a message aloud (TTS) from the action row. */
  onSpeak?: (text: string) => void;
  onImageConfirm?: (prompt: string) => void;
  onImageCancel?: () => void;
  onEditImage?: (image: string) => void;
  generatingImage?: boolean;
  generatingImagePrompt?: string;
  onScreenShareConfirm?: () => void;
  onScreenShareCancel?: () => void;
  onAgentBrowserConfirm?: (query: string) => void;
  onAgentBrowserCancel?: () => void;
  onSourceCodeConfirm?: () => void;
  onSourceCodeCancel?: () => void;
  onBuildModeConfirm?: () => void;
  onBuildModeCancel?: () => void;
}

/** Collapsible "Thinking" block — shows Jarvis's private reasoning pass.
 *  Collapsed: a quiet row with a right-pointing chevron. Expanded: the chevron
 *  turns downward (⌄) and the reasoning text slides open. */
function ThinkingBlock({ reasoning, label }: { reasoning: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border/40 bg-muted/25 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40 active:bg-muted/50"
      >
        <BrainCircuit className="w-3.5 h-3.5 text-muted-foreground/70 flex-shrink-0" strokeWidth={2} />
        <span className="text-[11px] font-medium text-muted-foreground tracking-wide flex-1">{label}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-muted-foreground/50 transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            <div className="px-3 pt-2 pb-3 text-xs leading-relaxed text-muted-foreground/80 whitespace-pre-wrap border-t border-border/25">
              {reasoning}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TypingIndicator() {
  return (
    <motion.div
      key="typing"
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="self-start px-1"
    >
      <div className="flex items-end gap-[3px] h-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.span
            key={i}
            className="w-[3px] rounded-full bg-foreground/35"
              animate={{ height: [6, 18, 6], opacity: [0.4, 0.9, 0.4] }}
              transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.1, ease: 'easeInOut' }}
            />
          ))}
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
    case 'images':
      return <ImageResultsWidget query={widget.query} results={widget.results} />;
    case 'date':
      return <DateWidget />;
    case 'calculator':
      return <CalculatorWidget expression={widget.expression} result={widget.result} />;
    case 'define':
      return <DefineWidget word={widget.word} phonetic={widget.phonetic} meanings={widget.meanings} />;
    case 'unit':
      return <UnitConverterWidget value={widget.value} fromUnit={widget.fromUnit} toUnit={widget.toUnit} category={widget.category} label={widget.label} />;
    case 'currency':
      return <CurrencyWidget from={widget.from} to={widget.to} amount={widget.amount} rate={widget.rate} updated={widget.updated} />;
    case 'map':
      return <MapWidget query={widget.query} lat={widget.lat} lon={widget.lon} displayName={widget.displayName} />;
    case 'random':
      return <RandomWidget kind={widget.kind} value={widget.value} label={widget.label} />;
    case 'music':
      return <MusicWidget composition={widget.composition} />;
    default:
      return null;
  }
}

/**
 * Extract the first HTML code block (```html ... ```) from a message.
 * Returns null when there is no renderable HTML snippet.
 */
function extractHtmlBlock(content: string): string | null {
  const match = content.match(/```html\s*\n([\s\S]*?)```/i);
  if (!match || !match[1]?.trim()) return null;
  const html = match[1].trim();
  // Only treat it as an artifact when it clearly looks like a document/app,
  // not a one-line fragment.
  if (html.length < 40 || (!/^\s*<!doctype/i.test(html) && !/<(html|body|div|h1|h2|h3|p|button|input|table|ul|ol|style|script|svg)[\s>]/i.test(html))) {
    return null;
  }
  return html;
}

/** Fact-check result card shown under a message after the user taps "Check". */
function FactCheckCard({ result }: { result: VerifyClaim[] }) {
  const supported = result.filter((c) => c.verdict === 'supported').length;
  return (
    <div className="mt-2 rounded-xl border border-border/40 bg-muted/25 p-3 text-xs space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium">
        <ShieldCheck className={`w-3.5 h-3.5 ${supported === result.length ? 'text-green-500' : 'text-yellow-500'}`} />
        <span className="text-foreground/80">Fact-check · {supported}/{result.length} claims match web sources</span>
      </div>
      {result.map((c, i) => (
        <div key={i} className="space-y-1">
          <p className="text-foreground/70 leading-snug">“{c.claim}”</p>
          <p className={`text-[10px] font-medium ${c.verdict === 'supported' ? 'text-green-500' : 'text-yellow-500'}`}>
            {c.verdict === 'supported' ? '✓ Supported' : '◦ Not clearly confirmed'}
          </p>
          {c.evidence.slice(0, 2).map((e, j) => (
            <a
              key={j}
              href={e.url}
              target="_blank"
              rel="noreferrer noopener"
              className="block text-[10px] text-primary/70 hover:text-primary transition-colors truncate"
            >
              {e.title || e.url}
            </a>
          ))}
        </div>
      ))}
    </div>
  );
}

/** ChatGPT-style always-visible action row under a message. */
function ChatActionRow({ content, isUser, onSpeak, onRegenerate, onEdit }: {
  content: string;
  isUser: boolean;
  onSpeak?: (text: string) => void;
  onRegenerate?: () => void;
  onEdit?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [verifyState, setVerifyState] = useState<'idle' | 'checking' | 'done'>('idle');
  const [verifyResult, setVerifyResult] = useState<VerifyClaim[] | null>(null);

  const handleVerify = useCallback(async () => {
    if (!content.trim() || verifyState === 'checking') return;
    haptics.light();
    setVerifyState('checking');
    try {
      const res = await fetch('/api/jarvis/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: content }),
      });
      const data = await res.json();
      setVerifyResult(Array.isArray(data.claims) ? data.claims : []);
    } catch {
      setVerifyResult([]);
    }
    setVerifyState('done');
  }, [content, verifyState]);

  const handleCopy = useCallback(() => {
    haptics.light();
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [content]);

  const handleShare = useCallback(() => {
    haptics.light();
    if (typeof navigator.share === 'function') {
      navigator.share({ text: content }).catch(() => {});
    } else {
      navigator.clipboard.writeText(content).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    }
  }, [content]);

  const iconBtn = "p-1.5 rounded-full text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors active:scale-90";

  return (
    <div className="flex items-center gap-0.5 mt-1.5">
      <button onClick={handleCopy} title="Copy" className={iconBtn}>
        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
      </button>
      {!isUser && onSpeak && (
        <button onClick={() => onSpeak(content)} title="Read aloud" className={iconBtn}>
          <Volume2 className="w-4 h-4" />
        </button>
      )}
      <button
        onClick={() => { haptics.light(); setFeedback(f => f === 'up' ? null : 'up'); }}
        title="Good response"
        className={`${iconBtn} ${feedback === 'up' ? 'text-primary' : ''}`}
      >
        <ThumbsUp className={`w-4 h-4 ${feedback === 'up' ? 'fill-current' : ''}`} />
      </button>
      <button
        onClick={() => { haptics.light(); setFeedback(f => f === 'down' ? null : 'down'); }}
        title="Bad response"
        className={`${iconBtn} ${feedback === 'down' ? 'text-primary' : ''}`}
      >
        <ThumbsDown className={`w-4 h-4 ${feedback === 'down' ? 'fill-current' : ''}`} />
      </button>
      <button onClick={handleShare} title="Share" className={iconBtn}>
        <Share className="w-4 h-4" />
      </button>
      {!isUser && (
        <button
          onClick={handleVerify}
          disabled={verifyState === 'checking'}
          title="Fact-check with live web search"
          className={`${iconBtn} ${verifyState === 'done' ? 'text-green-500' : ''} disabled:opacity-50`}
        >
          {verifyState === 'checking' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
        </button>
      )}
      <div className="relative">
        <button onClick={() => { haptics.light(); setMenuOpen(o => !o); }} title="More" className={iconBtn}>
          <MoreHorizontal className="w-4 h-4" />
        </button>
        <AnimatePresence>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.96 }}
                transition={{ duration: 0.12 }}
                className="absolute left-0 bottom-full mb-1 z-40 w-40 p-1 rounded-xl border border-border/50 bg-background shadow-apple-lg overflow-hidden"
              >
                {isUser && onEdit && (
                  <button
                    onClick={() => { setMenuOpen(false); onEdit(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-foreground hover:bg-muted/60 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" /> Edit message
                  </button>
                )}
                {!isUser && onRegenerate && (
                  <button
                    onClick={() => { setMenuOpen(false); onRegenerate(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-foreground hover:bg-muted/60 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" /> Regenerate
                  </button>
                )}
                <button
                  onClick={() => { setMenuOpen(false); handleCopy(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-foreground hover:bg-muted/60 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5 text-muted-foreground" /> Copy
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
      {verifyState === 'done' && verifyResult && verifyResult.length > 0 && (
        <FactCheckCard result={verifyResult} />
      )}
    </div>
  );
}

/** Artifact preview — renders an HTML code block in a sandboxed iframe. */
function ArtifactPreview({ html }: { html: string }) {
  const [open, setOpen] = useState(false);
  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box;margin:0}body{font-family:-apple-system,'SF Pro Display',system-ui,sans-serif;padding:16px;color:#1c1c1e;background:#fff}</style></head><body>${html}</body></html>`;
  return (
    <div className="w-full max-w-xl mt-1">
      <button
        onClick={() => { haptics.light(); setOpen(o => !o); }}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-primary/25 bg-primary/5 text-primary text-[10px] font-mono hover:bg-primary/15 transition-all active:scale-95"
      >
        {open ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
        {open ? 'Hide preview' : 'Preview'}
      </button>
      {open && (
        <div className="mt-1.5 rounded-xl overflow-hidden border border-border/60 shadow-apple-md">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-muted/40 border-b border-border/30">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
            <span className="ml-2 text-[9px] font-mono text-muted-foreground/60">artifact.html</span>
          </div>
          <iframe
            title="HTML artifact preview"
            srcDoc={srcDoc}
            sandbox="allow-scripts"
            className="w-full bg-white"
            style={{ height: 320 }}
          />
        </div>
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
  onSpeak,
  onImageConfirm,
  onImageCancel,
  onEditImage,
  generatingImage = false,
  generatingImagePrompt = '',
  onScreenShareConfirm,
  onScreenShareCancel,
  onAgentBrowserConfirm,
  onAgentBrowserCancel,
  onSourceCodeConfirm,
  onSourceCodeCancel,
  onBuildModeConfirm,
  onBuildModeCancel,
}: ConversationFeedProps) {
  const { t } = useI18n();
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
            onClick={() => { haptics.light(); scrollToBottom(); }}
            className="sticky bottom-0 z-20 mx-auto -mb-4 flex items-center gap-1 px-3 py-1.5 rounded-full border border-primary/30 bg-background/90 backdrop-blur-sm text-primary text-[10px] font-mono tracking-wider hover:bg-primary/10 transition-all shadow-lg"
          >
            <ChevronDown className="w-3 h-3" />
            Scroll to bottom
          </motion.button>
        )}
      </AnimatePresence>
      {isEmpty && (
        <div className="m-auto flex flex-col items-stretch justify-center gap-6 py-6 sm:py-8 px-4 w-full max-w-xl">
          {/* Compact brand mark */}
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border border-primary/20 animate-ping" style={{ animationDuration: '3s' }} />
              <div className="absolute inset-1.5 rounded-full border border-primary/30" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-2.5 h-2.5 bg-primary rounded-full animate-pulse" />
              </div>
            </div>
            <p className="text-[11px] font-mono text-muted-foreground tracking-wider">
              {t('header.title')}
            </p>
          </div>

          {/* Quick actions — ChatGPT-style suggestion rows */}
          <div className="space-y-1.5 w-full">
            {[
              { icon: Sunrise, label: t('home.goodMorning'), primary: true },
              { icon: Image, label: t('home.createImage') },
              { icon: Pencil, label: t('home.write') },
              { icon: Globe, label: t('home.searchWeb') },
            ].map(({ icon: Icon, label, primary }: { icon: any; label: string; primary?: boolean }, i) => (
              <motion.button
                key={label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.1 + i * 0.05 }}
                onClick={() => { haptics.light(); onSuggestionClick?.(label); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left border transition-all group ${
                  primary
                    ? 'border-primary/20 bg-primary/5 hover:border-primary/40 hover:bg-primary/10'
                    : 'border-transparent hover:border-border/40 hover:bg-card/40'
                }`}
              >
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 ${
                  primary
                    ? 'bg-primary/15 text-primary'
                    : 'bg-secondary/60 text-muted-foreground group-hover:text-primary'
                }`}>
                  <Icon className="w-4 h-4" />
                </span>
                <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                  {label}
                </span>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      <AnimatePresence initial={false}>
        {messages.map((msg, idx) => {
          const isUser = msg.role === 'user';
          const isEditing = editingIdx === idx;

          return (
            <motion.div
              key={msg.id ?? idx}
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.2 }}
              className={`group flex flex-col gap-1.5 ${
                isUser ? 'max-w-[85%] self-end items-end' : 'w-full self-start items-start'
              }`}
            >
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

              {/* "Use code for this answer?" confirmation card */}
              {msg.pendingSourceCode && onSourceCodeConfirm && onSourceCodeCancel && (
                <SourceCodeConfirmationCard
                  userText={msg.pendingSourceCode.userText}
                  onConfirm={onSourceCodeConfirm}
                  onCancel={onSourceCodeCancel}
                />
              )}
              {msg.pendingBuildMode && onBuildModeConfirm && onBuildModeCancel && (
                <BuildModeConfirmationCard
                  userText={msg.pendingBuildMode.userText}
                  onConfirm={onBuildModeConfirm}
                  onCancel={onBuildModeCancel}
                />
              )}

              {/* Generated image display */}
              {msg.image && (
                <div className={`relative group rounded-2xl overflow-hidden border border-purple-400/20 bg-card max-w-[360px] ${isUser ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}>
                  <img src={msg.image} alt="Generated image" className="w-full h-auto" />
                  {onEditImage && (
                    <button
                      onClick={() => onEditImage(msg.image!)}
                      className="absolute top-2 right-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/60 backdrop-blur text-white text-[10px] font-medium opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-all active:scale-95"
                    >
                      <Wand2 className="w-3 h-3" /> Edit
                    </button>
                  )}
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
              ) : (
                <div className="relative">
                  {/* Thinking mode — collapsible private reasoning above the answer */}
                  {!isUser && msg.reasoning && (
                    <div className="mb-2">
                      <ThinkingBlock reasoning={msg.reasoning} label={t('feed.thinking')} />
                    </div>
                  )}
                  {msg.content && (
                  <div
                    className={`text-[15px] leading-relaxed font-sans ${
                      isUser
                        ? 'bg-[#e9f1fc] dark:bg-primary/25 text-foreground rounded-2xl rounded-br-md px-4 py-2.5 max-w-[85%]'
                        : 'text-foreground max-w-full'
                    }`}
                  >
                    {isUser ? (
                      <div className="prose prose-sm max-w-none dark:prose-invert prose-a:text-primary prose-code:bg-muted/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[12px] prose-headings:text-foreground prose-strong:text-foreground [&_*]:text-foreground">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div className="prose prose-sm max-w-none dark:prose-invert prose-a:text-primary prose-code:bg-muted/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[12px] prose-pre:bg-muted/50 prose-pre:border prose-pre:border-border/50 prose-headings:text-foreground prose-strong:text-foreground prose-strong:font-semibold">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                  )}

                  {/* ChatGPT-style action row */}
                  <ChatActionRow
                    content={msg.content}
                    isUser={isUser}
                    onSpeak={!isUser ? onSpeak : undefined}
                    onRegenerate={!isUser ? () => onRegenerate?.(idx) : undefined}
                    onEdit={isUser ? () => setEditingIdx(idx) : undefined}
                  />
                </div>
              )}

              {/* Artifact preview — HTML code blocks render in a sandboxed iframe */}
              {!isUser && msg.content && extractHtmlBlock(msg.content) && (
                <ArtifactPreview html={extractHtmlBlock(msg.content)!} />
              )}

              {/* Widget — only for assistant messages */}
              {!isUser && msg.widget && (
                <div className="w-full max-w-xl">
                  <InlineWidget widget={msg.widget} />
                </div>
              )}

              {/* Terminal command cards the AI ran — clean minimal boxes */}
              {!isUser && msg.terminalResults && msg.terminalResults.length > 0 && (
                <div className="w-full max-w-xl">
                  {msg.terminalResults.map((tr, i) => <CommandCard key={i} result={tr} />)}
                  {msg.fileEdits?.map((ed, i) => (
                    <FileEditCard key={`fe-${ed.path}-${i}`} edit={ed} />
                  ))}
                  {msg.figma && <FigmaWidget data={msg.figma} />}
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
                onClick={() => { haptics.light(); onSuggestionClick?.(s); }}
                className="px-2.5 sm:px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary text-[10px] sm:text-xs font-mono hover:bg-primary/15 hover:border-primary/60 transition-all active:scale-95 text-center whitespace-normal"
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
