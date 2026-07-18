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

/** Strip the wake phrase from the front of a transcript so only the command remains. */
function extractCommand(text: string): string {
  return text
    .replace(/^(hey\s+)?j[ua]r?v?[ie]?s?\s*/i, '')
    .replace(/^hey\s+/i, '')
    .trim();
}

interface UseWakeWordOptions {
  /** Wake word detected; the recognizer is still running to capture the command. */
  onWake: () => void;
  /**
   * Full command captured after the wake word — delivered within the same
   * recognizer session so iOS never needs to spawn a second instance.
   */
  onCommand: (text: string) => void;
  onError?: (msg: string) => void;
}

export function useWakeWord({ onWake, onCommand, onError }: UseWakeWordOptions) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const activeRef = useRef(false);

  // true while we're capturing the command (after wake word, before final result)
  const commandModeRef = useRef(false);
  // the result index at which the wake word was detected
  const wakeResultIndexRef = useRef(-1);

  const onWakeRef = useRef(onWake);
  const onCommandRef = useRef(onCommand);
  const onErrorRef = useRef(onError);

  onWakeRef.current = onWake;
  onCommandRef.current = onCommand;
  onErrorRef.current = onError;

  const start = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      onErrorRef.current?.('Speech recognition is not supported in this browser. Try Chrome or Edge.');
      return;
    }

    if (activeRef.current) return;
    activeRef.current = true;
    commandModeRef.current = false;
    wakeResultIndexRef.current = -1;

    const recognition = new SR();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result?.[0]?.transcript?.trim() ?? '';
        if (!transcript) continue;
        const isFinal = result.isFinal;

        if (!commandModeRef.current) {
          // ── WAKE MODE ──────────────────────────────────────────────────
          if (soundsLikeWakeWord(transcript)) {
            commandModeRef.current = true;
            wakeResultIndexRef.current = i;
            onWakeRef.current();

            // If the wake word result is already final, check for an inline command
            // (user said "hey jarvis what's the weather" in one breath).
            if (isFinal) {
              const cmd = extractCommand(transcript);
              if (cmd.length > 1) {
                commandModeRef.current = false;
                wakeResultIndexRef.current = -1;
                activeRef.current = false;
                try { recognition.stop(); } catch { /* noop */ }
                onCommandRef.current(cmd);
                return;
              }
              // No inline command — wait for the next utterance in command mode.
            }
          }
        } else {
          // ── COMMAND MODE ───────────────────────────────────────────────
          if (i === wakeResultIndexRef.current) {
            // Still processing the same result that contained the wake word.
            if (isFinal) {
              const cmd = extractCommand(transcript);
              if (cmd.length > 1) {
                commandModeRef.current = false;
                wakeResultIndexRef.current = -1;
                activeRef.current = false;
                try { recognition.stop(); } catch { /* noop */ }
                onCommandRef.current(cmd);
                return;
              }
            }
          } else if (i > wakeResultIndexRef.current && isFinal) {
            // A subsequent final result — this is the user's command.
            commandModeRef.current = false;
            wakeResultIndexRef.current = -1;
            activeRef.current = false;
            try { recognition.stop(); } catch { /* noop */ }
            onCommandRef.current(transcript);
            return;
          }
        }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech' || event.error === 'aborted') {
        // Expected; onend will handle restart.
      } else if (event.error === 'not-allowed') {
        activeRef.current = false;
        commandModeRef.current = false;
        onErrorRef.current?.('Microphone access denied. Wake word needs the microphone.');
      } else {
        onErrorRef.current?.(`Wake-word error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      if (!activeRef.current) return; // stopped intentionally

      if (commandModeRef.current) {
        // Session ended while waiting for a command (e.g. long silence).
        // Reset and restart in wake mode — user will need to say "hey jarvis" again.
        commandModeRef.current = false;
        wakeResultIndexRef.current = -1;
      }

      // Restart in wake mode using the SAME recognition object.
      // On iOS, .start() on the same instance from within onend is allowed;
      // creating a new instance here is what gets blocked.
      try { recognition.start(); } catch { /* noop */ }
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
    commandModeRef.current = false;
    wakeResultIndexRef.current = -1;
    try {
      recognitionRef.current?.stop();
    } catch { /* noop */ }
    recognitionRef.current = null;
  }, []);

  const reset = useCallback(() => {
    if (activeRef.current) {
      stop();
      start();
    }
  }, [start, stop]);

  return { start, stop, reset };
}
