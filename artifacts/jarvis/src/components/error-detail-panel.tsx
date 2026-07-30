import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  AlertTriangle,
  Clock,
  Globe,
  Server,
  Cpu,
  FileCode,
  Layers,
  Terminal,
  X,
} from 'lucide-react';

/** Detailed error info sent from the backend */
export interface ErrorDetail {
  message: string;
  code: string;
  timestamp: string;
  statusCode: number;
  errorName: string;
  originalMessage: string;
  stack: string;
  request: {
    method: string;
    url: string;
    path: string;
    query: Record<string, unknown>;
    params: Record<string, unknown>;
    bodyKeys: string[];
    bodySizeBytes: number;
    contentType: string | undefined;
    userAgent: string | undefined;
    origin: string | undefined;
    referer: string | undefined;
    ip: string | undefined;
  };
  environment: {
    nodeEnv: string | undefined;
    port: string | undefined;
    llmModel: string | undefined;
    llmApiKeyConfigured: boolean;
    elevenLabsConfigured: boolean;
    tavilyConfigured: boolean;
    databaseUrlConfigured: boolean;
    uptimeSeconds: number;
    memoryUsageMB: {
      rss: number;
      heapUsed: number;
      heapTotal: number;
      external: number;
    };
  };
  durationMs: number | null;
  llm?: {
    model: string;
    endpoint: string;
    apiErrorCode: string | undefined;
    apiErrorMessage: string | undefined;
    apiErrorStatus: number | undefined;
    tokensUsed: number | undefined;
    requestId: string | undefined;
  };
}

interface ErrorDetailPanelProps {
  detail: ErrorDetail;
  onClose: () => void;
}

