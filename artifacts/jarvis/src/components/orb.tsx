import { useMemo, useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Square } from 'lucide-react';

export type AppState = 'idle' | 'wake' | 'recording' | 'transcribing' | 'thinking' | 'speaking';

interface OrbProps {
  status: AppState;
  onClick?: () => void;
  /** Audio amplitude 0–1 for reactive particles during speaking/recording */
  amplitude?: number;
}

// ── Particle system: 120 particles forming a circle ──
interface Particle {
  angle: number;
  radius: number;
  size: number;
  delay: number;
  orbitSpeed: number;
  drift: number;
}

function useParticles(count = 120) {
  return useMemo<Particle[]>(() =>
    Array.from({ length: count }).map((_, i) => ({
      angle: (i / count) * 360,
      radius: 100 + Math.random() * 60,
      size: 1.5 + Math.random() * 3,
      delay: Math.random() * 3,
      orbitSpeed: 0.3 + Math.random() * 0.6,
      drift: (Math.random() - 0.5) * 0.5,
    })),
    [count]
  );
}

function ParticleRing({ status, amplitude = 0 }: { status: AppState; amplitude?: number }) {
  const particles = useParticles(120);
  const isActive = status === 'speaking' || status === 'recording' || status === 'thinking';

  const color =
    status === 'recording' ? '255, 80, 80' :
    status === 'speaking' ? '80, 255, 180' :
    status === 'thinking' || status === 'transcribing' ? '255, 200, 80' :
    '0, 122, 255';

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <AnimatePresence>
        <motion.div
          key={`particles-${isActive}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
        >
          {particles.map((p, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                width: p.size + (isActive ? amplitude * 3 : 0) + 'px',
                height: p.size + (isActive ? amplitude * 3 : 0) + 'px',
                background: `rgba(${color}, ${isActive ? 0.4 + amplitude * 0.4 : 0.15})`,
                boxShadow: isActive ? `0 0 ${4 + amplitude * 8}px rgba(${color}, ${0.3 + amplitude * 0.5})` : 'none',
              }}
              animate={{
                x: [
                  `${Math.cos((p.angle * Math.PI) / 180) * p.radius * 0.85}px`,
                  `${Math.cos(((p.angle + 90) * Math.PI) / 180) * (p.radius + amplitude * 15)}px`,
                  `${Math.cos(((p.angle + 180) * Math.PI) / 180) * p.radius * 0.9}px`,
                  `${Math.cos(((p.angle + 270) * Math.PI) / 180) * (p.radius - amplitude * 10)}px`,
                  `${Math.cos((p.angle * Math.PI) / 180) * p.radius * 0.85}px`,
                ],
                y: [
                  `${Math.sin((p.angle * Math.PI) / 180) * p.radius * 0.85}px`,
                  `${Math.sin(((p.angle + 90) * Math.PI) / 180) * (p.radius + amplitude * 15)}px`,
                  `${Math.sin(((p.angle + 180) * Math.PI) / 180) * p.radius * 0.9}px`,
                  `${Math.sin(((p.angle + 270) * Math.PI) / 180) * (p.radius - amplitude * 10)}px`,
                  `${Math.sin((p.angle * Math.PI) / 180) * p.radius * 0.85}px`,
                ],
                opacity: isActive
                  ? [0.2 + amplitude * 0.3, 0.7 + amplitude * 0.3, 0.3 + amplitude * 0.2, 0.8 + amplitude * 0.2, 0.2 + amplitude * 0.3]
                  : [0.08, 0.15, 0.08, 0.15, 0.08],
                scale: isActive ? [0.8, 1.2 + amplitude, 0.9, 1.1, 0.8] : [0.6, 0.8, 0.6, 0.8, 0.6],
              }}
              transition={{
                repeat: Infinity,
                duration: isActive ? 4 - amplitude * 1.5 : 8 + p.orbitSpeed * 2,
                delay: p.delay,
                ease: 'easeInOut',
              }}
            />
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ── Animated rings for different states ──
function StatusRings({ status }: { status: AppState }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <AnimatePresence>
        {/* Wake/Recording: expanding rings */}
        {(status === 'recording' || status === 'wake') && (
          <>
            {[1, 2, 3, 4].map((i) => (
              <motion.div
                key={`ring-${i}`}
                className="absolute w-full h-full rounded-full border"
                style={{
                  borderColor: status === 'recording'
                    ? 'rgba(255, 80, 80, 0.4)'
                    : 'rgba(0, 122, 255, 0.25)',
                }}
                initial={{ scale: status === 'wake' ? 0.9 : 0.85, opacity: status === 'wake' ? 0.4 : 0.8 }}
                animate={{ scale: status === 'wake' ? 1.6 : 2.2, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{
                  repeat: Infinity,
                  duration: status === 'wake' ? 3.5 : 2.0,
                  delay: i * (status === 'wake' ? 0.9 : 0.5),
                  ease: [0.23, 1, 0.32, 1],
                }}
              />
            ))}
          </>
        )}

        {/* Thinking: rotating dashed rings */}
        {status === 'thinking' && (
          <>
            {[0, 1, 2, 3].map((i) => (
              <motion.div
                key={`think-${i}`}
                className="absolute rounded-full border"
                style={{
                  width: `${55 + i * 12}%`,
                  height: `${55 + i * 12}%`,
                  borderColor: `rgba(255, 200, 80, ${0.3 - i * 0.05})`,
                  borderStyle: i % 2 === 0 ? 'dashed' : 'solid',
                  borderWidth: i % 2 === 0 ? '2px' : '1px',
                }}
                animate={{
                  rotate: i % 2 === 0 ? 360 : -360,
                  opacity: [0.12, 0.4, 0.12],
                  scale: [0.95, 1.03, 0.95],
                }}
                transition={{
                  repeat: Infinity,
                  duration: 2.5 + i * 0.4,
                  ease: 'linear',
                }}
              />
            ))}
          </>
        )}

        {/* Speaking: gentle expanding concentric waves */}
        {status === 'speaking' && (
          <>
            {[1, 2, 3, 4, 5].map((i) => (
              <motion.div
                key={`wave-${i}`}
                className="absolute rounded-full border border-green-400/20"
                initial={{ scale: 0.6, opacity: 0.6 }}
                animate={{
                  scale: [0.6, 0.9 + i * 0.1, 1.2 + i * 0.05],
                  opacity: [0.6, 0.25, 0],
                }}
                transition={{
                  repeat: Infinity,
                  duration: 1.2,
                  delay: i * 0.1,
                  ease: 'easeOut',
                }}
                style={{ width: '100%', height: '100%' }}
              />
            ))}
          </>
        )}

        {/* Transcribing: orbital dashes */}
        {status === 'transcribing' && (
          <>
            <motion.div
              className="absolute w-full h-full rounded-full border-t-2 border-r-2 border-yellow-400/50 border-dashed"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
            />
            <motion.div
              className="absolute w-[75%] h-[75%] rounded-full border-b-2 border-l-2 border-yellow-300/35 border-dashed"
              animate={{ rotate: -360 }}
              transition={{ repeat: Infinity, duration: 5, ease: 'linear' }}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Listening waveform bars ──
function Waveform({ amplitude = 0 }: { amplitude?: number }) {
  return (
    <div className="absolute bottom-[-28px] left-1/2 -translate-x-1/2 flex items-end gap-[3px] h-5">
      {Array.from({ length: 7 }).map((_, i) => (
        <motion.div
          key={i}
          className="w-[2.5px] rounded-full"
          style={{ background: 'rgba(0, 122, 255, 0.5)' }}
          animate={{
            height: [
              `${4 * (1 - amplitude * 0.3)}px`,
              `${(8 + Math.sin(i * 0.8) * 6 + 4) * (0.5 + amplitude * 0.5)}px`,
              `${4 * (1 - amplitude * 0.3)}px`,
            ],
          }}
          transition={{
            repeat: Infinity,
            duration: 0.5 + i * 0.03,
            delay: i * 0.05,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

export function Orb({ status, onClick, amplitude = 0 }: OrbProps) {
  const isBusy = status === 'thinking' || status === 'transcribing';
  const isActive = status !== 'idle' && status !== 'wake';

  // Apple-blue base with state tinting
  const glowColor =
    status === 'recording' ? 'rgba(255, 80, 80, 0.6)' :
    status === 'speaking' ? 'rgba(80, 255, 180, 0.6)' :
    status === 'thinking' || status === 'transcribing' ? 'rgba(255, 200, 80, 0.4)' :
    'rgba(0, 122, 255, 0.5)';

  return (
    <div
      className="relative flex items-center justify-center w-[260px] h-[260px] sm:w-[280px] sm:h-[280px] cursor-pointer group select-none"
      onPointerDown={onClick}
      style={{ touchAction: 'manipulation' }}
      aria-label={status}
      role="button"
    >
      {/* Ambient glow backdrop */}
      <motion.div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{ background: glowColor, filter: 'blur(80px)' }}
        animate={{
          scale: isActive ? [1, 1.2, 1] : [1, 1.05, 1],
          opacity: status === 'idle' ? 0.12 : isActive ? 0.5 : 0.2,
        }}
        transition={{
          repeat: Infinity,
          duration: isActive ? 2 : 4,
          ease: 'easeInOut',
        }}
      />

      {/* Particle ring */}
      <ParticleRing status={status} amplitude={amplitude} />

      {/* Status rings */}
      <StatusRings status={status} />

      {/* Core sphere — Apple-style glass with minimal border */}
      <motion.div
        className="relative z-10 w-[160px] h-[160px] sm:w-[180px] sm:h-[180px] rounded-full flex items-center justify-center overflow-hidden"
        style={{
          background: isActive
            ? `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.15) 0%, hsl(var(--card)) 90%)`
            : `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.08) 0%, hsl(var(--card)) 90%)`,
          boxShadow: isActive
            ? `0 0 0 1px ${glowColor.replace('0.6', '0.2')}, 0 8px 32px ${glowColor.replace('0.6', '0.08')}`
            : `0 0 0 1px hsl(var(--border)), 0 4px 16px hsl(0 0% 0% / 0.04)`,
        }}
        animate={{
          scale: status === 'recording' ? [0.95, 0.98, 0.95]
            : status === 'speaking' ? [1, 1.015, 1]
            : [1, 1.005, 1],
        }}
        transition={{
          repeat: Infinity,
          duration: status === 'recording' ? 0.9 : status === 'speaking' ? 1.5 : 3,
          ease: 'easeInOut',
        }}
      >
        {/* Subtle inner highlight */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'radial-gradient(circle at 30% 25%, rgba(255,255,255,0.12) 0%, transparent 60%)',
          }}
        />

        {/* State-tinted inner glow */}
        <motion.div
          className="absolute inset-0 rounded-full"
          animate={{
            background:
              status === 'recording' ? 'radial-gradient(circle at 50% 50%, rgba(255,80,80,0.10) 0%, transparent 70%)' :
              status === 'speaking' ? 'radial-gradient(circle at 50% 50%, rgba(80,255,180,0.08) 0%, transparent 70%)' :
              isBusy ? 'radial-gradient(circle at 50% 50%, rgba(255,200,80,0.08) 0%, transparent 70%)' :
              'radial-gradient(circle at 50% 50%, rgba(0,122,255,0.04) 0%, transparent 70%)',
          }}
          transition={{ duration: 0.5 }}
        />

        {/* Liquid-gleam highlight */}
        <motion.div
          className="absolute inset-[-30%] opacity-20"
          style={{
            background: 'conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,0.25) 60deg, transparent 120deg, rgba(255,255,255,0.1) 180deg, transparent 240deg, rgba(255,255,255,0.2) 300deg, transparent 360deg)',
          }}
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 12, ease: 'linear' }}
        />

        {/* Icon */}
        <AnimatePresence mode="wait">
          {status === 'recording' ? (
            <motion.div
              key="stop"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              className="relative z-20"
              style={{ color: 'rgba(255, 80, 80, 0.8)' }}
            >
              <Square className="w-7 h-7 fill-current" />
            </motion.div>
          ) : (
            <motion.div
              key="mic"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              className="relative z-20 transition-colors"
              style={{ color: isActive ? 'rgba(0, 122, 255, 0.7)' : 'hsl(var(--muted-foreground))' }}
            >
              <Mic className="w-7 h-7" />
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
            exit={{ opacity: 0, y: -5 }}
            className="absolute bottom-0"
          >
            <Waveform amplitude={amplitude} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
