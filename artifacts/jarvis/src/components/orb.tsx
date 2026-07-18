import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Square } from 'lucide-react';

export type AppState = 'idle' | 'wake' | 'recording' | 'transcribing' | 'thinking' | 'speaking';

interface OrbProps {
  status: AppState;
  onClick?: () => void;
}

export function Orb({ status, onClick }: OrbProps) {
  const isBusy = status === 'thinking' || status === 'transcribing';
  const isListening = status === 'wake' || status === 'recording';

  return (
    <div
      className="relative flex items-center justify-center w-[280px] h-[280px] sm:w-[300px] sm:h-[300px] cursor-pointer group select-none"
      onClick={onClick}
      aria-label={status}
    >
      {/* Deep ambient glow — always present, breathing slowly */}
      <motion.div
        className="absolute inset-0 rounded-full bg-primary/20 blur-[72px] pointer-events-none"
        animate={{
          scale: status === 'recording' || status === 'speaking' ? [1, 1.25, 1] : status === 'wake' ? [1, 1.08, 1] : [1, 1.05, 1],
          opacity: status === 'idle' ? [0.25, 0.4, 0.25] : status === 'wake' ? [0.35, 0.55, 0.35] : [0.6, 0.9, 0.6],
        }}
        transition={{
          repeat: Infinity,
          duration: status === 'recording' ? 1.2 : status === 'speaking' ? 0.9 : status === 'wake' ? 2 : 4,
          ease: 'easeInOut',
        }}
      />

      {/* Outer status rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <AnimatePresence>
          {(status === 'recording' || status === 'wake') && (
            <>
              {[1, 2, 3].map((i) => (
                <motion.div
                  key={`ring-${i}`}
                  className={`absolute w-full h-full rounded-full border ${status === 'wake' ? 'border-primary/30' : 'border-primary/60'}`}
                  initial={{ scale: status === 'wake' ? 0.9 : 0.8, opacity: status === 'wake' ? 0.6 : 1 }}
                  animate={{ scale: status === 'wake' ? 1.6 : 2.2, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{
                    repeat: Infinity,
                    duration: status === 'wake' ? 3.2 : 2.4,
                    delay: i * (status === 'wake' ? 1.1 : 0.8),
                    ease: 'easeOut',
                  }}
                />
              ))}
            </>
          )}

          {status === 'transcribing' && (
            <>
              <motion.div
                className="absolute w-full h-full rounded-full border-t-[3px] border-r-[3px] border-primary border-dashed"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
              />
              <motion.div
                className="absolute w-[78%] h-[78%] rounded-full border-b-[2px] border-l-[2px] border-primary/50 border-dashed"
                animate={{ rotate: -360 }}
                transition={{ repeat: Infinity, duration: 5, ease: 'linear' }}
              />
            </>
          )}

          {status === 'thinking' && (
            <>
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={`think-${i}`}
                  className="absolute rounded-full border border-primary/60"
                  style={{ width: `${70 + i * 18}%`, height: `${70 + i * 18}%` }}
                  animate={{ rotate: i % 2 === 0 ? 360 : -360, opacity: [0.2, 0.6, 0.2] }}
                  transition={{
                    repeat: Infinity,
                    duration: 2.5 + i * 0.6,
                    ease: 'linear',
                  }}
                />
              ))}
            </>
          )}

          {status === 'speaking' && (
            <>
              {[1, 2, 3, 4].map((i) => (
                <motion.div
                  key={`wave-${i}`}
                  className="absolute rounded-full border border-primary/40"
                  initial={{ scale: 0.7, opacity: 0.6 }}
                  animate={{
                    scale: [0.7, 1.0 + i * 0.12, 1.2 + i * 0.08],
                    opacity: [0.6, 0.35, 0],
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: 1.2,
                    delay: i * 0.15,
                    ease: 'easeOut',
                  }}
                  style={{ width: '100%', height: '100%' }}
                />
              ))}
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Core sphere with liquid light */}
      <motion.div
        className="relative z-10 w-[180px] h-[180px] sm:w-[200px] sm:h-[200px] rounded-full bg-gradient-to-br from-primary/40 via-primary/10 to-background border border-primary/60 backdrop-blur-md flex items-center justify-center overflow-hidden transition-shadow duration-300 group-hover:border-primary/90"
        animate={{
          scale: status === 'recording' ? 0.94 : 1,
          boxShadow: isBusy
            ? 'inset 0 0 50px rgba(0, 212, 255, 0.6), 0 0 40px rgba(0, 212, 255, 0.15)'
            : status === 'recording'
              ? 'inset 0 0 70px rgba(0, 212, 255, 0.9), 0 0 50px rgba(0, 212, 255, 0.25)'
              : 'inset 0 0 30px rgba(0, 212, 255, 0.4), 0 0 20px rgba(0, 212, 255, 0.1)',
        }}
        transition={{ duration: 0.35 }}
      >
        {/* Inner radial sheen */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(0,212,255,0.55)_0%,transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_70%,rgba(0,120,255,0.25)_0%,transparent_50%)]" />

        {/* Slow drifting liquid highlight */}
        <motion.div
          className="absolute inset-[-40%] opacity-30 bg-[conic-gradient(from_0deg,transparent_0deg,rgba(0,212,255,0.5)_60deg,transparent_120deg,rgba(0,180,255,0.35)_180deg,transparent_240deg,rgba(0,212,255,0.5)_300deg,transparent_360deg)]"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 12, ease: 'linear' }}
        />

        {/* Subtle scanline */}
        <div className="absolute inset-0 opacity-[0.12] bg-[linear-gradient(rgba(0,212,255,0.9)_1px,transparent_1px)] bg-[length:100%_3px]" />

        {/* Icon */}
        <AnimatePresence mode="wait">
          {status === 'recording' ? (
            <motion.div
              key="stop"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="relative z-20 text-primary/80"
            >
              <Square className="w-8 h-8 fill-current" />
            </motion.div>
          ) : (
            <motion.div
              key="mic"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="relative z-20 text-primary/70 group-hover:text-primary transition-colors"
            >
              <Mic className="w-8 h-8" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}