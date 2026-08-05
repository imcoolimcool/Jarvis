import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Music2, RefreshCw, Heart, Sun, Moon, Swords, CloudRain } from 'lucide-react';
import type { MusicComposition, MusicNote } from '@/types/widget';
import { MusicWidget } from '@/components/widgets/MusicWidget';

interface MusicStudioProps {
  open: boolean;
  onClose: () => void;
}

interface MoodCfg {
  tempo: number;
  root: string;
  scale: number[];
  chords: number[];
  bass: number[];
  title: string;
  drum: number[];
}

const MOODS: Record<MusicComposition['mood'], MoodCfg> = {
  happy: { tempo: 128, root: 'C', scale: [0, 2, 4, 5, 7, 9, 11], chords: [0, 5, 7, 9], bass: [0, 5, 7, 9], title: 'Sunshine Groove', drum: [1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 1] },
  chill: { tempo: 88, root: 'A', scale: [0, 2, 3, 5, 7, 9, 10], chords: [9, 5, 7, 0], bass: [9, 5, 7, 0], title: 'Midnight Drive', drum: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 1, 0] },
  epic: { tempo: 140, root: 'D', scale: [0, 2, 3, 5, 7, 8, 10], chords: [5, 0, 7, 3], bass: [5, 0, 7, 3], title: 'Rise of Heroes', drum: [1, 0, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1, 1, 1, 0] },
  sad: { tempo: 72, root: 'E', scale: [0, 2, 3, 5, 7, 8, 10], chords: [0, 8, 5, 3], bass: [0, 8, 5, 3], title: 'Rainy Window', drum: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1] },
};

function seededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function generateComposition(mood: MusicComposition['mood'], seed: number): MusicComposition {
  const cfg = MOODS[mood];
  const rnd = seededRandom(seed);
  const chords = cfg.chords.map((semi) => `${cfg.root}${semi >= 12 ? 4 : 3}`);
  const bass = cfg.bass.map((semi) => `${cfg.root}${semi >= 12 ? 3 : 2}`);
  const melody: MusicNote[] = [];
  let time = 0;
  for (let bar = 0; bar < 4; bar++) {
    for (let beat = 0; beat < 4; beat++) {
      if (rnd() < 0.28) { time += 1; continue; }
      const semi = cfg.scale[Math.floor(rnd() * cfg.scale.length)];
      const oct = 4 + Math.floor(rnd() * 2);
      melody.push({ note: `${cfg.root}${oct}`, dur: 1, time });
      time += 1;
    }
  }
  return {
    title: cfg.title,
    mood,
    tempo: cfg.tempo,
    root: cfg.root,
    scale: cfg.scale,
    chords,
    bass,
    melody,
    drumPattern: cfg.drum,
  };
}

const MOOD_META: { id: MusicComposition['mood']; label: string; icon: typeof Sun }[] = [
  { id: 'happy', label: 'Happy', icon: Sun },
  { id: 'chill', label: 'Chill', icon: Moon },
  { id: 'epic', label: 'Epic', icon: Swords },
  { id: 'sad', label: 'Sad', icon: CloudRain },
];

export function MusicStudio({ open, onClose }: MusicStudioProps) {
  const [mood, setMood] = useState<MusicComposition['mood']>('chill');
  const [seed, setSeed] = useState(1);
  const [composition, setComposition] = useState<MusicComposition>(() => generateComposition('chill', 1));

  const compose = useCallback((m: MusicComposition['mood'], s: number) => {
    setMood(m);
    setSeed(s);
    setComposition(generateComposition(m, s));
  }, []);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 bg-background/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.97 }}
            transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[92vh] bg-background border border-border/50 rounded-3xl shadow-apple-2xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Music2 className="w-4 h-4 text-emerald-500" />
                <div>
                  <p className="text-base font-semibold leading-tight">Music Studio</p>
                  <p className="text-[10px] font-mono text-muted-foreground/50">composes in your browser · plays live</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 rounded-full hover:bg-muted/50 text-muted-foreground transition-colors" title="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
              {/* Mood picker */}
              <div>
                <p className="text-[10px] font-mono tracking-widest text-muted-foreground/50 uppercase mb-2">Pick a mood</p>
                <div className="grid grid-cols-2 gap-2">
                   {MOOD_META.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => compose(m.id, seed)}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-[12.5px] font-medium transition-all active:scale-[0.98] ${
                        mood === m.id
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-foreground'
                          : 'border-border/40 bg-background text-muted-foreground hover:bg-muted/30'
                      }`}
                    >
                       <m.icon className="w-4 h-4 text-emerald-500" />
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Player */}
              <div>
                <p className="text-[10px] font-mono tracking-widest text-muted-foreground/50 uppercase mb-2">Now playing</p>
                <MusicWidget composition={composition} />
              </div>

              {/* Compose another */}
              <button
                onClick={() => compose(mood, seed + 1)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-border/40 text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Compose another take
              </button>

              <p className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground/40 text-center">
                <Heart className="w-3 h-3" />
                100% free, every track is generated live with Web Audio, no server, no limits.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
