import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { haptics } from '@/lib/haptics';
import {
  Trash2,
  MessageCircle,
  MessagesSquare,
  X,
  AlertTriangle,
  Search,
  Download,
  Library,
  MessageSquarePlus,
  SlidersHorizontal,
  Compass,
} from 'lucide-react';
import { useI18n, type TranslationKey } from '@/lib/i18n';

type TFunc = (key: TranslationKey, params?: Record<string, string | number>) => string;

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  snippet?: string;
}

function formatRelativeTime(dateStr: string, t: TFunc): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return t('time.justNow');
  if (diffMin < 60) return t('time.mAgo', { n: diffMin });
  if (diffHr < 24) return t('time.hAgo', { n: diffHr });
  if (diffDay === 1) return t('time.yesterday');
  if (diffDay < 7) return t('time.dAgo', { n: diffDay });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Render a human-readable title, recovering from accidental JSON blobs. */
function formatConversationTitle(title: string | undefined | null): string {
  if (!title || title.trim() === '') return 'New Conversation';
  let trimmed = title.trim().replace(/^```json\s*|^```.*\n?|```$/g, '').trim();

  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    const fieldMatch = trimmed.match(/['"]?(text|title|message|content)['"]?\s*[:=]\s*['"]([^'"]+)['"]/i);
    if (fieldMatch?.[2]) {
      return fieldMatch[2].trim();
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') return parsed.trim() || 'New Conversation';
      if (parsed && typeof parsed === 'object') {
        const text = parsed.text || parsed.title || parsed.message || parsed.content;
        if (typeof text === 'string' && text.trim()) return text.trim();
      }
    } catch { /* fall through to raw title */ }
  }

  trimmed = trimmed.replace(/^["']|["']$/g, '').trim();
  return trimmed || 'New Conversation';
}

function groupByDate(conversations: ConversationSummary[], t: TFunc): { label: string; items: ConversationSummary[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);

  const groups: Record<string, ConversationSummary[]> = {
    [t('sidebar.today')]: [],
    [t('sidebar.yesterday')]: [],
    [t('sidebar.previous7Days')]: [],
    [t('sidebar.older')]: [],
  };

  for (const conv of conversations) {
    const d = new Date(conv.updatedAt);
    if (d >= today) groups[t('sidebar.today')].push(conv);
    else if (d >= yesterday) groups[t('sidebar.yesterday')].push(conv);
    else if (d >= weekAgo) groups[t('sidebar.previous7Days')].push(conv);
    else groups[t('sidebar.older')].push(conv);
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}

interface SidebarContentProps {
  conversations: ConversationSummary[];
  activeId: string | null;
  deleting: string | null;
  searchQuery: string;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (e: React.MouseEvent | React.KeyboardEvent, id: string) => void;
  onExport?: (id: string) => void;
  onSearchChange?: (query: string) => void;
  onClearAll?: () => void;
  onMobileClose?: () => void;
  onOpenSettings?: () => void;
  onNavigate?: (mode: 'chat' | 'agent' | 'camera') => void;
}

function SidebarContent({ conversations, activeId, deleting, searchQuery, onNew, onSelect, onDelete, onExport, onSearchChange, onClearAll, onMobileClose, onOpenSettings, onNavigate }: SidebarContentProps) {
  const { t } = useI18n();
  const groups = groupByDate(conversations, t);

  const navItems = [
    { icon: MessagesSquare, label: t('sidebar.chat'), mode: 'chat' as const },
    { icon: Compass, label: t('sidebar.navBrowser'), mode: 'agent' as const },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header — ChatGPT style title + circular search */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight text-foreground">{t('header.title')}</h2>
        <button
          onClick={() => document.querySelector<HTMLInputElement>('.sidebar-search-input')?.focus()}
          className="w-8 h-8 rounded-full bg-secondary/70 hover:bg-secondary text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
          aria-label={t('header.search')}
        >
          <Search className="w-4 h-4" />
        </button>
      </div>

      {/* Nav links — actually switch modes now (Chat / Browser / Camera) */}
      <nav className="px-2 space-y-0.5">
        {navItems.map(({ icon: Icon, label, mode }) => (
          <button
            key={label}
            onClick={() => { haptics.light(); onNavigate?.(mode); onMobileClose?.(); }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            <Icon className="w-[18px] h-[18px]" strokeWidth={1.8} />
            {label}
          </button>
        ))}
      </nav>

      {/* Search */}
      <div className="px-4 pt-3 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => onSearchChange?.(e.target.value)}
            placeholder={t('sidebar.searchPlaceholder')}
            className="sidebar-search-input w-full bg-secondary/50 border border-transparent focus:border-border/60 text-foreground placeholder:text-muted-foreground/50 text-[13px] pl-9 pr-8 py-2 font-rounded rounded-full outline-none transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange?.('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground/50 hover:text-foreground transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Recent items */}
      <div className="px-4 pt-1 pb-1">
        <p className="text-[11px] font-semibold text-muted-foreground tracking-tight">{t('sidebar.recentItems')}</p>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1 space-y-3 px-2">
        {conversations.length === 0 && (
          <p className="text-center text-[11px] text-muted-foreground/70 mt-6 px-2">
            {t('sidebar.noConversations')}
          </p>
        )}
        {groups.map(group => (
          <div key={group.label}>
            <p className="text-[10px] font-semibold text-muted-foreground/70 px-3 mb-1 tracking-wide">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(conv => (
                <motion.div
                  key={conv.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  onClick={() => { haptics.light(); onSelect(conv.id); }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && onSelect(conv.id)}
                  className={`w-full text-left px-3 py-2 flex items-start gap-2.5 group transition-all text-[13px] relative cursor-pointer rounded-lg ${
                    activeId === conv.id
                      ? 'bg-primary/10 text-foreground'
                      : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
                  }`}
                >
                  <MessageCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 opacity-40" />
                  <div className="flex-1 min-w-0">
                    <span className="leading-snug line-clamp-2 break-words block pr-5">
                      {formatConversationTitle(conv.title)}
                    </span>
                    {conv.snippet && (
                      <span className="text-[10px] text-muted-foreground/50 mt-0.5 block line-clamp-1 break-words italic">
                        {conv.snippet}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground/40 mt-0.5 block">
                      {formatRelativeTime(conv.updatedAt, t)}
                    </span>
                  </div>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { haptics.light(); e.stopPropagation(); onExport?.(conv.id); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onExport?.(conv.id); }}}
                    className="absolute right-6 top-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/50 hover:text-foreground cursor-pointer"
                    title="Export as text"
                  >
                    <Download className="w-3 h-3" />
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { haptics.medium(); onDelete(e, conv.id); }}
                    onKeyDown={(e) => e.key === 'Enter' && onDelete(e, conv.id)}
                    aria-disabled={deleting === conv.id}
                    className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/50 hover:text-red-500 aria-disabled:opacity-30 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer — blue Chat pill + settings gear (ChatGPT style) */}
      <div className="p-3 border-t border-border/20 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { haptics.light(); onNew(); }}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 font-rounded rounded-full bg-primary text-primary-foreground hover:opacity-90 transition-opacity text-sm font-semibold shadow-sm"
          >
            <MessageSquarePlus className="w-4 h-4" strokeWidth={2} />
            {t('sidebar.chat')}
          </button>
          <button
            onClick={() => { haptics.light(); onOpenSettings?.(); }}
            className="w-10 h-10 rounded-full border border-border/50 text-muted-foreground hover:text-foreground hover:bg-secondary/70 flex items-center justify-center transition-colors"
            aria-label={t('header.settings')}
          >
            <SlidersHorizontal className="w-[18px] h-[18px]" strokeWidth={1.8} />
          </button>
        </div>
        {conversations.length > 0 && onClearAll ? (
          <button
            onClick={() => { haptics.medium(); onClearAll(); }}
            className="w-full text-[10px] font-medium text-muted-foreground/40 tracking-wider text-center hover:text-red-500/60 transition-colors py-1.5 mt-1"
          >
            {t('sidebar.clearAll')}
          </button>
        ) : (
          <p className="text-[10px] font-medium text-muted-foreground/30 tracking-wider text-center py-1.5 mt-1">
            {t('sidebar.memoryActive')}
          </p>
        )}
      </div>
    </div>
  );
}

interface ChatSidebarProps {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  refreshTick: number;
  mobileOpen?: boolean;
  desktopOpen?: boolean;
  onMobileClose?: () => void;
  onOpenSettings?: () => void;
  onNavigate?: (mode: 'chat' | 'agent' | 'camera') => void;
}

export function ChatSidebar({ activeId, onSelect, onNew, refreshTick, mobileOpen, desktopOpen = true, onMobileClose, onOpenSettings, onNavigate }: ChatSidebarProps) {
  const { t } = useI18n();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');


  const load = useCallback(async () => {
    try {
      // With an active query, search across titles AND message contents
      // (episodic memory) instead of just filtering titles client-side.
      const url = searchQuery
        ? `/api/jarvis/conversations/search?q=${encodeURIComponent(searchQuery)}`
        : '/api/jarvis/conversations';
      const res = await fetch(url);
      if (res.ok) setConversations(await res.json());
    } catch { /* silent */ }
  }, [searchQuery]);

  useEffect(() => { load(); }, [load, refreshTick]);

  const handleDelete = async (e: React.MouseEvent | React.KeyboardEvent, id: string) => {
    e.stopPropagation();
    setDeleting(id);
    try {
      await fetch(`/api/jarvis/conversations/${id}`, { method: 'DELETE' });
      setConversations(prev => prev.filter(c => c.id !== id));
      if (activeId === id) onNew();
    } finally {
      setDeleting(null);
    }
  };

  const handleClearAll = async () => {
    try {
      await fetch('/api/jarvis/conversations', { method: 'DELETE' });
      setConversations([]);
      onNew();
    } finally {
      setConfirmClearAll(false);
    }
  };

  const handleSelect = (id: string) => {
    onSelect(id);
    onMobileClose?.();
  };

  const handleNew = () => {
    onNew();
    onMobileClose?.();
  };

  const handleExport = async (id: string) => {
    try {
      const res = await fetch(`/api/jarvis/conversations/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      const lines = [
        `# ${data.title}`,
        '',
        ...(data.messages ?? []).map((m: { role: string; content: string }) => {
          const label = m.role === 'user' ? 'YOU' : 'JARVIS';
          return `**${label}:**\n${m.content}`;
        }),
      ];
      const text = lines.join('\n');
      await navigator.clipboard.writeText(text);
      const blob = new Blob([text], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(data.title || 'conversation').replace(/[^a-z0-9]/gi, '-').slice(0, 50)}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* silent */ }
  };

  const sharedProps: SidebarContentProps = {
    conversations,
    activeId,
    deleting,
    searchQuery,
    onNew: handleNew,
    onSelect: handleSelect,
    onDelete: handleDelete,
    onExport: handleExport,
    onSearchChange: setSearchQuery,
    onClearAll: () => setConfirmClearAll(true),
    onMobileClose,
    onOpenSettings,
    onNavigate,
  };

  return (
    <>
      {/* Desktop */}
      <AnimatePresence initial={false}>
        {desktopOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 256, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="hidden lg:flex flex-col border-r border-border/30 bg-background/70 backdrop-blur-2xl flex-shrink-0 overflow-hidden"
          >
            <div className="w-64 h-full flex flex-col">
              <SidebarContent {...sharedProps} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onMobileClose}
              className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="lg:hidden fixed left-0 top-0 h-full w-[85vw] max-w-[320px] z-50 liquid-glass shadow-apple-xl"
            >
              <SidebarContent {...sharedProps} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Clear all confirmation */}
      <AnimatePresence>
        {confirmClearAll && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setConfirmClearAll(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={e => e.stopPropagation()}
              className="bg-card border border-border/60 rounded-xl p-5 max-w-sm w-full shadow-apple-xl space-y-4"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{t('sidebar.deleteAllTitle')}</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-1 leading-relaxed">
                    {t('sidebar.deleteAllDesc')}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setConfirmClearAll(false)}
                  className="px-4 py-2 rounded-lg border border-border/50 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
                >
                  {t('sidebar.cancel')}
                </button>
                <button
                  onClick={handleClearAll}
                  className="px-4 py-2 rounded-lg bg-red-500 text-white text-[11px] font-medium hover:opacity-90 transition-opacity"
                >
                  {t('sidebar.deleteAll')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
