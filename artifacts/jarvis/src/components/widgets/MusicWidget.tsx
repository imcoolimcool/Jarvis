import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, SkipBack, SkipForward, Music2, X, Volume2 } from 'lucide-react';

interface MusicWidgetProps {
  track?: string;
  artist?: string;
  album?: string;
  albumArt?: string | null;
  playing?: boolean;
  query?: string;
  onClose?: () => void;
}

interface NowPlaying {
  playing: boolean;
  track?: string;
  artist?: string;
  album?: string;
  albumArt?: string | null;
  progressMs?: number;
  durationMs?: number;
}

export function MusicWidget({ track: initTrack, artist: initArtist, albumArt: initArt, playing: initPlaying, query, onClose }: MusicWidgetProps) {
  const [now, setNow] = useState<NowPlaying>({
    playing: initPlaying ?? false,
    track: initTrack,
    artist: initArtist,
    albumArt: initArt ?? null,
  });
  const [loading, setLoading] = useState(false);
  const [spotifyConnected, setSpotifyConnected] = useState<boolean | null>(null);

  const fetchCurrent = useCallback(async () => {
    try {
      const r = await fetch('/api/jarvis/spotify/current');
      if (r.ok) {
        const data = await r.json();
        setNow(data);
      }
    } catch { /* noop */ }
  }, []);

  // Check Spotify connection + start playing if query provided
  useEffect(() => {
    fetch('/api/jarvis/spotify/status')
      .then(r => r.json())
      .then(d => {
        setSpotifyConnected(d.connected);
        if (d.connected) {
          fetchCurrent();
          if (query) {
            control('play', query);
          }
        }
      })
      .catch(() => setSpotifyConnected(false));
  }, [query]);

  // Poll current track every 5s while playing
  useEffect(() => {
    if (!spotifyConnected || !now.playing) return;
    const id = setInterval(fetchCurrent, 5000);
    return () => clearInterval(id);
  }, [spotifyConnected, now.playing, fetchCurrent]);

  const control = async (action: string, actionQuery?: string) => {
    setLoading(true);
    try {
      await fetch('/api/jarvis/spotify/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, query: actionQuery }),
      });
      setTimeout(fetchCurrent, 600);
    } catch { /* noop */ }
    finally { setLoading(false); }
  };

  if (spotifyConnected === false) {
    return (
      <div className="relative rounded-2xl border border-border/40 bg-background/60 backdrop-blur-sm p-4 w-full">
        {onClose && (
          <button onClick={onClose} className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted/50 text-muted-foreground/50 hover:text-foreground transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <div className="flex items-center gap-3 mb-3">
          <Music2 className="w-5 h-5 text-primary/70" />
          <div>
            <p className="text-[10px] font-mono tracking-widest text-muted-foreground/50 uppercase">Music</p>
            <p className="text-sm font-display text-foreground/80">Spotify not connected</p>
          </div>
        </div>
        <button
          onClick={() => window.open('/api/jarvis/spotify/auth', 'spotify_auth', 'width=500,height=700,left=200,top=100')}
          className="w-full py-2 rounded-xl border border-green-500/40 text-green-400 hover:bg-green-500/10 text-xs font-display tracking-wider transition-all"
        >
          Connect Spotify
        </button>
      </div>
    );
  }

  const progressPct = now.durationMs && now.progressMs
    ? (now.progressMs / now.durationMs) * 100
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-2xl border border-border/40 bg-background/60 backdrop-blur-sm overflow-hidden w-full"
    >
      {/* Album art background */}
      {now.albumArt && (
        <div
          className="absolute inset-0 opacity-10 bg-cover bg-center"
          style={{ backgroundImage: `url(${now.albumArt})`, filter: 'blur(20px)', transform: 'scale(1.2)' }}
        />
      )}

      {onClose && (
        <button onClick={onClose} className="absolute top-3 right-3 z-10 p-1 rounded-full hover:bg-muted/50 text-muted-foreground/50 hover:text-foreground transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      <div className="relative z-10 p-4">
        <div className="flex items-center gap-3">
          {/* Album art */}
          <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-primary/10 flex items-center justify-center border border-border/30">
            {now.albumArt ? (
              <img src={now.albumArt} alt="Album" className="w-full h-full object-cover" />
            ) : (
              <motion.div
                animate={now.playing ? { rotate: 360 } : { rotate: 0 }}
                transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
              >
                <Music2 className="w-6 h-6 text-primary/50" />
              </motion.div>
            )}
          </div>

          {/* Track info */}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-mono tracking-widest text-muted-foreground/50 uppercase flex items-center gap-1">
              <Volume2 className="w-3 h-3" /> {now.playing ? 'Now playing' : 'Paused'}
            </p>
            <p className="text-sm font-display font-semibold text-foreground truncate">
              {now.track ?? (query ? `Searching: ${query}` : 'Nothing playing')}
            </p>
            <p className="text-[11px] font-mono text-muted-foreground/70 truncate">
              {now.artist ?? '—'}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        {now.durationMs ? (
          <div className="mt-3 h-1 bg-muted/30 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary/60 rounded-full"
              initial={{ width: `${progressPct}%` }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        ) : null}

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 mt-3">
          <button
            onClick={() => control('previous')}
            disabled={loading}
            className="p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all disabled:opacity-30"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            onClick={() => control(now.playing ? 'pause' : 'play')}
            disabled={loading}
            className="p-3 rounded-full bg-primary/20 text-primary hover:bg-primary/30 border border-primary/40 transition-all disabled:opacity-30"
          >
            {now.playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </button>
          <button
            onClick={() => control('next')}
            disabled={loading}
            className="p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all disabled:opacity-30"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
