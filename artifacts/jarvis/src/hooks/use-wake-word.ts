import { useRef, useCallback } from 'react';

// Extend window for webkit prefix
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

export function isWakeWordSupported(): boolean {
  return !!(
    typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition)
  );
}

function soundsLikeWakeWord(text: string): boolean {
  const lower = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  // Direct and near-phonetic matches for "hey jarvis"
  const wakePatterns = [
    /\bhey\s+jarvis\b/,
    /\bhey\s+j[ua]rv[ei]s\b/,
    /\bhey\s+j[ua]h+s?\b/,
    /\bhey\s+j[ua]v[ie]s\b/,
    /\bhey\s+j[ua]rr\b/,
    /\bhey\s+j[ua]r\b/,
    /\bjarvis\b/,
    /\bj[ua]rv[ei]s\b/,
    /\bj[ua]v[ie]s\b/,
  ];
  return wakePatterns.some((p) => p.test(lower));
}

interface UseWakeWordOptions {
  onWake: () => void;
  onReleased?: () => void; // fires when the recognizer's onend fires after a wake word
  onError?: (msg: string) => void;
}

export function useWakeWord({ onWake, onReleased, onError }: UseWakeWordOptions) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const activeRef = useRef(false);
  const triggeredRef = useRef(false);
  const onWakeRef = useRef(onWake);
  const onReleasedRef = useRef(onReleased);
  const onErrorRef = useRef(onError);

  onWakeRef.current = onWake;
  onReleasedRef.current = onReleased;
  onErrorRef.current = onError;

  const start = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      onErrorRef.current?.('Speech recognition is not supported in this browser. Try Chrome or Edge.');
      return;
    }

    if (activeRef.current || triggeredRef.current) return;
    activeRef.current = true;

    const recognition = new SR();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (triggeredRef.current) return;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i]?.[0]?.transcript?.trim() ?? '';
        if (!transcript) continue;
        if (soundsLikeWakeWord(transcript)) {
          triggeredRef.current = true;
          activeRef.current = false;
          recognitionRef.current = null;
          onWakeRef.current();
          // Stop AFTER clearing refs so onend knows we triggered intentionally.
          // onend will call onReleased once the mic is truly free.
          try { recognition.stop(); } catch { /* noop */ }
          return;
        }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech' || event.error === 'aborted') {
        // Expected during silence; restart if still active
        if (activeRef.current && !triggeredRef.current) {
          try { recognition.start(); } catch { /* noop */ }
        }
      } else if (event.error === 'not-allowed') {
        onErrorRef.current?.('Microphone access denied. Wake word needs the microphone.');
      } else {
        onErrorRef.current?.(`Wake-word error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      if (triggeredRef.current) {
        // Wake word fired — mic is now fully released. Signal the caller so it
        // can safely start the next recognizer without a timeout guess.
        triggeredRef.current = false;
        onReleasedRef.current?.();
      } else if (activeRef.current) {
        // Session ended naturally while still listening for wake word — restart.
        try { recognition.start(); } catch { /* noop */ }
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {
      activeRef.current = false;
      onErrorRef.current?.('Could not start wake-word listener.');
    }
  }, []);

  const stop = useCallback(() => {
    activeRef.current = false;
    triggeredRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch { /* noop */ }
    recognitionRef.current = null;
  }, []);

  const reset = useCallback(() => {
    triggeredRef.current = false;
    if (activeRef.current) {
      stop();
      start();
    }
  }, [start, stop]);

  return { start, stop, reset };
}
