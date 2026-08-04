import { useState, useEffect } from 'react';

type Theme = 'dark' | 'light' | 'auto';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try { return (localStorage.getItem('jarvis-theme') as Theme) || 'light'; }
    catch { return 'light'; }
  });
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolved: 'dark' | 'light' = theme === 'auto' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(resolved);
    try { localStorage.setItem('jarvis-theme', theme); } catch { /* noop */ }
  }, [theme, resolved]);

  return {
    theme,
    resolved,
    setTheme,
    toggle: (next?: Theme) => setTheme(next ?? (resolved === 'dark' ? 'light' : 'dark')),
  };
}
