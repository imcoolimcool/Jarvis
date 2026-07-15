import { motion, AnimatePresence } from 'framer-motion';

export type AppState = 'idle' | 'recording' | 'transcribing' | 'thinking' | 'speaking';

interface OrbProps {
  status: AppState;
  onClick?: () => void;
}

export function Orb({ status, onClick }: OrbProps) {
  return (
    <div 
      className="relative flex items-center justify-center w-[300px] h-[300px] cursor-pointer group"
      onClick={onClick}
    >
      <motion.div
        className="absolute inset-0 rounded-full bg-primary/20 blur-[60px] pointer-events-none"
        animate={{
          scale: status === 'recording' || status === 'speaking' ? [1, 1.2, 1] : 1,
          opacity: status === 'idle' ? 0.3 : 0.8,
        }}
        transition={{
          repeat: Infinity,
          duration: status === 'speaking' ? 0.5 : 2,
        }}
      />

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <AnimatePresence>
          {status === 'recording' && (
            <>
              {[1, 2, 3].map((i) => (
                <motion.div
                  key={`ring-${i}`}
                  className="absolute w-full h-full rounded-full border border-primary/60"
                  initial={{ scale: 0.8, opacity: 1 }}
                  animate={{ scale: 2, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{
                    repeat: Infinity,
                    duration: 2,
                    delay: i * 0.6,
                    ease: "easeOut"
                  }}
                />
              ))}
            </>
          )}

          {status === 'transcribing' && (
            <motion.div
              className="absolute w-full h-full rounded-full border-t-[3px] border-r-[3px] border-primary border-dashed"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
            />
          )}

          {status === 'thinking' && (
            <>
              <motion.div
                className="absolute w-full h-full rounded-full border-2 border-primary/50"
                animate={{ rotateX: 360, rotateY: 180 }}
                transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                style={{ transformStyle: 'preserve-3d' }}
              />
              <motion.div
                className="absolute w-[80%] h-[80%] rounded-full border-2 border-primary/80 border-dashed"
                animate={{ rotateY: 360, rotateX: 180 }}
                transition={{ repeat: Infinity, duration: 2.5, ease: "linear" }}
                style={{ transformStyle: 'preserve-3d' }}
              />
              <motion.div
                className="absolute w-[60%] h-[60%] rounded-full border-2 border-primary/30"
                animate={{ rotateZ: 360 }}
                transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
              />
            </>
          )}
          
          {status === 'speaking' && (
             <motion.div
                className="absolute w-full h-full rounded-full border-[6px] border-primary/40"
                animate={{
                   scale: [1, 1.15, 0.95, 1.2, 1],
                   opacity: [0.5, 1, 0.4, 0.9, 0.5]
                }}
                transition={{ repeat: Infinity, duration: 0.8, ease: "easeInOut" }}
             />
          )}
        </AnimatePresence>
      </div>

      <motion.div
        className="relative z-10 w-[200px] h-[200px] rounded-full bg-gradient-to-br from-primary/30 to-background border border-primary/60 backdrop-blur-md flex items-center justify-center overflow-hidden transition-shadow duration-300 group-hover:border-primary"
        animate={{
          scale: status === 'recording' ? 0.95 : 1,
          boxShadow: status === 'recording' 
            ? 'inset 0 0 60px rgba(0, 212, 255, 0.8)' 
            : 'inset 0 0 30px rgba(0, 212, 255, 0.4)'
        }}
        transition={{ duration: 0.3 }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,212,255,0.4)_0%,transparent_60%)]" />
        <div className="absolute inset-0 opacity-20 bg-[linear-gradient(rgba(0,212,255,0.8)_1px,transparent_1px)] bg-[length:100%_4px]" />
      </motion.div>
    </div>
  );
}