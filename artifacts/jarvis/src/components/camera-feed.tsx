import { useRef, useEffect, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Camera, RefreshCw, ImagePlus } from 'lucide-react';
import { useObjectDetection } from '@/hooks/use-object-detection';
import type { DetectionResult } from '@/hooks/use-object-detection';

interface CameraFeedProps {
  /** Css class name for the wrapper */
  className?: string;
  /** Enable object detection (uses TensorFlow.js COCO-SSD, FREE, runs in browser) */
  enableDetection?: boolean;
  /** Called when objects are detected */
  onDetections?: (detections: DetectionResult[]) => void;
  /** Called with the current snapshot frame as base64 */
  onSnapshot?: (base64: string) => void;
  /** Which classes to highlight (empty = highlight all) */
  highlightClasses?: string[];
  /** Called when the user taps "Upload a photo instead" in the error state */
  onUploadPhoto?: () => void;
}

/**
 * Live camera feed with optional TensorFlow.js object detection overlay.
 * Detects 80 object categories, completely free, runs in browser.
 *
 * Camera access can fail (permissions, non-secure context, iframe). When it
 * does we show a friendly error card with a Retry button and, when provided,
 * an "upload a photo instead" fallback, never a bare broken box.
 */
export function CameraFeed({
  className = '',
  enableDetection = false,
  onDetections,
  onSnapshot,
  highlightClasses = [],
  onUploadPhoto,
}: CameraFeedProps) {
  const webcamRef = useRef<Webcam | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
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
    setCameraError(null);
    setCameraReady(true);
  }, []);

  const handleUserMediaError = useCallback(() => {
    setCameraReady(false);
    setCameraError(
      'Camera unavailable. Your browser needs permission to use the camera (and the page must be served over HTTPS).',
    );
  }, []);

  const retry = useCallback(() => {
    setCameraError(null);
    setCameraReady(false);
    setRetryKey(k => k + 1);
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

  // Friendly error state, Retry + optional upload-photo fallback
  if (cameraError) {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 bg-muted/20 rounded-lg border border-border/50 p-6 text-center ${className}`}>
        <div className="w-10 h-10 rounded-full bg-secondary/60 flex items-center justify-center flex-shrink-0">
          <Camera className="w-[18px] h-[18px] text-muted-foreground" />
        </div>
        <p className="text-sm text-foreground/80 font-medium">Camera unavailable</p>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-[260px]">
          Allow camera access in your browser, or upload a photo instead and Jarvis will run detection on it.
        </p>
        <div className="flex gap-2 flex-wrap justify-center">
          <button
            onClick={retry}
            className="px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold hover:opacity-90 active:scale-95 transition-all flex items-center gap-1.5"
          >
            <RefreshCw className="w-3 h-3" />
            Try again
          </button>
          {onUploadPhoto && (
            <button
              onClick={onUploadPhoto}
              className="px-3 py-1.5 rounded-full border border-border/60 text-[11px] font-medium text-foreground/80 hover:bg-secondary/60 active:scale-95 transition-all flex items-center gap-1.5"
            >
              <ImagePlus className="w-3 h-3" />
              Upload a photo
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-lg border border-border/50 bg-black ${className}`}>
      {/* Camera feed, keyed so a retry fully remounts the webcam element */}
      <Webcam
        key={retryKey}
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
          Loading vision model…
        </div>
      )}

      {/* Model loaded indicator */}
      {enableDetection && modelLoaded && (
        <div className="absolute top-2 left-2 px-2 py-1 bg-background/80 backdrop-blur rounded text-[11px] font-mono text-green-400">
          Vision active
        </div>
      )}

      {/* Model error, non-blocking: the camera still works, detection is just off */}
      {enableDetection && modelError && !modelLoading && (
        <div className="absolute top-2 left-2 px-2 py-1 bg-background/80 backdrop-blur rounded text-[10px] font-mono text-amber-400">
          Detection unavailable, camera still works
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
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            {onSnapshot && (
              <button
                onClick={captureSnapshot}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-background/60 backdrop-blur border border-border/30 hover:bg-background/80 transition-colors"
                title="Capture snapshot"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
