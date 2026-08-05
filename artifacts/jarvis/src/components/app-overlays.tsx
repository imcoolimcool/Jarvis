import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { SettingsPanel } from '@/components/settings-panel';
import { ErrorDetailPanel, type ErrorDetail } from '@/components/error-detail-panel';
import { ResearchPanel, type ResearchJob } from '@/components/research-panel';
import { DataLab } from '@/components/data-lab';
import { GemDialog } from '@/components/gem-dialog';
import { CommandPalette } from '@/components/command-palette';
import { DesignStudio } from '@/components/design-studio';
import { MusicStudio } from '@/components/music-studio';
import { StudiosHub, type StudioId } from '@/components/studios-hub';
import { CommandCard } from '@/components/widgets/CommandCard';
import type { TerminalResult } from '@/types/widget';
import { Hammer, X, FolderTree, Folder, File } from 'lucide-react';

interface AppOverlaysProps {
  // Settings
  settingsOpen: boolean;
  onCloseSettings: () => void;
  theme: string;
  onToggleTheme: () => void;
  // Error
  errorDetail: ErrorDetail | null;
  onCloseError: () => void;
  // Research
  researchPanelOpen: boolean;
  researchJobs: ResearchJob[];
  onCloseResearch: () => void;
  onOpenGem: (convId: string) => void;
  onStartResearch: () => void;
  onCancelResearch: (jobId: string) => Promise<void>;
  // Gem + DataLab + CommandPalette
  gemDialogOpen: boolean;
  onCloseGem: () => void;
  onGemCreated: (conv: { id: string; title: string }) => void;
  dataLabOpen: boolean;
  onCloseDataLab: () => void;
  onDataLabAsk: (summaryText: string) => void;
  paletteOpen: boolean;
  onClosePalette: () => void;
  onOpenGemFromPalette: () => void;
  onOpenDataLabFromPalette: () => void;
  onOpenConversation: (id: string) => void;
  onNewChat: () => void;
  onNavigate: (mode: 'voice' | 'chat' | 'agent' | 'camera') => void;
  onOpenResearch: () => void;
  onToggleWebSearch: () => void;
  onOpenSettings: () => void;
  // Build Mode
  buildPanelOpen: boolean;
  buildTab: 'terminal' | 'files';
  setBuildTab: (tab: 'terminal' | 'files') => void;
  onCloseBuild: () => void;
  buildFiles: { path: string; type: 'file' | 'dir'; size: number }[];
  onRefreshBuildFiles: () => void;
  sessionCommands: TerminalResult[];
  commandInput: string;
  setCommandInput: (v: string) => void;
  commandBusy: boolean;
  buildTitle: string;
  // Studios / Design / Music
  studiosOpen: boolean;
  onCloseStudios: () => void;
  onSelectStudio: (id: StudioId) => void;
  designStudioOpen: boolean;
  onCloseDesign: () => void;
  designInitialImage?: string | null;
  musicStudioOpen: boolean;
  onCloseMusic: () => void;
  // Research pulse chip
  showResearchPulse: boolean;
}

