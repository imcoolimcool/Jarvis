import { useState, useEffect, useRef, useCallback } from 'react';
import { Globe, ArrowLeft, ArrowRight, RotateCcw, Maximize2, Minimize2 } from 'lucide-react';

interface BrowserState {
  url: string;
  title: string;
  loading: boolean;
  cursorX: number;
  cursorY: number;
  viewportWidth: number;
  viewportHeight: number;
}

interface JarvisBrowserProps {
  /** CSS class name */
  className?: string;
  /** Called when a new action is taken (for voice command feedback) */
  onAction?: (action: string) => void;
}

/**
 * Jarvis's Personal Browser component.
 * Displays live screenshots from the Puppeteer browser on the backend.
 * The user can see exactly what Jarvis is browsing, and take control.
 */
export function JarvisBrowser({ className = '', onAction }: JarvisBrowserProps) {
  const [state, setState] = useState<BrowserState | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [connectionFailed, setConnectionFailed] = useState(false);
  const reconnectAttemptsRef = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get WebSocket URL from backend
  useEffect(() => {
    fetch('/api/jarvis/browse/ws-url')
      .then((r) => r.json())
      .then((data) => {
        setWsUrl(data.url);
      })
      .catch(() => {
        // Fallback: derive from current location
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        setWsUrl(`${proto}//${window.location.hostname}:3002`);
      });
  }, []);

  // Connect to WebSocket for live screenshots
  const connectWs = useCallback(() => {
    if (!wsUrl) return;

    if (wsRef.current) {
      wsRef.current.close();
    }

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setConnected(true);
        onAction?.('Browser connected');
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'screenshot') {
            setScreenshot(`data:image/jpeg;base64,${msg.data}`);
          } else if (msg.type === 'state') {
            setState(msg.data);
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        reconnectAttemptsRef.current += 1;
        // After 3 failed attempts, assume Chrome is not installed
        if (reconnectAttemptsRef.current >= 3) {
          setConnectionFailed(true);
          return;
        }
        // Auto-reconnect after 3 seconds
        reconnectTimerRef.current = setTimeout(connectWs, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    } catch {
      // Connection failed — retry later
      reconnectTimerRef.current = setTimeout(connectWs, 5000);
    }
  }, [wsUrl, onAction]);

  useEffect(() => {
    connectWs();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [connectWs]);

  // Execute a browser action via the REST API
  const executeAction = useCallback(async (action: string, payload?: any) => {
    try {
      const res = await fetch('/api/jarvis/browse/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload }),
      });
      const data = await res.json();
      if (data.browserState) {
        setState(data.browserState);
      }
      return data;
    } catch (err) {
      console.error('Browser action failed:', err);
      return { success: false };
    }
  }, []);

  // Navigate to a URL
  const handleNavigate = useCallback((url?: string) => {
    const target = url || urlInput;
    if (!target) return;

    let fullUrl = target;
    if (!/^https?:\/\//i.test(target)) {
      fullUrl = 'https://' + target;
    }

    executeAction('navigate', fullUrl);
    setUrlInput(fullUrl);
    onAction?.(`Opening ${target}`);
  }, [urlInput, executeAction, onAction]);

  // Click on the page at a position
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    executeAction('click', { x, y });
    onAction?.(`Clicked at (${Math.round(x)}, ${Math.round(y)})`);
  }, [executeAction, onAction]);

  // Keyboard shortcut for URL input
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNavigate();
    }
  }, [handleNavigate]);

  // Scroll the page
  const handleScroll = useCallback((dx: number, dy: number) => {
    executeAction('scroll', { dx, dy });
  }, [executeAction]);

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className={`flex items-center gap-2 px-3 py-2 bg-card border border-border/50 rounded-lg text-xs font-mono text-muted-foreground hover:text-foreground transition-colors ${className}`}
      >
        <Globe className="w-3.5 h-3.5" />
        <span>Jarvis's Browser</span>
        {state?.title && <span className="text-[10px] truncate max-w-[120px]">{state.title}</span>}
        <Maximize2 className="w-3 h-3 ml-1" />
      </button>
    );
  }

  return (
    <div className={`flex flex-col bg-card rounded-lg border border-border/50 overflow-hidden ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 bg-muted/30 border-b border-border/30">
        {/* Navigation buttons */}
        <button
          onClick={() => executeAction('back')}
          className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
          title="Back"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => executeAction('forward')}
          className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
          title="Forward"
        >
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => handleNavigate(state?.url)}
          className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
          title="Reload"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        {/* URL bar */}
        <div className="flex-1 flex items-center gap-1.5 px-2 bg-background rounded border border-border/30">
          <Globe className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter URL or search..."
            className="flex-1 bg-transparent text-xs font-mono py-1 outline-none text-foreground placeholder:text-muted-foreground/50"
          />
        </div>

        {/* Connection indicator */}
        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'} flex-shrink-0`} title={connected ? 'Connected' : 'Disconnected'} />

        {/* Minimize button */}
        <button
          onClick={() => setMinimized(true)}
          className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
          title="Minimize"
        >
          <Minimize2 className="w-3.5 h-3.5" />
        </button>
        {/* Fullscreen toggle */}
        <button
          onClick={() => setFullscreen(f => !f)}
          className={`p-1 rounded hover:bg-muted/50 transition-colors ${fullscreen ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          title={fullscreen ? 'Collapse' : 'Fullscreen'}
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Browser viewport */}
      <div
        className={`relative cursor-crosshair overflow-hidden ${fullscreen ? 'flex-1' : ''} ${screenshot ? 'bg-black' : 'bg-card'}`}
        style={{ minHeight: 300, maxHeight: fullscreen ? 'none' : 500 }}
        onClick={handleCanvasClick}
      >
        {screenshot ? (
          <>
            <img
              src={screenshot}
              alt="Jarvis's Browser"
              className="w-full h-full object-contain"
              draggable={false}
            />
            {/* Cursor indicator */}
            {state && (
              <div
                className="absolute w-4 h-4 pointer-events-none"
                style={{
                  left: (state.cursorX / state.viewportWidth) * 100 + '%',
                  top: (state.cursorY / state.viewportHeight) * 100 + '%',
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00ff88" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
                </svg>
              </div>
            )}
            {/* Loading indicator */}
            {state?.loading && (
              <div className="absolute top-2 left-2 px-2 py-1 bg-background/80 backdrop-blur rounded text-[11px] font-mono text-primary animate-pulse">
                Loading...
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground text-xs font-mono">
            {connectionFailed ? (
              <>
                <Globe className="w-8 h-8 text-muted-foreground/30" />
                <span className="text-center max-w-[200px]">
                  Chrome is not installed on the server. Ask your server admin to install Chromium to enable agent browsing.
                </span>
                <button
                  onClick={() => { setConnectionFailed(false); reconnectAttemptsRef.current = 0; connectWs(); }}
                  className="px-3 py-1.5 rounded border border-primary/30 text-primary hover:bg-primary/10 transition-colors text-[11px]"
                >
                  Retry Connection
                </button>
              </>
            ) : connected ? (
              <span>Waiting for browser view...</span>
            ) : (
              <>
                <Globe className="w-8 h-8 text-muted-foreground/30 animate-pulse" />
                <span className="text-center max-w-[200px]">
                  Connecting to browser...
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-2 py-1 bg-muted/20 border-t border-border/30">
        <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[60%]">
          {state?.url || 'No page loaded'}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground">
          {state?.title || ''}
        </span>
      </div>

      {/* Scroll controls */}
      <div className="flex justify-center gap-4 px-2 py-1 bg-muted/10 border-t border-border/20">
        <button
          onClick={() => handleScroll(0, -200)}
          className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
        >
          Scroll Up
        </button>
        <button
          onClick={() => handleScroll(0, 200)}
          className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
        >
          Scroll Down
        </button>
        <button
          onClick={() => executeAction('type', { text: 'Hello from Jarvis' })}
          className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
        >
          Type Test
        </button>
      </div>
    </div>
  );
}
