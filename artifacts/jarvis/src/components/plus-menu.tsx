import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Paperclip, Camera, Sparkles, ImageIcon, LayoutGrid, Palette, Music2 } from 'lucide-react';

export type PlusAction =
  | 'attach-file' | 'camera' | 'new-gem' | 'generate-image'
  | 'studios' | 'design-studio' | 'music-studio';

interface PlusMenuProps {
  open: boolean;
  onClose: () => void;
  onAction: (action: PlusAction) => void;
  coords: { top: number; left: number } | null;
  labels: {
    attachFile: string;
    camera: string;
    newGem: string;
    generateImage: string;
  };
}

export function PlusMenu({ open, onClose, onAction, coords, labels }: PlusMenuProps) {
  if (!coords) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed z-50 w-56 rounded-xl border border-border/50 bg-background shadow-xl overflow-hidden max-h-[min(70vh,480px)] flex flex-col"
            style={{ top: coords.top, left: coords.left }}
          >
            <p className="px-3 pt-1.5 pb-0.5 text-[9px] font-mono tracking-widest text-muted-foreground/40 uppercase">Attach</p>
            <Item icon={Paperclip} label={labels.attachFile} onClick={() => onAction('attach-file')} />
            <Item icon={Camera} label={labels.camera} onClick={() => onAction('camera')} />

            <p className="px-3 pt-2 pb-0.5 text-[9px] font-mono tracking-widest text-muted-foreground/40 uppercase">Create</p>
            <Item icon={Sparkles} label={labels.newGem} onClick={() => onAction('new-gem')} />
            <Item icon={ImageIcon} label={labels.generateImage} onClick={() => onAction('generate-image')} />

            <p className="px-3 pt-2 pb-0.5 text-[9px] font-mono tracking-widest text-muted-foreground/40 uppercase">Studios</p>
            <Item icon={LayoutGrid} label="All Studios" accent onClick={() => onAction('studios')} />
            <Item icon={Palette} label="Design Studio" onClick={() => onAction('design-studio')} />
            <Item icon={Music2} label="Music Studio" onClick={() => onAction('music-studio')} />
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function Item({ icon: Icon, label, accent, onClick }: {
  icon: typeof Paperclip; label: string; accent?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[12.5px] transition-colors ${
        accent ? 'text-foreground hover:bg-muted/50' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
      }`}
    >
      <Icon className={`w-4 h-4 flex-shrink-0 ${accent ? 'text-primary' : ''}`} strokeWidth={1.8} />
      {label}
    </button>
  );
}
