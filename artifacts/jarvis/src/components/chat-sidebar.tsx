import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, MessageSquare, X } from 'lucide-react';

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

// #40: Defined outside ChatSidebar to prevent React re-mounting the list on every refreshTick.
// When SidebarContent was a nested component definition, React saw a new component type on
// every render and unmounted/remounted the entire conversation list.
interface SidebarContentProps {
  conversations: ConversationSummary[];
  activeId: string | null;
  deleting: string | null;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (e: React.MouseEvent | React.KeyboardEvent, id: string) => void;
  onMobileClose?: () => void;
}

function SidebarContent({ conversations, activeId, deleting, onNew, onSelect, onDelete, onMobileClose }: SidebarContentProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-border/30 flex-shrink-0 flex items-center gap-2">
        <button
          onClick={onNew}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border border-primary/40 text-primary hover:bg-primary/10 transition-colors font-display tracking-widest text-[10px] group rounded-md"
        >
          <Plus className="w-3 h-3 group-hover:rotate-90 transition-transform" />
          NEW CHAT
        </button>
        {/* Close button visible only on mobile */}
        {onMobileClose && (
          <button
            onClick={onMobileClose}
            className="lg:hidden p-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-2 space-y-0.5 px-2">
        {conversations.length === 0 && (
          <p className="text-center text-[10px] text-muted-foreground/40 font-mono tracking-widest mt-6 px-2">
            NO SESSIONS
          </p>
        )}
        {conversations.map(conv => (
          <motion.div
            key={conv.id}
            layout
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => onSelect(conv.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onSelect(conv.id)}
            className={`w-full text-left px-3 py-2.5 flex items-start gap-2 group transition-all text-[11px] font-mono relative cursor-pointer rounded-md ${
              activeId === conv.id
                ? 'bg-primary/15 border-l-2 border-primary text-primary'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground border-l-2 border-transparent'
            }`}
          >
            <MessageSquare className="w-3 h-3 mt-0.5 flex-shrink-0 opacity-60" />
            <span className="flex-1 leading-tight line-clamp-2 break-words pr-5">
              {conv.title}
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => onDelete(e, conv.id)}
              onKeyDown={(e) => e.key === 'Enter' && onDelete(e, conv.id)}
              aria-disabled={deleting === conv.id}
              className="absolute right-2 top-2.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/60 hover:text-red-400 aria-disabled:opacity-30 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
            </span>
          </motion.div>
        ))}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-border/20 flex-shrink-0">
        <p className="text-[9px] font-mono text-muted-foreground/30 tracking-widest text-center">
          MEMORY ACTIVE
        </p>
      </div>
    </div>
  );
}

interface ChatSidebarProps {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  refreshTick: number;
  /** Mobile: whether the sidebar drawer is open */
  mobileOpen?: boolean;
  /** Mobile: callback to close the drawer */
  onMobileClose?: () => void;
}

export function ChatSidebar({ activeId, onSelect, onNew, refreshTick, mobileOpen, onMobileClose }: ChatSidebarProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);

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

  const handleSelect = (id: string) => {
    onSelect(id);
    onMobileClose?.();
  };

  const handleNew = () => {
    onNew();
    onMobileClose?.();
  };

  const sharedProps: SidebarContentProps = {
    conversations,
    activeId,
    deleting,
    onNew: handleNew,
    onSelect: handleSelect,
    onDelete: handleDelete,
    onMobileClose,
  };

  return (
    <>
      {/* Desktop sidebar — always visible alongside content */}
      <div className="hidden lg:flex flex-col w-60 border-r border-border/30 bg-background/60 backdrop-blur-md flex-shrink-0">
        <SidebarContent {...sharedProps} />
      </div>

      {/* Mobile drawer — overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onMobileClose}
              className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="lg:hidden fixed left-0 top-0 h-full w-72 z-50 bg-background border-r border-border/50 shadow-2xl"
            >
              <SidebarContent {...sharedProps} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
