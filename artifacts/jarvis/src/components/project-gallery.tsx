import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Archive, ChevronDown, Folder, FolderPlus, Image as ImageIcon, Library, Plus, Search, Trash2, X } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  color: string;
  archived: boolean;
}

interface GalleryFile {
  id: string;
  name: string;
  kind: string;
  mime: string;
  url: string;
  createdAt: string;
}

interface ProjectGalleryProps {
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
}

export function ProjectGallery({ activeConversationId, onSelectConversation }: ProjectGalleryProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [files, setFiles] = useState<GalleryFile[]>([]);
  const [expanded, setExpanded] = useState<'projects' | 'gallery' | null>(null);
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [projectChats, setProjectChats] = useState<{ id: string; title: string }[]>([]);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [projectDraft, setProjectDraft] = useState('');
  const [galleryFilter, setGalleryFilter] = useState('all');
  const [galleryQuery, setGalleryQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const response = await fetch('/api/jarvis/projects');
      if (response.ok) setProjects(await response.json());
    } catch { /* sidebar remains usable when storage is unavailable */ }
  }, []);

  const loadFiles = useCallback(async () => {
    try {
      const response = await fetch('/api/files');
      if (response.ok) setFiles((await response.json()).files ?? []);
    } catch { /* gallery is best effort */ }
  }, []);

  useEffect(() => {
    void loadProjects();
    void loadFiles();
  }, [loadProjects, loadFiles]);

  const selectProject = async (projectId: string) => {
    if (activeProject === projectId) {
      setActiveProject(null);
      setProjectChats([]);
      return;
    }
    setActiveProject(projectId);
    setExpanded('projects');
    try {
      const response = await fetch(`/api/jarvis/projects/${projectId}/chats`);
      if (response.ok) setProjectChats(await response.json());
    } catch { setProjectChats([]); }
  };

  const createProject = async () => {
    const name = projectDraft.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/jarvis/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (response.ok) {
        const created = await response.json() as Project;
        setProjects((current) => [created, ...current]);
        setProjectDraft('');
      }
    } finally { setBusy(false); }
  };

  const deleteProject = async (projectId: string) => {
    if (!window.confirm('Delete this project? Chats will remain in history.')) return;
    await fetch(`/api/jarvis/projects/${projectId}`, { method: 'DELETE' });
    setProjects((current) => current.filter((project) => project.id !== projectId));
    if (activeProject === projectId) setActiveProject(null);
  };

  const filteredFiles = files.filter((file) => {
    const matchesType = galleryFilter === 'all' || file.kind === galleryFilter;
    const matchesQuery = !galleryQuery.trim() || file.name.toLowerCase().includes(galleryQuery.trim().toLowerCase());
    return matchesType && matchesQuery;
  });

  return (
    <div className="px-2 pt-2 pb-1 space-y-1 border-b border-border/20">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => { setExpanded(expanded === 'projects' ? null : 'projects'); setGalleryOpen(false); }}
          className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium transition-colors ${expanded === 'projects' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'}`}
        >
          <Folder className="w-3.5 h-3.5" />
          <span className="flex-1 text-left">Projects</span>
          <ChevronDown className={`w-3 h-3 transition-transform ${expanded === 'projects' ? 'rotate-180' : ''}`} />
        </button>
        <button type="button" onClick={() => setGalleryOpen(true)} className="p-2 rounded-lg text-muted-foreground hover:bg-secondary/60 hover:text-foreground" title="Open Gallery">
          <Library className="w-3.5 h-3.5" />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expanded === 'projects' && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="px-2 pb-2 space-y-1">
              <div className="flex gap-1.5">
                <input value={projectDraft} onChange={(event) => setProjectDraft(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void createProject()} placeholder="New project" className="min-w-0 flex-1 rounded-lg bg-secondary/50 px-2.5 py-1.5 text-[11px] outline-none focus:ring-1 focus:ring-primary/40" />
                <button type="button" onClick={() => void createProject()} disabled={!projectDraft.trim() || busy} className="rounded-lg bg-primary/10 p-1.5 text-primary disabled:opacity-40"><FolderPlus className="w-3.5 h-3.5" /></button>
              </div>
              {projects.filter((project) => !project.archived).map((project) => (
                <div key={project.id}>
                  <div className={`group flex items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] ${activeProject === project.id ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-secondary/60'}`}>
                    <button type="button" onClick={() => void selectProject(project.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: project.color }} />
                      <span className="truncate">{project.name}</span>
                    </button>
                    <button type="button" onClick={() => void deleteProject(project.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground/50 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                  </div>
                  {activeProject === project.id && projectChats.length > 0 && (
                    <div className="ml-5 mt-0.5 space-y-0.5 border-l border-border/40 pl-2">
                      {projectChats.map((chat) => <button type="button" key={chat.id} onClick={() => onSelectConversation(chat.id)} className={`block w-full truncate rounded px-2 py-1 text-left text-[10px] hover:bg-secondary/60 ${activeConversationId === chat.id ? 'text-primary' : 'text-muted-foreground/70'}`}>{chat.title}</button>)}
                    </div>
                  )}
                </div>
              ))}
              {projects.length === 0 && <p className="px-2 py-1 text-[10px] text-muted-foreground/60">Create a project to group related chats.</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {galleryOpen && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center">
            <div className="liquid-glass flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-border/50 shadow-apple-xl">
              <div className="flex items-center gap-3 border-b border-border/30 px-5 py-4"><Library className="h-4 w-4 text-primary" /><h2 className="flex-1 text-sm font-semibold">Gallery</h2><button type="button" onClick={() => setGalleryOpen(false)} className="rounded-full p-2 text-muted-foreground hover:bg-secondary/70"><X className="h-4 w-4" /></button></div>
              <div className="flex flex-wrap gap-2 border-b border-border/20 px-5 py-3"><div className="flex min-w-[180px] flex-1 items-center gap-2 rounded-full bg-secondary/60 px-3 py-1.5"><Search className="h-3.5 w-3.5 text-muted-foreground/60" /><input value={galleryQuery} onChange={(event) => setGalleryQuery(event.target.value)} placeholder="Search files" className="min-w-0 flex-1 bg-transparent text-xs outline-none" /></div>{['all', 'image', 'document', 'code', 'audio', 'build-app'].map((filter) => <button type="button" key={filter} onClick={() => setGalleryFilter(filter)} className={`rounded-full px-3 py-1.5 text-[10px] capitalize ${galleryFilter === filter ? 'bg-primary/10 text-primary' : 'bg-secondary/50 text-muted-foreground'}`}>{filter === 'all' ? 'All' : filter}</button>)}</div>
              <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto p-5 sm:grid-cols-3">{filteredFiles.map((file) => <a key={file.id} href={file.url} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-2xl border border-border/40 bg-card/60 transition hover:border-primary/40 hover:shadow-lg">{file.mime.startsWith('image/') ? <img src={file.url} alt={file.name} className="aspect-square w-full object-cover" /> : <div className="flex aspect-square items-center justify-center bg-secondary/40"><ImageIcon className="h-8 w-8 text-muted-foreground/40" /></div>}<div className="truncate px-3 py-2 text-[10px] text-muted-foreground group-hover:text-foreground">{file.name}</div></a>)}{filteredFiles.length === 0 && <p className="col-span-full py-12 text-center text-xs text-muted-foreground/60">No files in the gallery yet.</p>}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
