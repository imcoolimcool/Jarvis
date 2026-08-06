import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, Check, ChevronDown, ChevronRight, Code2, FilePlus2, Folder, FolderPlus, GitBranch, Hammer, Loader2, Package, Play, Plus, RefreshCw, Save, Sparkles, Square, Terminal, Trash2, Upload, X } from 'lucide-react';
import type { TerminalResult } from '@/types/widget';
import { useI18n } from '@/lib/i18n';

interface WorkspaceFile { path: string; type: 'file' | 'dir'; size: number; }
interface SavedApp { id: string; name: string; description: string; metadata?: { fileCount?: number; envKeys?: string[]; previewPort?: number | null }; }
type StudioTab = 'editor' | 'terminal' | 'preview' | 'packages' | 'env' | 'git';
interface WizardQuestion { key: string; label: string; options?: string[]; }

interface BuildStudioProps {
  open: boolean;
  onClose: () => void;
  title: string;
  initialCommands: TerminalResult[];
  onRefreshFiles?: () => void;
}

const languageFor = (path: string) => /\.html?$/i.test(path) ? 'HTML' : /\.tsx?$/i.test(path) ? 'TypeScript' : /\.jsx?$/i.test(path) ? 'JavaScript' : /\.css$/i.test(path) ? 'CSS' : /\.json$/i.test(path) ? 'JSON' : /\.md$/i.test(path) ? 'Markdown' : 'Text';
const apiJson = async <T,>(url: string, init?: RequestInit): Promise<{ response: Response; data: T }> => {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({})) as T;
  return { response, data };
};

