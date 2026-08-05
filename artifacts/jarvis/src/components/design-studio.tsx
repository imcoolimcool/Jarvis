import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, Download, RotateCw, FlipHorizontal2, Type, X, ImagePlus, Sparkles, Loader2, Wand2 } from 'lucide-react';

interface DesignStudioProps {
  open: boolean;
  onClose: () => void;
  /** Pass a base64 image (e.g. the last generated image) to start editing it. */
  initialImage?: string | null;
}

const FILTERS = [
  { key: 'brightness', label: 'Brightness', min: 0, max: 200, def: 100, unit: '%' },
  { key: 'contrast', label: 'Contrast', min: 0, max: 200, def: 100, unit: '%' },
  { key: 'saturate', label: 'Saturate', min: 0, max: 300, def: 100, unit: '%' },
  { key: 'hue', label: 'Hue', min: 0, max: 360, def: 0, unit: '°' },
  { key: 'blur', label: 'Blur', min: 0, max: 10, def: 0, unit: 'px' },
  { key: 'grayscale', label: 'Grayscale', min: 0, max: 100, def: 0, unit: '%' },
  { key: 'sepia', label: 'Sepia', min: 0, max: 100, def: 0, unit: '%' },
  { key: 'invert', label: 'Invert', min: 0, max: 100, def: 0, unit: '%' },
] as const;

const CROP_PRESETS = [
  { label: 'Free', ratio: 0 },
  { label: '1:1', ratio: 1 },
  { label: '4:3', ratio: 4 / 3 },
  { label: '3:4', ratio: 3 / 4 },
  { label: '16:9', ratio: 16 / 9 },
  { label: '9:16', ratio: 9 / 16 },
];

const AI_SUGGESTIONS = [
  'A photorealistic husky in the snow, golden hour',
  'A 3D render of a glowing arc reactor, dark background',
  'A minimalist logo for a company called Stark Industries',
  'A dreamy anime landscape at sunset',
  'A product shot of a sleek white smartwatch on marble',
];

const AI_ASPECTS = [
  { label: 'Square', w: 1024, h: 1024 },
  { label: 'Landscape', w: 1280, h: 720 },
  { label: 'Portrait', w: 720, h: 1280 },
];

type FilterValues = Record<string, number>;

