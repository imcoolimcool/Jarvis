import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Square } from 'lucide-react';

export type AppState = 'idle' | 'wake' | 'recording' | 'transcribing' | 'thinking' | 'speaking';

interface OrbProps {
  status: AppState;
  onClick?: () => void;
}

// Floating particles for active states
function Particles({ count = 8, color = 'rgba(0,212,255,0.5)' }: { count?: number; color?: string }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * 360;
        const radius = 120 + Math.random() * 40;
        const delay = (i / count) * 2;
        return (
          <motion.div
            key={i}
            className="absolute w-1 h-1 rounded-full pointer-events-none"
            style={{ background: color }}
            animate={{
              x: [
                `${Math.cos((angle * Math.PI) / 180) * radius * 0.7}px`,
                `${Math.cos(((angle + 30) * Math.PI) / 180) * radius}px`,
                `${Math.cos(((angle + 60) * Math.PI) / 180) * radius * 0.8}px`,
                `${Math.cos((angle * Math.PI) / 180) * radius * 0.7}px`,
              ],
              y: [
                `${Math.sin((angle * Math.PI) / 180) * radius * 0.7}px`,
                `${Math.sin(((angle + 30) * Math.PI) / 180) * radius}px`,
                `${Math.sin(((angle + 60) * Math.PI) / 180) * radius * 0.8}px`,
                `${Math.sin((angle * Math.PI) / 180) * radius * 0.7}px`,
              ],
              opacity: [0, 0.8, 0.4, 0],
              scale: [0, 1.5, 1, 0],
            }}
            transition={{
              repeat: Infinity,
              duration: 3 + (i % 3) * 0.7,
              delay,
              ease: 'easeInOut',
            }}
          />
        );
      })}
    </>
  );
}

