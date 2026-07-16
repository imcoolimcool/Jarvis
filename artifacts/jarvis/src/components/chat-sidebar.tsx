import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react';

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface ChatSidebarProps {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  refreshTick: number; // increment to force a refresh
}

export function ChatSidebar({ activeId, onSelect, onNew, refreshTick }: ChatSidebarProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/jarvis/conversations');
      if (res.ok) setConversations(await res.json());
    } catch { /* silent */ }
  }, []);

  useEffect(() => { load(); }, [load, refreshTick]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
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

  return (
    <div className={`flex flex-col border-r border-border/30 bg-background/60 backdrop-blur-md transition-all duration-300 relative flex-shrink-0 ${collapsed ? 'w-10' : 'w-60'}`}>
      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="absolute -right-3 top-6 z-20 w-6 h-6 rounded-full border border-border/50 bg-background flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col flex-1 min-h-0 overflow-hidden"
          >
            {/* Header */}
            <div className="p-3 border-b border-border/30 flex-shrink-0">
              <button
                onClick={onNew}
                className="w-full flex items-center gap-2 px-3 py-2 border border-primary/40 text-primary hover:bg-primary/10 transition-colors font-display tracking-widest text-[10px] group"
              >
                <Plus className="w-3 h-3 group-hover:rotate-90 transition-transform" />
                NEW CHAT
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto py-2 space-y-0.5 px-2">
              {conversations.length === 0 && (
                <p className="text-center text-[10px] text-muted-foreground/40 font-mono tracking-widest mt-6 px-2">
                  NO SESSIONS
                </p>
              )}
              {conversations.map(conv => (
                <motion.button
                  key={conv.id}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  onClick={() => onSelect(conv.id)}
                  className={`w-full text-left px-3 py-2.5 flex items-start gap-2 group transition-all text-[11px] font-mono relative ${
                    activeId === conv.id
                      ? 'bg-primary/15 border-l-2 border-primary text-primary'
                      : 'text-muted-foreground hover:bg-card/50 hover:text-foreground border-l-2 border-transparent'
                  }`}
                >
                  <MessageSquare className="w-3 h-3 mt-0.5 flex-shrink-0 opacity-60" />
                  <span className="flex-1 leading-tight line-clamp-2 break-words pr-4">
                    {conv.title}
                  </span>
                  <button
                    onClick={(e) => handleDelete(e, conv.id)}
                    disabled={deleting === conv.id}
                    className="absolute right-2 top-2.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400 disabled:opacity-30"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </motion.button>
              ))}
            </div>

            {/* Footer label */}
            <div className="p-3 border-t border-border/20 flex-shrink-0">
              <p className="text-[9px] font-mono text-muted-foreground/30 tracking-widest text-center">
                MEMORY ACTIVE
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
