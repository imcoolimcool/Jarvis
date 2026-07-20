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
  /**
   * Called when the recognizer was in direct-command mode (after activateCommand)
   * but timed out with no speech. Home can use this to revert UI back to wake state.
   */
  onCommandTimeout?: () => void;
}

export function useWakeWord({ onWake, onCommand, onError, onCommandTimeout }: UseWakeWordOptions) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const activeRef = useRef(false);

  // true while we're capturing the command (after wake word, before final result)
  const commandModeRef = useRef(false);
  // the result index at which the wake word was detected
  const wakeResultIndexRef = useRef(-1);
  // When true, all callbacks are silenced but the recognizer keeps running.
  // Used during TTS/thinking so we never have to restart from a non-gesture context
  // (which iOS WebKit blocks). The recognizer auto-restarts on onend using the same
  // instance, which iOS allows.
  const suppressedRef = useRef(false);

  const onWakeRef = useRef(onWake);
  const onCommandRef = useRef(onCommand);
  const onErrorRef = useRef(onError);
  const onCommandTimeoutRef = useRef(onCommandTimeout);

  onWakeRef.current = onWake;
  onCommandRef.current = onCommand;
  onErrorRef.current = onError;
  onCommandTimeoutRef.current = onCommandTimeout;

  // Ref so the onend fallback can call start() without a stale closure.
  const startRef = useRef<() => void>(() => {});

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
      // While suppressed (during TTS / thinking), keep the recognizer alive but
      // ignore all results so we don't send background noise as commands.
      if (suppressedRef.current) return;

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
        onCommandTimeoutRef.current?.();
      }

      // Restart in wake mode. Preferred: reuse the same instance (iOS allows .start()
      // on the same instance from onend, but blocks new instances from SR callbacks).
      // Fallback: if same instance refuses, escape the SR callback via setTimeout and
      // create a fresh instance (safe outside the callback context).
      try {
        recognition.start();
      } catch {
        activeRef.current = false;
        recognitionRef.current = null;
        setTimeout(() => {
          if (!activeRef.current) startRef.current();
        }, 300);
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

  // Always keep startRef pointing at start so the onend fallback can call it.
  startRef.current = start;

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

  /**
   * Silence all wake-word callbacks without stopping the recognizer.
   * iOS WebKit blocks recognition.start() outside a user gesture, so we must
   * keep the recognizer alive during TTS/thinking rather than stopping and
   * restarting it. Call this when Jarvis starts thinking or speaking.
   */
  const suppress = useCallback(() => {
    suppressedRef.current = true;
    // Also reset command mode so a stale command-mode state doesn't fire on unsuppress.
    commandModeRef.current = false;
    wakeResultIndexRef.current = -1;
  }, []);

  /**
   * Re-enable callbacks on the still-running recognizer.
   * Call this when returning to idle/wake state.
   */
  const unsuppress = useCallback(() => {
    suppressedRef.current = false;
  }, []);

  /**
   * Skip wake-word detection for one utterance — the next thing the user says
   * goes straight to onCommand. Always safe to call: if the recognizer is running
   * (even while suppressed), just flips refs — no recognition.start() needed,
   * so iOS never blocks it. If the recognizer somehow stopped, falls back to start().
   */
  const activateCommand = useCallback(() => {
    suppressedRef.current = false;
    commandModeRef.current = true;
    wakeResultIndexRef.current = -1;
    if (!activeRef.current) {
      // Fallback: recognizer was fully stopped (e.g. chat mode was active).
      // This path requires a user gesture on iOS; it won't be hit during normal
      // voice-mode TTS flow because suppress() keeps the recognizer alive.
      start();
      commandModeRef.current = true;
      wakeResultIndexRef.current = -1;
    }
  }, [start]);

  return { start, stop, reset, suppress, unsuppress, activateCommand };
}
