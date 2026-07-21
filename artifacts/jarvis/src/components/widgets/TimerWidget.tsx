import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, X, Timer } from 'lucide-react';

interface TimerWidgetProps {
  durationSeconds: number;
  label?: string;
  compact?: boolean;
  onClose?: () => void;
}

function formatTime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    [0, 0.3, 0.6].forEach(offset => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.25);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.3);
    });
  } catch { /* noop */ }
}

export function TimerWidget({ durationSeconds, label, compact, onClose }: TimerWidgetProps) {
  const [remaining, setRemaining] = useState(durationSeconds);
  const [running, setRunning] = useState(true);
  const [done, setDone] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevDurationRef = useRef(durationSeconds);

  const clearTimer = () => { if (intervalRef.current) clearInterval(intervalRef.current); };

  // Reset timer when durationSeconds prop changes (Jarvis edits the timer)
  useEffect(() => {
    if (durationSeconds !== prevDurationRef.current && durationSeconds > 0) {
      prevDurationRef.current = durationSeconds;
      clearTimer();
      setRemaining(durationSeconds);
      setDone(false);
      setRunning(true);
    }
  }, [durationSeconds]);

  const tick = useCallback(() => {
    setRemaining(prev => {
      if (prev <= 1) {
        clearTimer();
        setRunning(false);
        setDone(true);
        playBeep();
        return 0;
      }
      return prev - 1;
    });
  }, []);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(tick, 1000);
    } else {
      clearTimer();
    }
    return clearTimer;
  }, [running, tick]);

  const reset = () => { setRemaining(durationSeconds); setDone(false); setRunning(false); };

  const progress = 1 - remaining / durationSeconds;
  const circumference = 2 * Math.PI * 44;
  const strokeDash = circumference * (1 - progress);

  // ── Compact mode: tiny display above the orb ──────────────────────────────
  if (compact) {
    return (
      <div className={`flex flex-col items-center gap-1 ${done ? 'animate-pulse' : ''}`}>
        <div className="flex items-center gap-1.5">
          <Timer className={`w-5 h-5 ${done ? 'text-green-400' : 'text-primary/70'}`} />
        </div>
        <span className={`font-display text-2xl font-bold tabular-nums tracking-wider ${done ? 'text-green-400' : 'text-primary'}`}>
          {done ? "Done!" : formatTime(remaining)}
        </span>
        {label && <span className="text-[10px] font-mono text-muted-foreground/50 tracking-wider uppercase">{label}</span>}
        <div className="flex items-center gap-2 mt-0.5">
          {!done && (
            <button onClick={() => setRunning(r => !r)}
              className="text-[10px] font-mono text-muted-foreground/60 hover:text-primary transition-colors">
              {running ? 'pause' : 'resume'}
            </button>
          )}
          {onClose && (
            <button onClick={done ? onClose : reset}
              className={`text-[10px] font-mono transition-colors ${done ? 'text-green-400 hover:text-green-300' : 'text-muted-foreground/40 hover:text-muted-foreground'}`}>
              {done ? 'dismiss' : 'reset'}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative mt-3 rounded-2xl border border-border/40 bg-background/60 backdrop-blur-sm p-5 shadow-lg w-full max-w-[260px]">
      {onClose && (
        <button onClick={onClose} className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted/50 text-muted-foreground/50 hover:text-foreground transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
      {label && <p className="text-[10px] font-mono tracking-widest text-muted-foreground/50 uppercase mb-3 text-center">{label}</p>}

      {/* Circular progress */}
      <div className="flex items-center justify-center mb-4">
        <div className="relative w-28 h-28">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" className="text-border/20" strokeWidth="6" />
            <circle cx="50" cy="50" r="44" fill="none"
              stroke={done ? 'rgb(34 197 94)' : 'var(--color-primary, #00d4ff)'}
              strokeWidth="6" strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDash}
              style={{ transition: 'stroke-dashoffset 0.8s linear' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {done ? (
              <span className="text-2xl">✅</span>
            ) : (
              <span className={`text-2xl font-display font-bold tabular-nums ${running ? 'text-foreground' : 'text-muted-foreground'}`}>
                {formatTime(remaining)}
              </span>
            )}
          </div>
        </div>
      </div>

      {done && <p className="text-center text-sm font-display text-green-400 tracking-wider mb-3">Time's up!</p>}

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
        <button onClick={() => setRunning(r => !r)} disabled={done}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl border font-display text-xs tracking-wider transition-all ${
            running ? 'border-primary/50 text-primary bg-primary/10 hover:bg-primary/20' : 'border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/40'
          } disabled:opacity-30`}>
          {running ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          {running ? 'Pause' : 'Resume'}
        </button>
        <button onClick={reset}
          className="p-2 rounded-xl border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all">
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