function Section({
  title,
  icon: Icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border/40 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-card/50 hover:bg-card transition-colors text-left"
      >
        <Icon className="w-3.5 h-3.5 text-primary/70 flex-shrink-0" />
        <span className="text-[11px] font-mono font-medium tracking-wider text-foreground/80 flex-1">
          {title}
        </span>
        {open ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground/50" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scaleY: 0.95 }}
            animate={{ opacity: 1, scaleY: 1 }}
            exit={{ opacity: 0, scaleY: 0.95 }}
            transition={{ duration: 0.15 }}
            className="origin-top overflow-hidden"
          >
            <div className="px-3 py-2 border-t border-border/30">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Row({ label, value, mono = true, color }: { label: string; value: string | number | boolean | undefined | null; mono?: boolean; color?: string }) {
  return (
    <div className="flex items-start gap-2 py-0.5">
      <span className="text-[10px] font-mono text-muted-foreground/60 tracking-wider min-w-[100px] flex-shrink-0 uppercase">
        {label}
      </span>
      <span
        className={`text-[11px] ${mono ? 'font-mono' : 'font-sans'} break-all ${
          color ?? 'text-foreground/80'
        }`}
      >
        {value === undefined || value === null ? (
          <span className="text-muted-foreground/40 italic">n/a</span>
        ) : typeof value === 'boolean' ? (
          value ? (
            <span className="text-green-400/80">yes</span>
          ) : (
            <span className="text-red-400/80">no</span>
          )
        ) : (
          String(value)
        )}
      </span>
    </div>
  );
}

function KeyValueBlock({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data);
  if (entries.length === 0)
    return (
      <span className="text-[10px] font-mono text-muted-foreground/40 italic">
        (empty)
      </span>
    );
  return (
    <div className="space-y-0.5">
      {entries.map(([k, v]) => (
        <Row key={k} label={k} value={typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')} />
      ))}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground/50 hover:text-foreground/70"
      title="Copy to clipboard"
    >
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

/** Status badge color based on HTTP status code */
function statusColor(code: number): string {
  if (code >= 500) return 'text-red-400 bg-red-400/10 border-red-400/30';
  if (code >= 400) return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30';
  return 'text-green-400 bg-green-400/10 border-green-400/30';
}

/** Severity color for error code */
function codeColor(code: string): string {
  if (code.includes('AUTH') || code.includes('RATE')) return 'text-red-400';
  if (code.includes('TIMEOUT') || code.includes('NETWORK')) return 'text-yellow-400';
  if (code.includes('DATABASE')) return 'text-orange-400';
  return 'text-primary';
}

export function ErrorDetailPanel({ detail, onClose }: ErrorDetailPanelProps) {
  const fullDump = JSON.stringify(detail, null, 2);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.97 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-x-0 bottom-0 z-[100] max-h-[85vh] bg-background border-t border-border/60 shadow-2xl overflow-hidden flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-card/50 backdrop-blur-md flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-display font-bold tracking-wider text-foreground truncate">
              ERROR DETAILS
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${statusColor(detail.statusCode)}`}>
                {detail.statusCode}
              </span>
              <span className={`text-[10px] font-mono font-bold tracking-wider ${codeColor(detail.code)}`}>
                {detail.code}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground/50">
                {detail.durationMs !== null ? `${detail.durationMs}ms` : ''}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <CopyButton text={fullDump} />
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 overscroll-contain">
        {/* Error message */}
        <div className="px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/20">
          <p className="text-xs font-mono text-red-400/90 leading-relaxed break-all">
            {detail.originalMessage}
          </p>
        </div>

        {/* Request Info */}
        <Section title="REQUEST" icon={Globe} defaultOpen={true}>
          <div className="space-y-0.5">
            <Row label="Method" value={detail.request.method} />
            <Row label="URL" value={detail.request.url} />
            <Row label="Path" value={detail.request.path} />
            {Object.keys(detail.request.query).length > 0 && (
              <Row label="Query" value={JSON.stringify(detail.request.query)} />
            )}
            {Object.keys(detail.request.params).length > 0 && (
              <Row label="Params" value={JSON.stringify(detail.request.params)} />
            )}
            <Row label="Body keys" value={detail.request.bodyKeys.join(', ') || '(none)'} />
            <Row label="Body size" value={`${detail.request.bodySizeBytes} bytes`} />
            <Row label="Content-Type" value={detail.request.contentType} />
            <Row label="User-Agent" value={detail.request.userAgent} />
            <Row label="Origin" value={detail.request.origin} />
            <Row label="Referer" value={detail.request.referer} />
            <Row label="IP" value={detail.request.ip} />
          </div>
        </Section>

        {/* Stack Trace */}
        <Section title="STACK TRACE" icon={Terminal} defaultOpen={true}>
          <div className="relative">
            <pre className="text-[10px] font-mono text-foreground/70 whitespace-pre-wrap break-all leading-relaxed bg-background/50 rounded-md p-2 border border-border/30 max-h-[200px] overflow-y-auto">
              {detail.stack}
            </pre>
            <div className="absolute top-1 right-1">
              <CopyButton text={detail.stack} />
            </div>
          </div>
        </Section>

        {/* Timestamp & Duration */}
        <Section title="TIMING" icon={Clock}>
          <div className="space-y-0.5">
            <Row label="Timestamp" value={detail.timestamp} />
            <Row label="Duration" value={detail.durationMs !== null ? `${detail.durationMs}ms` : 'n/a'} />
            <Row label="Server uptime" value={`${Math.floor(detail.environment.uptimeSeconds / 60)}m ${detail.environment.uptimeSeconds % 60}s`} />
          </div>
        </Section>

        {/* LLM Details (if present) */}
        {detail.llm && (
          <Section title="LLM / API" icon={FileCode}>
            <div className="space-y-0.5">
              <Row label="Model" value={detail.llm.model} />
              <Row label="Endpoint" value={detail.llm.endpoint} />
              <Row label="API status" value={detail.llm.apiErrorStatus} />
              <Row label="API error" value={detail.llm.apiErrorCode} />
              <Row label="API message" value={detail.llm.apiErrorMessage} />
              <Row label="Tokens" value={detail.llm.tokensUsed} />
              <Row label="Request ID" value={detail.llm.requestId} />
            </div>
          </Section>
        )}

        {/* Environment */}
        <Section title="ENVIRONMENT" icon={Cpu}>
          <div className="space-y-0.5">
            <Row label="Node env" value={detail.environment.nodeEnv} />
            <Row label="Port" value={detail.environment.port} />
            <Row label="LLM model" value={detail.environment.llmModel} />
            <Row label="LLM key" value={detail.environment.llmApiKeyConfigured} />
            <Row label="ElevenLabs key" value={detail.environment.elevenLabsConfigured} />
            <Row label="Tavily key" value={detail.environment.tavilyConfigured} />
            <Row label="Database URL" value={detail.environment.databaseUrlConfigured} />
          </div>
        </Section>

        {/* Memory Usage */}
        <Section title="MEMORY" icon={Layers}>
          <div className="space-y-0.5">
            <Row label="RSS" value={`${detail.environment.memoryUsageMB.rss} MB`} />
            <Row label="Heap used" value={`${detail.environment.memoryUsageMB.heapUsed} MB`} />
            <Row label="Heap total" value={`${detail.environment.memoryUsageMB.heapTotal} MB`} />
            <Row label="External" value={`${detail.environment.memoryUsageMB.external} MB`} />
            {/* Visual bar */}
            <div className="mt-2 h-2 rounded-full bg-muted/30 overflow-hidden">
              <div
                className="h-full bg-primary/40 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (detail.environment.memoryUsageMB.heapUsed / Math.max(1, detail.environment.memoryUsageMB.heapTotal)) * 100)}%`,
                }}
              />
            </div>
            <p className="text-[9px] font-mono text-muted-foreground/40 text-right">
              {Math.round((detail.environment.memoryUsageMB.heapUsed / Math.max(1, detail.environment.memoryUsageMB.heapTotal)) * 100)}% heap used
            </p>
          </div>
        </Section>

        {/* Full JSON dump */}
        <Section title="FULL JSON" icon={Server}>
          <div className="relative">
            <pre className="text-[9px] font-mono text-foreground/60 whitespace-pre-wrap break-all leading-relaxed bg-background/50 rounded-md p-2 border border-border/30 max-h-[300px] overflow-y-auto">
              {fullDump}
            </pre>
            <div className="absolute top-1 right-1">
              <CopyButton text={fullDump} />
            </div>
          </div>
        </Section>
      </div>
    </motion.div>
  );
}
