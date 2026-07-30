import { useRef, useEffect, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { useObjectDetection } from '@/hooks/use-object-detection';
import type { DetectionResult } from '@/hooks/use-object-detection';

interface CameraFeedProps {
  /** Css class name for the wrapper */
  className?: string;
  /** Enable object detection (uses TensorFlow.js COCO-SSD — FREE, runs in browser) */
  enableDetection?: boolean;
  /** Called when objects are detected */
  onDetections?: (detections: DetectionResult[]) => void;
  /** Called with the current snapshot frame as base64 */
  onSnapshot?: (base64: string) => void;
  /** Which classes to highlight (empty = highlight all) */
  highlightClasses?: string[];
}

/**
 * Live camera feed with optional TensorFlow.js object detection overlay.
 * Detects 80 object categories — completely free, runs in browser.
 */
export function CameraFeed({
  className = '',
  enableDetection = false,
  onDetections,
  onSnapshot,
  highlightClasses = [],
}: CameraFeedProps) {
  const webcamRef = useRef<Webcam | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [streaming, setStreaming] = useState(true);
  const animFrameRef = useRef<number | null>(null);

  const {
    modelLoaded,
    loading: modelLoading,
    error: modelError,
    detections,
    setVideo,
    startDetection,
    stopDetection,
    detectOnce,
  } = useObjectDetection({
    enabled: enableDetection,
    detectionInterval: 1000,
    minScore: 0.5,
  });

  // Connect webcam video to detection model
  useEffect(() => {
    if (cameraReady && enableDetection && webcamRef.current?.video) {
      setVideo(webcamRef.current.video);
      startDetection();
    }
    return () => {
      stopDetection();
    };
  }, [cameraReady, enableDetection, setVideo, startDetection, stopDetection]);

  // Notify parent of detections
  useEffect(() => {
    if (detections.length > 0 && onDetections) {
      onDetections(detections);
    }
  }, [detections, onDetections]);

  // Draw detection overlay on canvas
  const drawOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    const video = webcamRef.current?.video;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const animate = () => {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const toHighlight = highlightClasses.length > 0
        ? detections.filter((d) => highlightClasses.includes(d.class))
        : detections;

      for (const det of toHighlight) {
        const [x, y, w, h] = det.bbox;

        // Draw bounding box
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 10;
        ctx.strokeRect(x, y, w, h);
        ctx.shadowBlur = 0;

        // Draw label background
        const label = `${det.class} ${Math.round(det.score * 100)}%`;
        ctx.fillStyle = '#00ff88';
        ctx.font = 'bold 14px "Space Mono", monospace';
        const textWidth = ctx.measureText(label).width;
        ctx.fillRect(x, y - 22, textWidth + 10, 22);

        // Draw label text
        ctx.fillStyle = '#000';
        ctx.fillText(label, x + 5, y - 6);
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animate();
  }, [detections, highlightClasses]);

  // Start/stop overlay animation
  useEffect(() => {
    if (enableDetection && cameraReady) {
      drawOverlay();
    }
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [enableDetection, cameraReady, drawOverlay]);

  const handleUserMedia = useCallback(() => {
    setCameraReady(true);
  }, []);

  const handleUserMediaError = useCallback(() => {
    setCameraError('Could not access camera. Check permissions.');
  }, []);

  const captureSnapshot = useCallback(() => {
    const screenshot = webcamRef.current?.getScreenshot();
    if (screenshot && onSnapshot) {
      onSnapshot(screenshot);
    }
  }, [onSnapshot]);

  const toggleCamera = useCallback(() => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  }, []);

  if (cameraError) {
    return (
      <div className={`flex items-center justify-center bg-muted/30 rounded-lg border border-border/50 p-6 ${className}`}>
        <p className="text-sm text-muted-foreground">{cameraError}</p>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-lg border border-border/50 bg-black ${className}`}>
      {/* Camera feed */}
      <Webcam
        ref={webcamRef}
        audio={false}
        videoConstraints={{
          facingMode,
          width: { ideal: 640 },
          height: { ideal: 480 },
        }}
        onUserMedia={handleUserMedia}
        onUserMediaError={handleUserMediaError}
        className="w-full h-full object-cover"
        mirrored={facingMode === 'user'}
      />

      {/* Detection overlay canvas */}
      {enableDetection && cameraReady && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />
      )}

      {/* Model loading indicator */}
      {enableDetection && modelLoading && (
        <div className="absolute top-2 left-2 px-2 py-1 bg-background/80 backdrop-blur rounded text-[11px] font-mono text-primary">
          Loading vision model...
        </div>
      )}

      {/* Model loaded indicator */}
      {enableDetection && modelLoaded && (
        <div className="absolute top-2 left-2 px-2 py-1 bg-background/80 backdrop-blur rounded text-[11px] font-mono text-green-400">
          Vision active
        </div>
      )}

      {/* Model error */}
      {enableDetection && modelError && (
        <div className="absolute top-2 left-2 px-2 py-1 bg-destructive/80 backdrop-blur rounded text-[11px] font-mono text-destructive-foreground">
          {modelError}
        </div>
      )}

      {/* Controls overlay */}
      <div className="absolute bottom-2 right-2 flex gap-1.5">
        {streaming && (
          <>
            <button
              onClick={toggleCamera}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-background/60 backdrop-blur border border-border/30 hover:bg-background/80 transition-colors"
              title="Flip camera"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </button>
            {onSnapshot && (
              <button
                onClick={captureSnapshot}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-background/60 backdrop-blur border border-border/30 hover:bg-background/80 transition-colors"
                title="Capture snapshot"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                </svg>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