export function DesignStudio({ open, onClose, initialImage }: DesignStudioProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [imageLoaded, setImageLoaded] = useState(false);
  const [fileName, setFileName] = useState('');
  const [values, setValues] = useState<FilterValues>(() =>
    Object.fromEntries(FILTERS.map((f) => [f.key, f.def])) as FilterValues,
  );
  const [rotation, setRotation] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [cropRatio, setCropRatio] = useState(0);
  const [text, setText] = useState('');
  const [textSize, setTextSize] = useState(48);
  const [showTextPicker, setShowTextPicker] = useState(false);
  const [saved, setSaved] = useState(false);

  // ── AI generation state ───────────────────────────────────────
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiAspect, setAiAspect] = useState(AI_ASPECTS[0]);

  const loadImage = useCallback((src: string, name: string) => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setImageLoaded(true);
      setFileName(name);
      setSaved(false);
    };
    img.src = src;
  }, []);

  const handleGenerate = useCallback(async (prompt?: string) => {
    const finalPrompt = (prompt ?? aiPrompt).trim();
    if (!finalPrompt || generating) return;
    setGenerating(true);
    setAiError('');
    try {
      const res = await fetch('/api/jarvis/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: finalPrompt, width: aiAspect.w, height: aiAspect.h }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        setAiError(errBody?.error || `Generation failed (${res.status})`);
        return;
      }
      const data = await res.json();
      loadImage(data.image, 'ai-generated.png');
    } catch {
      setAiError('Generation failed, is the server running?');
    } finally {
      setGenerating(false);
    }
  }, [aiPrompt, aiAspect, generating, loadImage]);

  useEffect(() => {
    if (initialImage && initialImage.length > 100 && !imageLoaded) {
      loadImage(initialImage, 'generated.png');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialImage]);

  useEffect(() => {
    if (!open || !imageLoaded || !imgRef.current || !canvasRef.current) return;
    const img = imgRef.current;
    const canvas = canvasRef.current;
    const maxW = 1200;
    const scale = Math.min(1, maxW / img.naturalWidth);
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);

    // Apply crop ratio
    let cw = w; let ch = h;
    if (cropRatio > 0) {
      if (w / h > cropRatio) cw = Math.round(h * cropRatio);
      else ch = Math.round(w / cropRatio);
    }
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    if (flipped) ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();

    // Text overlay
    if (text.trim()) {
      ctx.font = `700 ${textSize}px -apple-system, 'SF Pro Display', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillText(text, cw / 2 + 2, ch / 2 + 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, cw / 2, ch / 2);
    }
  }, [imageLoaded, rotation, flipped, cropRatio, text, textSize, values]);

  const filterStyle = () => {
    const v = (k: string) => values[k] ?? 100;
    return `brightness(${v('brightness')}%) contrast(${v('contrast')}%) saturate(${v('saturate')}%) hue-rotate(${v('hue')}deg) blur(${v('blur')}px) grayscale(${v('grayscale')}%) sepia(${v('sepia')}%) invert(${v('invert')}%)`;
  };

  const resetAll = () => {
    setValues(Object.fromEntries(FILTERS.map((f) => [f.key, f.def])) as FilterValues);
    setRotation(0);
    setFlipped(false);
    setCropRatio(0);
    setText('');
    setSaved(false);
  };

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `jarvis-edit-${Date.now()}.png`;
    a.click();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-6" onClick={onClose}>
      <div
        className="w-full max-w-4xl max-h-[92vh] bg-background border border-border/50 rounded-3xl shadow-apple-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/40 flex-shrink-0">
          <div className="flex items-center gap-2">
            <ImagePlus className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Design Studio</span>
            <span className="text-[10px] font-mono text-muted-foreground/50 hidden sm:inline">
              AI generation · photo editing · in your browser
            </span>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted/50 text-muted-foreground transition-colors" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!imageLoaded ? (
          /* ── Empty state: AI generate or upload ── */
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 sm:p-10 text-center overflow-y-auto">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Wand2 className="w-7 h-7 text-primary" />
            </div>
            <div>
              <p className="text-base font-semibold mb-1">Generate with AI</p>
              <p className="text-xs text-muted-foreground/70 max-w-md">
                Describe an image, Jarvis generates it instantly with AI, then you can edit, filter and download it.
              </p>
            </div>

            {/* AI prompt box */}
            <div className="w-full max-w-lg">
              <div className="flex items-center gap-2 bg-muted/40 border border-border/40 rounded-2xl px-3 py-1 focus-within:border-primary/40 transition-colors">
                <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
                <input
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate(); }}
                  placeholder="A photorealistic husky in the snow…"
                  className="flex-1 min-w-0 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground/50"
                />
                <button
                  onClick={() => handleGenerate()}
                  disabled={generating || !aiPrompt.trim()}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none flex-shrink-0"
                >
                  {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                  {generating ? 'Generating…' : 'Generate'}
                </button>
              </div>

              {/* Aspect ratio */}
              <div className="flex items-center justify-center gap-1.5 mt-2">
                {AI_ASPECTS.map((a) => (
                  <button
                    key={a.label}
                    onClick={() => setAiAspect(a)}
                    className={`px-2.5 py-1 rounded-full text-[10.5px] transition-colors ${aiAspect.label === a.label ? 'bg-primary/10 text-primary' : 'bg-muted/30 text-muted-foreground hover:text-foreground'}`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>

              {/* Suggestion chips */}
              <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2">
                {AI_SUGGESTIONS.slice(0, 4).map((s) => (
                  <button
                    key={s}
                    onClick={() => { setAiPrompt(s); }}
                    className="px-2.5 py-1 rounded-full border border-border/40 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                  >
                    {s.length > 42 ? s.slice(0, 42) + '…' : s}
                  </button>
                ))}
              </div>

              {aiError && <p className="text-[11px] text-red-400 mt-2">{aiError}</p>}
            </div>

            <div className="flex items-center gap-2 w-full max-w-lg">
              <div className="flex-1 h-px bg-border/40" />
              <span className="text-[9px] font-mono text-muted-foreground/40 uppercase tracking-widest">or</span>
              <div className="flex-1 h-px bg-border/40" />
            </div>

            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-border/50 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
            >
              <Upload className="w-4 h-4" /> Upload your own image
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  const reader = new FileReader();
                  reader.onload = () => loadImage(String(reader.result), f.name);
                  reader.readAsDataURL(f);
                }
              }}
            />
          </div>
        ) : (
          <>
            {/* Editor body */}
            <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
              {/* Canvas preview */}
              <div className="flex-1 min-h-0 p-4 flex items-center justify-center bg-muted/20 overflow-auto">
                <canvas
                  ref={canvasRef}
                  style={{ filter: filterStyle() }}
                  className="max-w-full max-h-[50vh] lg:max-h-[calc(92vh-190px)] rounded-lg shadow-lg bg-checker"
                />
              </div>

              {/* Controls */}
              <div className="w-full lg:w-72 flex-shrink-0 border-t lg:border-t-0 lg:border-l border-border/40 p-4 overflow-y-auto max-h-[45vh] lg:max-h-none">
                <p className="text-[10px] font-mono tracking-widest text-muted-foreground/50 uppercase mb-3">{fileName}</p>

                {/* AI regenerate */}
                <p className="text-[10px] font-mono tracking-widest text-muted-foreground/50 uppercase mb-1.5">AI</p>
                <div className="flex items-center gap-1.5 mb-4">
                  <input
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate(); }}
                    placeholder="Describe a new image…"
                    className="flex-1 min-w-0 bg-muted/40 border border-border/30 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-primary/40 transition-colors"
                  />
                  <button
                    onClick={() => handleGenerate()}
                    disabled={generating || !aiPrompt.trim()}
                    className="p-2 rounded-lg bg-primary text-primary-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none"
                    title="Generate with AI"
                  >
                    {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
                {aiError && <p className="text-[11px] text-red-400 -mt-2 mb-3">{aiError}</p>}

                {/* Filters */}
                <div className="space-y-2.5 mb-4">
                  {FILTERS.map((f) => (
                    <label key={f.key} className="block">
                      <div className="flex items-center justify-between text-[11px] mb-0.5">
                        <span className="text-muted-foreground">{f.label}</span>
                        <span className="font-mono text-muted-foreground/60">{values[f.key]}{f.unit}</span>
                      </div>
                      <input
                        type="range"
                        min={f.min}
                        max={f.max}
                        value={values[f.key]}
                        onChange={(e) => setValues(v => ({ ...v, [f.key]: Number(e.target.value) }))}
                        className="w-full accent-[var(--primary)]"
                      />
                    </label>
                  ))}
                </div>

                {/* Crop */}
                <p className="text-[10px] font-mono tracking-widest text-muted-foreground/50 uppercase mb-1.5">Crop</p>
                <div className="flex flex-wrap gap-1 mb-4">
                  {CROP_PRESETS.map((c) => (
                    <button
                      key={c.label}
                      onClick={() => setCropRatio(c.ratio)}
                      className={`px-2.5 py-1 rounded-full text-[10.5px] transition-colors ${cropRatio === c.ratio ? 'bg-primary/10 text-primary' : 'bg-muted/30 text-muted-foreground hover:text-foreground'}`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                {/* Transform */}
                <p className="text-[10px] font-mono tracking-widest text-muted-foreground/50 uppercase mb-1.5">Transform</p>
                <div className="flex gap-1.5 mb-4">
                  <button
                    onClick={() => setRotation(r => (r + 90) % 360)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-muted/30 text-muted-foreground hover:text-foreground text-[10.5px] transition-colors"
                  >
                    <RotateCw className="w-3.5 h-3.5" /> Rotate
                  </button>
                  <button
                    onClick={() => setFlipped(f => !f)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[10.5px] transition-colors ${flipped ? 'bg-primary/10 text-primary' : 'bg-muted/30 text-muted-foreground hover:text-foreground'}`}
                  >
                    <FlipHorizontal2 className="w-3.5 h-3.5" /> Flip
                  </button>
                </div>

                {/* Text */}
                <p className="text-[10px] font-mono tracking-widest text-muted-foreground/50 uppercase mb-1.5">Text</p>
                <div className="flex items-center gap-1.5 mb-4">
                  <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Add a caption…"
                    className="flex-1 min-w-0 bg-muted/40 border border-border/30 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-primary/40 transition-colors"
                  />
                  <button
                    onClick={() => setShowTextPicker(o => !o)}
                    className={`p-2 rounded-lg transition-colors ${showTextPicker ? 'bg-primary/10 text-primary' : 'bg-muted/30 text-muted-foreground hover:text-foreground'}`}
                    title="Text size"
                  >
                    <Type className="w-3.5 h-3.5" />
                  </button>
                </div>
                {showTextPicker && (
                  <input
                    type="range"
                    min={18}
                    max={120}
                    value={textSize}
                    onChange={(e) => setTextSize(Number(e.target.value))}
                    className="w-full accent-[var(--primary)] mb-4"
                  />
                )}
              </div>
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-border/40 flex-shrink-0">
              <button onClick={resetAll} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                Reset
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-border/50 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" /> New image
                </button>
                <button
                  onClick={download}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[11px] font-medium transition-all active:scale-95 ${saved ? 'bg-green-500/15 text-green-500' : 'bg-primary text-primary-foreground hover:opacity-90'}`}
                >
                  <Download className="w-3.5 h-3.5" /> {saved ? 'Saved!' : 'Download PNG'}
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    const reader = new FileReader();
                    reader.onload = () => loadImage(String(reader.result), f.name);
                    reader.readAsDataURL(f);
                  }
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
