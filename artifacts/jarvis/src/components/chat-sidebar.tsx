import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, MessageSquare, X, AlertTriangle, Search, Download } from 'lucide-react';

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function groupByDate(conversations: ConversationSummary[]): { label: string; items: ConversationSummary[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);

  const groups: Record<string, ConversationSummary[]> = {
    'Today': [], 'Yesterday': [], 'Previous 7 Days': [], 'Older': [],
  };

  for (const conv of conversations) {
    const d = new Date(conv.updatedAt);
    if (d >= today) groups['Today'].push(conv);
    else if (d >= yesterday) groups['Yesterday'].push(conv);
    else if (d >= weekAgo) groups['Previous 7 Days'].push(conv);
    else groups['Older'].push(conv);
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
}

function SidebarContent({ conversations, activeId, deleting, searchQuery, onNew, onSelect, onDelete, onExport, onSearchChange, onClearAll, onMobileClose }: SidebarContentProps) {
  const groups = groupByDate(conversations);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-border/20 flex-shrink-0 space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={onNew}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-border/60 text-foreground hover:bg-secondary/80 transition-colors text-[11px] font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            New Chat
          </button>
          {onMobileClose && (
            <button
              onClick={onMobileClose}
              className="lg:hidden p-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/40 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => onSearchChange?.(e.target.value)}
            placeholder="Search conversations…"
            className="sidebar-search-input w-full bg-secondary/50 border border-border text-foreground placeholder:text-muted-foreground/40 text-[11px] pl-7 pr-2 py-1.5 rounded-lg outline-none focus:border-primary/40 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange?.('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground/50 hover:text-foreground transition-colors"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-2 space-y-3 px-2">
        {conversations.length === 0 && (
          <p className="text-center text-[10px] text-muted-foreground/40 mt-6 px-2">
            No conversations yet
          </p>
        )}
        {groups.map(group => (
          <div key={group.label}>
            <p className="text-[9px] font-medium text-muted-foreground/50 px-3 mb-1 uppercase tracking-wider">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(conv => (
                <motion.div
                  key={conv.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  onClick={() => onSelect(conv.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && onSelect(conv.id)}
                  className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 group transition-all text-[11px] relative cursor-pointer rounded-lg ${
                    activeId === conv.id
                      ? 'bg-primary/10 text-foreground'
                      : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 opacity-50" />
                  <div className="flex-1 min-w-0">
                    <span className="leading-snug line-clamp-2 break-words block pr-5">
                      {conv.title}
                    </span>
                    <span className="text-[9px] text-muted-foreground/40 mt-0.5 block">
                      {formatRelativeTime(conv.updatedAt)}
                    </span>
                  </div>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); onExport?.(conv.id); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onExport?.(conv.id); }}}
                    className="absolute right-6 top-2.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/50 hover:text-foreground cursor-pointer"
                    title="Export as text"
                  >
                    <Download className="w-3 h-3" />
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => onDelete(e, conv.id)}
                    onKeyDown={(e) => e.key === 'Enter' && onDelete(e, conv.id)}
                    aria-disabled={deleting === conv.id}
                    className="absolute right-2 top-2.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/50 hover:text-red-500 aria-disabled:opacity-30 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-border/20 flex-shrink-0">
        {conversations.length > 0 && onClearAll ? (
          <button
            onClick={onClearAll}
            className="w-full text-[9px] font-medium text-muted-foreground/40 tracking-wider text-center hover:text-red-500/60 transition-colors py-1"
          >
            Clear All
          </button>
        ) : (
          <p className="text-[9px] font-medium text-muted-foreground/30 tracking-wider text-center">
            Memory Active
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
  onMobileClose?: () => void;
}

export function ChatSidebar({ activeId, onSelect, onNew, refreshTick, mobileOpen, onMobileClose }: ChatSidebarProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredConversations = searchQuery
    ? conversations.filter(c =>
        c.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>('.sidebar-search-input');
        searchInput?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/jarvis/conversations');
      if (res.ok) setConversations(await res.json());
    } catch { /* silent */ }
  }, []);

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
    conversations: filteredConversations,
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
  };

  return (
    <>
      {/* Desktop */}
      <div className="hidden lg:flex flex-col w-60 border-r border-border/20 bg-background flex-shrink-0">
        <SidebarContent {...sharedProps} />
      </div>

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
              className="lg:hidden fixed left-0 top-0 h-full w-72 z-50 bg-background border-r border-border/30 shadow-apple-xl"
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
                  <p className="text-sm font-semibold text-foreground">Delete all conversations?</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-1 leading-relaxed">
                    This will permanently remove every conversation. This action cannot be undone.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setConfirmClearAll(false)}
                  className="px-4 py-2 rounded-lg border border-border/50 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearAll}
                  className="px-4 py-2 rounded-lg bg-red-500 text-white text-[11px] font-medium hover:opacity-90 transition-opacity"
                >
                  Delete all
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