// Waveform bars for speaking state
function Waveform() {
  return (
    <div className="absolute bottom-[-32px] left-1/2 -translate-x-1/2 flex items-end gap-[3px] h-6">
      {Array.from({ length: 9 }).map((_, i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full bg-primary/60"
          animate={{
            height: ['4px', `${8 + Math.sin(i * 0.8) * 10 + 4}px`, '4px'],
          }}
          transition={{
            repeat: Infinity,
            duration: 0.6 + i * 0.05,
            delay: i * 0.06,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

export function Orb({ status, onClick }: OrbProps) {
  const isBusy = status === 'thinking' || status === 'transcribing';
  const isActive = status !== 'idle';

  // State-based color accents
  const glowColor =
    status === 'recording' ? 'rgba(255,80,80,0.7)' :
    status === 'speaking' ? 'rgba(80,255,180,0.7)' :
    status === 'thinking' || status === 'transcribing' ? 'rgba(255,200,0,0.5)' :
    'rgba(0,212,255,0.6)';

  const innerGlow =
    status === 'recording' ? 'inset 0 0 70px rgba(255,80,80,0.6), 0 0 50px rgba(255,80,80,0.2)' :
    status === 'speaking' ? 'inset 0 0 60px rgba(80,255,180,0.5), 0 0 40px rgba(80,255,180,0.15)' :
    isBusy ? 'inset 0 0 50px rgba(255,200,0,0.4), 0 0 40px rgba(255,200,0,0.1)' :
    'inset 0 0 30px rgba(0,212,255,0.4), 0 0 20px rgba(0,212,255,0.1)';

  return (
    <div
      className="relative flex items-center justify-center w-[280px] h-[280px] sm:w-[300px] sm:h-[300px] cursor-pointer group select-none"
      onClick={onClick}
      aria-label={status}
    >
      {/* Deep ambient glow — breathing with state color */}
      <motion.div
        className="absolute inset-0 rounded-full blur-[72px] pointer-events-none"
        style={{ background: glowColor }}
        animate={{
          scale: status === 'recording' || status === 'speaking' ? [1, 1.3, 1] : status === 'wake' ? [1, 1.1, 1] : [1, 1.05, 1],
          opacity: status === 'idle' ? [0.15, 0.28, 0.15] : status === 'wake' ? [0.25, 0.45, 0.25] : [0.5, 0.8, 0.5],
        }}
        transition={{
          repeat: Infinity,
          duration: status === 'recording' ? 1.0 : status === 'speaking' ? 0.8 : status === 'wake' ? 2.2 : 4,
          ease: 'easeInOut',
        }}
      />

      {/* Secondary color accent ring */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            key="accent"
            className="absolute rounded-full pointer-events-none"
            style={{
              width: '88%', height: '88%',
              boxShadow: `0 0 0 1px ${glowColor}`,
              filter: 'blur(1px)',
            }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: [0.3, 0.7, 0.3], scale: [0.9, 1.0, 0.9] }}
            exit={{ opacity: 0 }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          />
        )}
      </AnimatePresence>

      {/* Outer status rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <AnimatePresence>
          {(status === 'recording' || status === 'wake') && (
            <>
              {[1, 2, 3].map((i) => (
                <motion.div
                  key={`ring-${i}`}
                  className={`absolute w-full h-full rounded-full border ${status === 'wake' ? 'border-primary/25' : 'border-red-400/50'}`}
                  initial={{ scale: status === 'wake' ? 0.9 : 0.85, opacity: status === 'wake' ? 0.5 : 0.9 }}
                  animate={{ scale: status === 'wake' ? 1.7 : 2.3, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{
                    repeat: Infinity,
                    duration: status === 'wake' ? 3.5 : 2.2,
                    delay: i * (status === 'wake' ? 1.2 : 0.75),
                    ease: 'easeOut',
                  }}
                />
              ))}
            </>
          )}

          {status === 'transcribing' && (
            <>
              <motion.div
                className="absolute w-full h-full rounded-full border-t-[3px] border-r-[3px] border-yellow-400/60 border-dashed"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 2.5, ease: 'linear' }}
              />
              <motion.div
                className="absolute w-[78%] h-[78%] rounded-full border-b-[2px] border-l-[2px] border-yellow-300/40 border-dashed"
                animate={{ rotate: -360 }}
                transition={{ repeat: Infinity, duration: 4, ease: 'linear' }}
              />
              <motion.div
                className="absolute w-[55%] h-[55%] rounded-full border-t-[2px] border-yellow-500/30"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 6, ease: 'linear' }}
              />
            </>
          )}

          {status === 'thinking' && (
            <>
              {[0, 1, 2, 3].map((i) => (
                <motion.div
                  key={`think-${i}`}
                  className="absolute rounded-full border border-yellow-400/40"
                  style={{ width: `${60 + i * 15}%`, height: `${60 + i * 15}%` }}
                  animate={{
                    rotate: i % 2 === 0 ? 360 : -360,
                    opacity: [0.15, 0.5, 0.15],
                    scale: [0.95, 1.05, 0.95],
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: 2.0 + i * 0.5,
                    ease: 'linear',
                  }}
                />
              ))}
            </>
          )}

          {status === 'speaking' && (
            <>
              {[1, 2, 3, 4, 5].map((i) => (
                <motion.div
                  key={`wave-${i}`}
                  className="absolute rounded-full border border-green-400/30"
                  initial={{ scale: 0.7, opacity: 0.7 }}
                  animate={{
                    scale: [0.7, 1.0 + i * 0.14, 1.3 + i * 0.06],
                    opacity: [0.7, 0.4, 0],
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: 1.0,
                    delay: i * 0.12,
                    ease: 'easeOut',
                  }}
                  style={{ width: '100%', height: '100%' }}
                />
              ))}
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Floating particles for active states */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <AnimatePresence>
          {(status === 'speaking' || status === 'thinking' || status === 'recording') && (
            <motion.div
              key="particles"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              <Particles
                count={status === 'speaking' ? 10 : 6}
                color={
                  status === 'speaking' ? 'rgba(80,255,180,0.6)' :
                  status === 'recording' ? 'rgba(255,100,100,0.6)' :
                  'rgba(255,200,0,0.5)'
                }
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Core sphere with liquid light */}
      <motion.div
        className="relative z-10 w-[180px] h-[180px] sm:w-[200px] sm:h-[200px] rounded-full bg-gradient-to-br from-primary/40 via-primary/10 to-background border border-primary/60 backdrop-blur-md flex items-center justify-center overflow-hidden transition-shadow duration-300 group-hover:border-primary/90"
        animate={{
          scale: status === 'recording' ? [0.94, 0.97, 0.94] : status === 'speaking' ? [1, 1.02, 1] : [1, 1.01, 1],
          boxShadow: innerGlow,
        }}
        transition={{
          scale: { repeat: Infinity, duration: status === 'recording' ? 0.9 : 2, ease: 'easeInOut' },
          boxShadow: { duration: 0.35 },
        }}
      >
        {/* Inner radial sheen */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(0,212,255,0.55)_0%,transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_70%,rgba(0,120,255,0.25)_0%,transparent_50%)]" />

        {/* State-tinted overlay */}
        <motion.div
          className="absolute inset-0 rounded-full"
          animate={{
            background:
              status === 'recording' ? 'radial-gradient(circle at 50% 50%, rgba(255,80,80,0.15) 0%, transparent 70%)' :
              status === 'speaking' ? 'radial-gradient(circle at 50% 50%, rgba(80,255,180,0.12) 0%, transparent 70%)' :
              isBusy ? 'radial-gradient(circle at 50% 50%, rgba(255,200,0,0.10) 0%, transparent 70%)' :
              'radial-gradient(circle at 50% 50%, rgba(0,212,255,0.05) 0%, transparent 70%)',
          }}
          transition={{ duration: 0.5 }}
        />

        {/* Slow drifting liquid highlight */}
        <motion.div
          className="absolute inset-[-40%] opacity-30 bg-[conic-gradient(from_0deg,transparent_0deg,rgba(0,212,255,0.5)_60deg,transparent_120deg,rgba(0,180,255,0.35)_180deg,transparent_240deg,rgba(0,212,255,0.5)_300deg,transparent_360deg)]"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: status === 'thinking' ? 4 : 10, ease: 'linear' }}
        />

        {/* Subtle scanline */}
        <div className="absolute inset-0 opacity-[0.10] bg-[linear-gradient(rgba(0,212,255,0.9)_1px,transparent_1px)] bg-[length:100%_3px]" />

        {/* Aurora shimmer */}
        <motion.div
          className="absolute inset-[-20%] opacity-20"
          style={{
            background: 'linear-gradient(45deg, transparent 30%, rgba(0,212,255,0.4) 50%, transparent 70%)',
          }}
          animate={{ x: ['-100%', '200%'] }}
          transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut', repeatDelay: 2 }}
        />

        {/* Icon */}
        <AnimatePresence mode="wait">
          {status === 'recording' ? (
            <motion.div
              key="stop"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              className="relative z-20 text-red-400/90"
            >
              <Square className="w-8 h-8 fill-current" />
            </motion.div>
          ) : (
            <motion.div
              key="mic"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              className="relative z-20 text-primary/70 group-hover:text-primary transition-colors"
            >
              <Mic className="w-8 h-8" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Waveform bars during speaking */}
      <AnimatePresence>
        {status === 'speaking' && (
          <motion.div
            key="waveform"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-0"
          >
            <Waveform />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