export function BuildStudio({ open, onClose, title, initialCommands, onRefreshFiles }: BuildStudioProps) {
  const { t } = useI18n();
  const [workspaceId] = useState(() => `build-${crypto.randomUUID()}`);
  const [tab, setTab] = useState<StudioTab>('editor');
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalLines, setTerminalLines] = useState<TerminalResult[]>(initialCommands);
  const [terminalRunning, setTerminalRunning] = useState(false);
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const streamRef = useRef<EventSource | null>(null);
  const [busy, setBusy] = useState(false);
  const [scaffoldPrompt, setScaffoldPrompt] = useState('');
  const [env, setEnv] = useState<Record<string, string>>({});
  const [envDraft, setEnvDraft] = useState('');
  const [previewCommand, setPreviewCommand] = useState('python3 -m http.server ${PORT}');
  const [previewPort, setPreviewPort] = useState(4173);
  const [previewRunning, setPreviewRunning] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewOutput, setPreviewOutput] = useState('');
  const [savedApps, setSavedApps] = useState<SavedApp[]>([]);
  const [saveName, setSaveName] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardBusy, setWizardBusy] = useState(false);
  const [wizardPrompt, setWizardPrompt] = useState('');
  const [wizardQuestions, setWizardQuestions] = useState<WizardQuestion[]>([]);
  const [wizardAnswers, setWizardAnswers] = useState<Record<string, string>>({});
  const [lastPrompt, setLastPrompt] = useState('');
  const [lastAnswers, setLastAnswers] = useState<Record<string, string>>({});
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotBusy, setScreenshotBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  const filePaths = useMemo(() => files.filter((file) => file.type === 'file'), [files]);
  const visibleFiles = useMemo(() => files.filter((file) => {
    const parts = file.path.replace(/\/$/, '').split('/');
    return parts.slice(0, -1).every((_, index) => expanded.has(parts.slice(0, index + 1).join('/')));
  }), [expanded, files]);

  const loadFiles = useCallback(async () => {
    const { response, data } = await apiJson<{ files?: WorkspaceFile[] }>(`/api/jarvis/workspace?workspaceId=${encodeURIComponent(workspaceId)}`);
    if (!response.ok) return;
    setFiles(data.files ?? []);
    onRefreshFiles?.();
  }, [onRefreshFiles, workspaceId]);

  const loadSavedApps = useCallback(async () => {
    const { response, data } = await apiJson<SavedApp[]>('/api/jarvis/build/apps');
    if (response.ok) setSavedApps(data);
  }, []);

  const loadEnvironment = useCallback(async () => {
    const { response, data } = await apiJson<{ env?: Record<string, string> }>(`/api/jarvis/build/env?workspaceId=${encodeURIComponent(workspaceId)}`);
    if (response.ok) {
      const next = data.env ?? {};
      setEnv(next);
      setEnvDraft(Object.entries(next).map(([key, value]) => `${key}=${value}`).join('\n'));
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!open) return;
    void loadFiles(); void loadSavedApps(); void loadEnvironment();
    return () => { streamRef.current?.close(); streamRef.current = null; };
  }, [loadEnvironment, loadFiles, loadSavedApps, open]);

  const openFile = async (path: string) => {
    const { response, data } = await apiJson<{ content?: string }>(`/api/jarvis/workspace?workspaceId=${encodeURIComponent(workspaceId)}&path=${encodeURIComponent(path)}`);
    if (!response.ok) return;
    setSelectedPath(path); setContent(data.content ?? ''); setDirty(false); setTab('editor');
    setOpenPaths((current) => current.includes(path) ? current : [...current, path]);
  };

  const saveFile = async () => {
    if (!selectedPath) return;
    setBusy(true);
    const { response } = await apiJson('/api/jarvis/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, path: selectedPath, content }) });
    setBusy(false); setNotice(response.ok ? 'File saved' : 'Could not save file');
    if (response.ok) { setDirty(false); void loadFiles(); }
  };

  const runCommand = async (command = terminalInput) => {
    const trimmed = command.trim();
    if (!trimmed || terminalRunning) return;
    setTerminalInput(''); setTerminalRunning(true); setTab('terminal');
    try {
      const { response, data } = await apiJson<TerminalResult & { stdout?: string; stderr?: string; timedOut?: boolean; error?: string }>('/api/jarvis/terminal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, sessionId: 'studio', command: trimmed }) });
      const output = data.output ?? ([data.stdout, data.stderr].filter(Boolean).join('\n') || data.error || (data.timedOut ? 'Command timed out' : !response.ok ? 'Command failed' : ''));
      setTerminalLines((current) => [...current, { command: trimmed, exitCode: data.exitCode ?? (response.ok ? 0 : 1), output }]);
      await loadFiles();
    } finally { setTerminalRunning(false); }
  };

  const startStreamingCommand = async () => {
    const command = terminalInput.trim();
    if (!command || terminalRunning) return;
    setTerminalInput(''); setTerminalRunning(true); setTab('terminal');
    const { response, data } = await apiJson<{ id?: string; error?: string }>('/api/jarvis/terminal/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, sessionId: 'studio-live', command }) });
    if (!response.ok || !data.id) { setNotice(data.error ?? 'Could not start terminal'); setTerminalRunning(false); return; }
    setTerminalId(data.id);
    const stream = new EventSource(`/api/jarvis/terminal/stream?id=${encodeURIComponent(data.id)}`);
    streamRef.current = stream;
    let output = '';
    stream.onmessage = (event) => {
      const next = JSON.parse(event.data) as { type: string; data?: string; exitCode?: number };
      if (next.type === 'snapshot' || next.type === 'output') { output += next.data ?? ''; setTerminalLines((current) => [...current.filter((line) => line.command !== command), { command, exitCode: null as unknown as number, output }]); }
      if (next.type === 'exit') { setTerminalLines((current) => [...current.filter((line) => line.command !== command), { command, exitCode: next.exitCode ?? 1, output }]); setTerminalRunning(false); setTerminalId(null); stream.close(); streamRef.current = null; void loadFiles(); }
    };
    stream.onerror = () => { setTerminalRunning(false); stream.close(); streamRef.current = null; };
  };

  const stopTerminal = async () => {
    if (!terminalId) return;
    await fetch('/api/jarvis/terminal/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: terminalId }) });
    streamRef.current?.close(); streamRef.current = null; setTerminalRunning(false); setTerminalId(null);
  };

  const createFile = async () => { const name = window.prompt(t('studio.build.newFile')); if (name) { await fetch('/api/jarvis/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, path: name, content: '' }) }); void loadFiles(); } };
  const createFolder = async () => { const name = window.prompt('Folder path'); if (name) { await fetch('/api/jarvis/workspace/mkdir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, path: name }) }); void loadFiles(); } };
  const renamePath = async (path: string) => { const next = window.prompt('Rename to', path.replace(/\/$/, '')); if (next && next !== path.replace(/\/$/, '')) { await fetch('/api/jarvis/workspace', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, from: path, to: next }) }); void loadFiles(); } };
  const deletePath = async (path: string) => { if (window.confirm(`Delete ${path}?`)) { await fetch(`/api/jarvis/workspace?workspaceId=${encodeURIComponent(workspaceId)}&path=${encodeURIComponent(path)}`, { method: 'DELETE' }); if (selectedPath === path) { setSelectedPath(null); setContent(''); } void loadFiles(); } };

  const doScaffold = async (prompt: string, answers: Record<string, string>, feedbackText: string | null) => {
    setBusy(true);
    const { response } = await apiJson('/api/jarvis/build/scaffold', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, prompt, answers, feedback: feedbackText }) });
    setBusy(false);
    if (response.ok) { setScaffoldPrompt(''); setLastPrompt(prompt); setLastAnswers(answers); setFeedback(''); setNotice(t('studio.build.starterCreated')); await loadFiles(); }
    else setNotice(t('studio.build.scaffoldFailed'));
  };

  const beginScaffold = async () => {
    const prompt = scaffoldPrompt.trim();
    if (!prompt) return;
    setWizardBusy(true);
    const { response, data } = await apiJson<{ questions?: WizardQuestion[] }>('/api/jarvis/build/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
    setWizardBusy(false);
    if (!response.ok) { void doScaffold(prompt, {}, null); return; }
    setWizardPrompt(prompt);
    setWizardQuestions(data.questions ?? []);
    setWizardAnswers({});
    setWizardOpen(true);
  };

  const applyFeedback = async () => {
    if (!feedback.trim() || busy) return;
    const prompt = lastPrompt || scaffoldPrompt.trim() || t('studio.build.defaultApp');
    await doScaffold(prompt, lastAnswers, feedback.trim());
  };

  const captureScreenshot = async () => {
    if (screenshotBusy) return;
    setScreenshotBusy(true);
    const { response, data } = await apiJson<{ dataUrl?: string; error?: string }>('/api/jarvis/build/screenshot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, sessionId: 'studio-preview', port: previewPort }) });
    setScreenshotBusy(false);
    if (response.ok && data.dataUrl) setScreenshot(data.dataUrl);
    else setNotice(data.error ?? t('studio.build.screenshotFailed'));
  };

  const saveEnv = async () => {
    const next = Object.fromEntries(envDraft.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => { const index = line.indexOf('='); return index > 0 ? [line.slice(0, index).trim(), line.slice(index + 1)] : ['', '']; }).filter(([key]) => key));
    const { response } = await apiJson('/api/jarvis/build/env', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, env: next }) });
    if (response.ok) { setEnv(next); setNotice('Environment saved'); }
  };

  const startPreview = async () => {
    setBusy(true);
    const { response, data } = await apiJson<{ url?: string; error?: string }>('/api/jarvis/build/preview/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, sessionId: 'studio-preview', command: previewCommand.replace('${PORT}', String(previewPort)), port: previewPort }) });
    setBusy(false);
    if (response.ok) { setPreviewRunning(true); setPreviewUrl(data.url ?? `http://localhost:${previewPort}`); setPreviewOutput('Starting preview...'); } else setNotice(data.error ?? 'Preview failed to start');
  };
  const stopPreview = async () => { await fetch('/api/jarvis/build/preview/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, sessionId: 'studio-preview' }) }); setPreviewRunning(false); setPreviewOutput('Preview stopped'); };
  useEffect(() => {
    if (!previewRunning) return;
    const timer = window.setInterval(() => { void apiJson<{ running?: boolean; output?: string }>(`/api/jarvis/build/preview/status?workspaceId=${encodeURIComponent(workspaceId)}&sessionId=studio-preview`).then(({ data }) => { setPreviewRunning(Boolean(data.running)); setPreviewOutput(data.output ?? ''); }); }, 2000);
    return () => window.clearInterval(timer);
  }, [previewRunning, workspaceId]);

  const saveApp = async () => { setBusy(true); const { response } = await apiJson('/api/jarvis/build/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, name: saveName.trim() || 'Untitled build', runCommand: previewCommand, previewPort }) }); setBusy(false); if (response.ok) { setSaveName(''); setNotice('Build app saved to Gallery'); await loadSavedApps(); } };
  const restoreApp = async (id: string) => { setBusy(true); const { response } = await apiJson(`/api/jarvis/build/apps/${id}/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId }) }); setBusy(false); if (response.ok) { setNotice('Build restored'); await loadFiles(); await loadEnvironment(); } };

  if (!open) return null;
  const tabs: [StudioTab, string, typeof Code2][] = [['editor', t('studio.build.editor'), Code2], ['terminal', t('studio.build.terminal'), Terminal], ['preview', t('studio.build.preview'), Play], ['packages', t('studio.build.packages'), Package], ['env', t('studio.build.env'), Upload], ['git', t('studio.build.git'), GitBranch]];
  return <AnimatePresence><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}><motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex h-[94vh] w-full max-w-[1400px] flex-col overflow-hidden rounded-t-3xl border border-border/60 bg-background shadow-apple-xl sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
    <header className="flex flex-wrap items-center gap-3 border-b border-border/40 px-4 py-3"><Hammer className="h-4 w-4 text-primary" /><div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold">{title}</h2><p className="text-[10px] text-muted-foreground">{t('studio.build.subtitle')} · project {workspaceId}</p></div><input value={saveName} onChange={(event) => setSaveName(event.target.value)} placeholder={t('studio.build.appName')} className="hidden w-32 rounded-lg border border-border/50 bg-secondary/40 px-2 py-1.5 text-xs outline-none sm:block" /><button type="button" onClick={() => void saveApp()} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"><Save className="h-3.5 w-3.5" />{t('studio.build.saveApp')}</button><button type="button" onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-secondary/70" aria-label={t('studio.build.close')}><X className="h-4 w-4" /></button></header>
    <div className="flex min-h-0 flex-1 flex-col md:flex-row"><aside className="flex w-full shrink-0 gap-1 overflow-x-auto border-b border-border/40 bg-secondary/10 p-2 md:w-56 md:flex-col md:border-b-0 md:border-r"><div className="mb-1 flex items-center justify-between px-2"><span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Explorer</span><div className="flex gap-1"><button type="button" onClick={() => void createFile()} title="New file" className="rounded p-1 hover:bg-secondary"><FilePlus2 className="h-3.5 w-3.5" /></button><button type="button" onClick={() => void createFolder()} title="New folder" className="rounded p-1 hover:bg-secondary"><FolderPlus className="h-3.5 w-3.5" /></button><button type="button" onClick={() => void loadFiles()} title="Refresh" className="rounded p-1 hover:bg-secondary"><RefreshCw className="h-3.5 w-3.5" /></button></div></div><div className="min-h-0 flex-1 overflow-auto">{visibleFiles.map((file) => { const clean = file.path.replace(/\/$/, ''); const depth = clean.split('/').length - 1; const isDir = file.type === 'dir'; return <div key={file.path} className="group flex items-center gap-1 rounded-lg px-2 py-1 text-xs hover:bg-secondary/70" style={{ paddingLeft: `${8 + depth * 12}px` }}><button type="button" className="flex min-w-0 flex-1 items-center gap-1 text-left" onClick={() => isDir ? setExpanded((current) => { const next = new Set(current); next.has(clean) ? next.delete(clean) : next.add(clean); return next; }) : void openFile(file.path)}>{isDir ? (expanded.has(clean) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />) : <span className="w-3" />}{isDir ? <Folder className="h-3.5 w-3.5 text-amber-400" /> : <Code2 className="h-3.5 w-3.5 text-primary" />}<span className="truncate">{clean.split('/').pop()}</span></button><button type="button" onClick={() => void renamePath(file.path)} className="hidden rounded p-1 text-muted-foreground hover:text-foreground group-hover:block" title="Rename">···</button><button type="button" onClick={() => void deletePath(file.path)} className="hidden rounded p-1 text-muted-foreground hover:text-rose-400 group-hover:block" title="Delete"><Trash2 className="h-3 w-3" /></button></div>; })}</div><div className="hidden border-t border-border/30 pt-3 md:block"><p className="mb-2 text-[9px] uppercase tracking-widest text-muted-foreground/60">{t('studio.build.savedApps')}</p>{savedApps.slice(0, 5).map((app) => <button type="button" key={app.id} onClick={() => void restoreApp(app.id)} className="mb-1 flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-left text-[10px] text-muted-foreground hover:bg-secondary/70 hover:text-foreground"><ChevronRight className="h-3 w-3" />{app.name}</button>)}</div></aside>
      <main className="min-h-0 flex-1 overflow-hidden"><div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border/30 bg-secondary/10 px-3 py-2">{tabs.map(([value, label, Icon]) => <button type="button" key={value} onClick={() => setTab(value)} className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs transition ${tab === value ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}</div>
        {tab === 'editor' && <div className="flex h-[calc(100%-49px)] min-h-0 flex-col"><div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border/30 px-3 py-2">{openPaths.map((path) => <button type="button" key={path} onClick={() => void openFile(path)} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] ${selectedPath === path ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>{path}{selectedPath === path && dirty ? ' ·' : ''}</button>)}<button type="button" onClick={() => void createFile()} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary"><Plus className="h-3.5 w-3.5" /></button></div>{selectedPath ? <><div className="flex items-center justify-between border-b border-border/30 px-3 py-2 text-[10px] text-muted-foreground"><span>{selectedPath} <span className="text-muted-foreground/50">{languageFor(selectedPath)}{dirty ? ' · unsaved' : ''}</span></span><button type="button" disabled={!dirty || busy} onClick={() => void saveFile()} className="flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1.5 text-primary disabled:opacity-40"><Save className="h-3 w-3" />Save</button></div><textarea value={content} onChange={(event) => { setContent(event.target.value); setDirty(true); }} spellCheck={false} className="min-h-0 flex-1 resize-none bg-[#0d1117] p-4 font-mono text-xs leading-6 text-[#d6deeb] outline-none" /></> : <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center"><Code2 className="h-10 w-10 text-primary/50" /><div><p className="text-sm font-semibold">{t('studio.build.openFile')}</p><p className="mt-1 max-w-md text-xs text-muted-foreground">{t('studio.build.openFileDesc')}</p></div><div className="flex w-full max-w-md gap-2"><input value={scaffoldPrompt} onChange={(event) => setScaffoldPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void beginScaffold(); }} placeholder={t('studio.build.scaffoldPlaceholder')} className="min-w-0 flex-1 rounded-xl border border-border/50 bg-secondary/40 px-3 py-2.5 text-xs outline-none" /><button type="button" onClick={() => void beginScaffold()} disabled={wizardBusy || !scaffoldPrompt.trim()} className="rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50">{t('studio.build.scaffold')}</button></div></div>}</div>}
        {tab === 'terminal' && <div className="flex h-[calc(100%-49px)] flex-col bg-[#0d1117] p-4"><div className="mb-3 flex items-center gap-2 text-xs text-[#91a4c1]"><Terminal className="h-4 w-4" />{t('studio.build.terminalHint')} · {workspaceId}</div><div className="min-h-0 flex-1 space-y-2 overflow-auto font-mono text-xs">{terminalLines.map((line, index) => <div key={index} className="rounded-lg border border-white/10 bg-white/[0.03] p-2"><div className="text-[#8fb3ff]">$ {line.command}</div><pre className="mt-1 whitespace-pre-wrap text-[#b9c5df]">{line.output || '(no output)'}</pre><div className={line.exitCode === 0 ? 'text-emerald-400' : line.exitCode == null ? 'text-amber-300' : 'text-rose-400'}>{line.exitCode == null ? 'running…' : `exit ${line.exitCode}`}</div></div>)}</div><form onSubmit={(event) => { event.preventDefault(); void runCommand(); }} className="mt-3 flex gap-2"><span className="py-2 font-mono text-[#8fb3ff]">$</span><input value={terminalInput} onChange={(event) => setTerminalInput(event.target.value)} placeholder={t('studio.build.commandPlaceholder')} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white outline-none focus:border-[#8fb3ff]" /><button type="button" disabled={terminalRunning} onClick={() => void startStreamingCommand()} className="rounded-lg border border-[#8fb3ff] px-3 py-2 text-xs text-[#8fb3ff] disabled:opacity-50">{terminalRunning ? 'Running' : 'Stream'}</button>{terminalRunning ? <button type="button" onClick={() => void stopTerminal()} className="rounded-lg bg-rose-500 px-3 py-2 text-xs font-medium text-white"><Square className="h-3 w-3" /></button> : <button type="submit" className="rounded-lg bg-[#8fb3ff] px-3 py-2 text-xs font-medium text-[#0d1117]">{t('studio.build.run')}</button>}</form></div>}
        {tab === 'preview' && <div className="flex h-[calc(100%-49px)] flex-col p-4"><div className="flex flex-wrap items-end gap-2 rounded-2xl border border-border/40 bg-secondary/20 p-3"><label className="flex-1 text-[10px] text-muted-foreground">{t('studio.build.runCommand')}<input value={previewCommand} onChange={(event) => setPreviewCommand(event.target.value)} className="mt-1 w-full rounded-lg border border-border/50 bg-background/50 px-2.5 py-2 font-mono text-xs outline-none" /></label><label className="w-24 text-[10px] text-muted-foreground">{t('studio.build.port')}<input type="number" min={1024} max={65535} value={previewPort} onChange={(event) => setPreviewPort(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-border/50 bg-background/50 px-2.5 py-2 font-mono text-xs outline-none" /></label><button type="button" disabled={screenshotBusy} onClick={() => void captureScreenshot()} title={t('studio.build.screenshotHint')} className="flex items-center gap-1.5 rounded-lg border border-border/50 px-3 py-2 text-xs disabled:opacity-50">{screenshotBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}{t('studio.build.screenshot')}</button>{previewRunning ? <button type="button" onClick={() => void stopPreview()} className="flex items-center gap-1.5 rounded-lg border border-rose-400/40 px-3 py-2 text-xs text-rose-400"><Square className="h-3 w-3" />Stop</button> : <button type="button" disabled={busy} onClick={() => void startPreview()} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"><Play className="h-3 w-3" />{t('studio.build.runPreview')}</button>}</div>{previewUrl ? <iframe title="Build preview" src={`${previewUrl}?workspace=${encodeURIComponent(workspaceId)}`} className="mt-3 min-h-0 flex-1 rounded-2xl border border-border/40 bg-white" /> : <div className="flex flex-1 items-center justify-center text-center text-xs text-muted-foreground">{t('studio.build.previewEmpty')}</div>}{screenshot && <div className="mt-2 flex shrink-0 items-stretch gap-3 rounded-2xl border border-border/40 bg-secondary/20 p-3"><img src={screenshot} alt="Preview screenshot" className="h-28 w-44 shrink-0 rounded-xl border border-border/40 object-cover object-top" /><div className="flex min-w-0 flex-1 flex-col gap-2"><p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{t('studio.build.screenshot')}</p><input value={feedback} onChange={(event) => setFeedback(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void applyFeedback(); }} placeholder={t('studio.build.feedbackPlaceholder')} className="min-w-0 flex-1 rounded-lg border border-border/50 bg-background/50 px-2.5 py-2 text-xs outline-none" /><div className="flex items-center gap-2"><button type="button" disabled={busy || !feedback.trim()} onClick={() => void applyFeedback()} className="flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50">{busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}{t('studio.build.applyChanges')}</button><button type="button" onClick={() => setScreenshot(null)} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button></div></div></div>}<pre className="mt-2 max-h-24 overflow-auto rounded-xl bg-secondary/30 p-2 font-mono text-[10px] text-muted-foreground">{previewOutput}</pre></div>}
        {tab === 'packages' && <div className="space-y-4 p-5"><Package className="h-7 w-7 text-primary" /><div><h3 className="text-sm font-semibold">{t('studio.build.packagesTitle')}</h3><p className="mt-1 text-xs text-muted-foreground">{t('studio.build.packagesDesc')}</p></div><button type="button" onClick={() => { setTab('terminal'); setTerminalInput('npm install '); }} className="rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">{t('studio.build.prepareNpm')}</button><button type="button" onClick={() => { setTab('terminal'); setTerminalInput('python3 -m pip install '); }} className="ml-2 rounded-xl border border-border/50 px-3 py-2 text-xs font-medium">{t('studio.build.preparePip')}</button></div>}
        {tab === 'env' && <div className="space-y-4 p-5"><Upload className="h-7 w-7 text-primary" /><div><h3 className="text-sm font-semibold">{t('studio.build.environmentTitle')}</h3><p className="mt-1 text-xs text-muted-foreground">{t('studio.build.environmentDesc')}</p></div><textarea value={envDraft} onChange={(event) => setEnvDraft(event.target.value)} placeholder={t('studio.build.environmentPlaceholder')} spellCheck={false} className="min-h-48 w-full rounded-2xl border border-border/50 bg-secondary/30 p-3 font-mono text-xs outline-none" /><button type="button" onClick={() => void saveEnv()} className="rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">{t('studio.build.saveEnvironment')}</button><p className="text-[10px] text-muted-foreground">{Object.keys(env).length} {t('studio.build.savedVariables')}</p></div>}
        {tab === 'git' && <div className="space-y-4 p-5"><GitBranch className="h-7 w-7 text-primary" /><div><h3 className="text-sm font-semibold">{t('studio.build.gitTitle')}</h3><p className="mt-1 text-xs text-muted-foreground">{t('studio.build.gitDesc')}</p></div><div className="flex flex-wrap gap-2">{['git status', 'git init', 'git add .', 'git log --oneline -5'].map((command) => <button type="button" key={command} onClick={() => { setTab('terminal'); void runCommand(command); }} className="rounded-xl border border-border/50 px-3 py-2 font-mono text-[11px] hover:bg-secondary/70">{command}</button>)}</div><p className="text-[10px] text-muted-foreground">Git credentials are not injected by Build Studio. Review every remote and push command before running it.</p></div>}
      </main></div>{wizardOpen && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setWizardOpen(false)}><div className="max-h-[85vh] w-full max-w-md overflow-auto rounded-3xl border border-border/60 bg-background p-5 shadow-apple-xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">{t('studio.build.askTitle')}</h3></div><p className="mt-1 text-xs text-muted-foreground">{t('studio.build.askDesc')}</p><div className="mt-4 space-y-4">{wizardQuestions.map((question) => <div key={question.key}><p className="mb-1.5 text-xs font-medium">{question.label}</p><div className="flex flex-wrap gap-1.5">{question.options?.map((option) => { const selected = wizardAnswers[question.key] === option; return <button type="button" key={option} onClick={() => setWizardAnswers((current) => ({ ...current, [question.key]: option }))} className={`rounded-full border px-2.5 py-1 text-[11px] transition ${selected ? 'border-primary bg-primary/10 text-primary' : 'border-border/50 text-muted-foreground hover:border-primary/40 hover:text-foreground'}`}>{option}</button>; })}<button type="button" onClick={() => setWizardAnswers((current) => { const next = { ...current }; delete next[question.key]; return next; })} className="rounded-full px-2 py-1 text-[11px] text-muted-foreground/60 hover:text-foreground">{t('studio.build.skip')}</button></div></div>)}</div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => { setWizardOpen(false); void doScaffold(wizardPrompt, {}, null); }} className="rounded-xl border border-border/50 px-3 py-2 text-xs">{t('studio.build.skipAll')}</button><button type="button" disabled={wizardBusy} onClick={() => { setWizardOpen(false); void doScaffold(wizardPrompt, wizardAnswers, null); }} className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"><Hammer className="h-3.5 w-3.5" />{t('studio.build.buildIt')}</button></div></div></div>}{notice && <button type="button" onClick={() => setNotice(null)} className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full border border-border/50 bg-background/95 px-4 py-2 text-xs shadow-lg">{notice} <Check className="ml-1 inline h-3 w-3 text-emerald-400" /></button>}{busy && <Loader2 className="absolute bottom-5 right-5 h-4 w-4 animate-spin text-primary" />}</motion.div></motion.div></AnimatePresence>;
}