export function AppOverlays(props: AppOverlaysProps) {
  const handleBuildSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = props.commandInput.trim();
    if (!cmd || props.commandBusy) return;
    props.setCommandInput('');
    try {
      const res = await fetch('/api/jarvis/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'default', command: cmd }),
      });
      const data = await res.json();
      // sessionCommands is managed by parent; we add via the SSE stream, this form is manual
    } catch { /* handled by parent SSE */ }
  };

  return (
    <>
      {/* ── Build Mode workspace panel ── */}
      <AnimatePresence>
        {props.buildPanelOpen && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
            className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={props.onCloseBuild}
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-3xl h-[85vh] sm:h-[80vh] bg-background border border-border/50 rounded-t-3xl sm:rounded-3xl shadow-apple-2xl overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Hammer className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">{props.buildTitle}</span>
                  <span className="text-[10px] font-mono text-muted-foreground/50 hidden sm:inline">artifacts/workspace</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => props.setBuildTab('terminal')} className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${props.buildTab === 'terminal' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>Terminal</button>
                  <button onClick={() => { props.setBuildTab('files'); props.onRefreshBuildFiles(); }} className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${props.buildTab === 'files' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>Files</button>
                  <button onClick={props.onCloseBuild} className="p-2 rounded-full hover:bg-muted/50 text-muted-foreground transition-colors ml-1" title="Close"><X className="w-4 h-4" /></button>
                </div>
              </div>
              {/* Body */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                {props.buildTab === 'terminal' ? (
                  <div className="p-3">
                    <p className="text-[10px] font-mono tracking-widest text-muted-foreground/50 uppercase mb-2">Commands the AI ran</p>
                    {props.sessionCommands.length === 0 ? (
                      <p className="text-xs text-muted-foreground/60 mb-3">No commands yet — ask Jarvis to build something and every command shows up here as a clean card.</p>
                    ) : (
                      <div className="space-y-1 mb-3">{props.sessionCommands.map((tr, i) => <CommandCard key={i} result={tr} />)}</div>
                    )}
                    <form onSubmit={handleBuildSubmit} className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground/50">$</span>
                      <input value={props.commandInput} onChange={(e) => props.setCommandInput(e.target.value)} placeholder="run a command (optional)" className="flex-1 min-w-0 bg-muted/40 border border-border/30 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-primary/40 transition-colors" spellCheck={false} />
                      <button type="submit" disabled={props.commandBusy} className="px-3 py-2 rounded-lg bg-primary/10 text-primary text-[11px] font-medium hover:bg-primary/15 transition-colors disabled:opacity-50">Run</button>
                    </form>
                  </div>
                ) : (
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-mono tracking-widest text-muted-foreground/50 uppercase">Workspace files</p>
                      <button onClick={props.onRefreshBuildFiles} className="flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary transition-colors"><FolderTree className="w-3.5 h-3.5" /> refresh</button>
                    </div>
                    {props.buildFiles.length === 0 ? (
                      <p className="text-xs text-muted-foreground/60">Empty workspace — ask Jarvis to build something, then run files here.</p>
                    ) : (
                      <div className="rounded-xl border border-border/30 bg-muted/20 divide-y divide-border/20">
                        {props.buildFiles.map((f) => (
                          <div key={f.path} className="flex items-center justify-between px-3 py-1.5 text-xs">
                            <span className={`flex items-center gap-1.5 font-mono truncate ${f.type === 'dir' ? 'text-foreground/80 font-medium' : 'text-muted-foreground'}`}>
                              {f.type === 'dir' ? <Folder className="w-3.5 h-3.5 flex-shrink-0" /> : <File className="w-3.5 h-3.5 flex-shrink-0" />}
                              {f.path}
                            </span>
                            <span className="text-[10px] text-muted-foreground/40 font-mono flex-shrink-0 ml-2">{f.type === 'file' ? `${f.size} B` : ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Research pulse chip ── */}
      <AnimatePresence>
        {props.showResearchPulse && (
          <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
            onClick={props.onOpenResearch}
            className="fixed z-40 bottom-24 right-4 flex items-center gap-2 px-3 py-2 rounded-full border border-border/60 bg-background/90 backdrop-blur-xl shadow-apple-lg hover:bg-secondary/70 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
            <span className="text-[10px] font-mono text-muted-foreground">DEEP RESEARCH</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Studios hub ── */}
      <StudiosHub open={props.studiosOpen} onClose={props.onCloseStudios} onSelect={props.onSelectStudio} />

      {/* ── Design Studio ── */}
      <DesignStudio open={props.designStudioOpen} onClose={props.onCloseDesign} initialImage={props.designInitialImage} />

      {/* ── Music Studio ── */}
      <MusicStudio open={props.musicStudioOpen} onClose={props.onCloseMusic} />

      {/* ── Settings ── */}
      <SettingsPanel open={props.settingsOpen} onClose={props.onCloseSettings} theme={props.theme as 'dark' | 'light' | 'auto'} onToggleTheme={props.onToggleTheme as any} />

      {/* ── Error Detail ── */}
      <AnimatePresence>
        {props.errorDetail && <ErrorDetailPanel detail={props.errorDetail} onClose={props.onCloseError} />}
      </AnimatePresence>

      {/* ── Research Panel ── */}
      <AnimatePresence>
        {props.researchPanelOpen && (
          <ResearchPanel
            jobs={props.researchJobs}
            onClose={props.onCloseResearch}
            onOpenGem={props.onOpenGem}
            onStarted={props.onStartResearch}
            onCancel={props.onCancelResearch}
          />
        )}
      </AnimatePresence>

      {/* ── Gem Dialog ── */}
      <GemDialog open={props.gemDialogOpen} onClose={props.onCloseGem} onCreated={props.onGemCreated} />

      {/* ── Data Lab ── */}
      <DataLab open={props.dataLabOpen} onClose={props.onCloseDataLab} onAskJarvis={props.onDataLabAsk} />

      {/* ── Command Palette ── */}
      <CommandPalette
        open={props.paletteOpen}
        onClose={props.onClosePalette}
        onNavigate={props.onNavigate}
        onOpenResearch={props.onOpenResearch}
        onOpenGem={props.onOpenGemFromPalette}
        onOpenDataLab={props.onOpenDataLabFromPalette}
        onToggleWebSearch={props.onToggleWebSearch}
        onToggleTheme={props.onToggleTheme as any}
        onOpenSettings={props.onOpenSettings}
        onOpenConversation={props.onOpenConversation}
        onNewChat={props.onNewChat}
      />
    </>
  );
}
