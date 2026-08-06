import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import path from "node:path";

/**
 * Stateful Terminal Session Manager
 * Maintains persistent shell sessions that survive across multiple commands.
 * Replaces ephemeral command execution with actual dev workflow.
 */

export interface TerminalSession {
  id: string;
  workspaceId: string;
  cwd: string;
  process: ChildProcess;
  state: "running" | "stopped" | "idle";
  lastCommand: string | null;
  commandHistory: string[];
  outputBuffer: string;
  emitter: EventEmitter;
}

export class TerminalSessionManager extends EventEmitter {
  private sessions: Map<string, TerminalSession> = new Map();
  private maxBufferSize = 1024 * 1024; // 1MB output buffer per session

  /**
   * Create or get existing terminal session.
   */
  createSession(sessionId: string, workspaceId: string, cwd: string): TerminalSession {
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId)!;
    }

    // Spawn bash shell with norestore (no history file interference)
    const child = spawn("bash", ["--norestore", "--norc"], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });

    const emitter = new EventEmitter();
    const session: TerminalSession = {
      id: sessionId,
      workspaceId,
      cwd,
      process: child,
      state: "idle",
      lastCommand: null,
      commandHistory: [],
      outputBuffer: "",
      emitter,
    };

    // Capture stdout
    child.stdout?.on("data", (data: Buffer) => {
      const output = data.toString();
      session.outputBuffer += output;

      // Trim buffer if it gets too large
      if (session.outputBuffer.length > this.maxBufferSize) {
        session.outputBuffer = session.outputBuffer.slice(-this.maxBufferSize);
      }

      emitter.emit("output", output);
    });

    // Capture stderr
    child.stderr?.on("data", (data: Buffer) => {
      const output = data.toString();
      session.outputBuffer += output;
      emitter.emit("error", output);
    });

    // Track exit code
    child.on("exit", (code) => {
      session.state = "stopped";
      emitter.emit("exit", code);
    });

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Execute command in existing session.
   * Returns promise that resolves when command completes.
   */
  executeCommand(sessionId: string, command: string): Promise<{ exitCode: number; output: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return Promise.reject(new Error("Session not found"));
    }

    return new Promise((resolve) => {
      if (!session.process.stdin) {
        resolve({ exitCode: 1, output: "stdin not available" });
        return;
      }

      // Clear output buffer for this command
      const oldBuffer = session.outputBuffer;
      session.outputBuffer = "";
      session.lastCommand = command;
      session.commandHistory.push(command);
      session.state = "running";

      // Write command with exit code capture
      const timestamp = Date.now();
      session.process.stdin.write(`${command}; echo "EXIT_CODE:$?" > /tmp/exit_${timestamp}\n`);

      // Wait for exit code file to be written
      let checkCount = 0;
      const checkInterval = setInterval(async () => {
        checkCount++;
        if (checkCount > 300) {
          // 30 second timeout
          clearInterval(checkInterval);
          session.state = "idle";
          resolve({ exitCode: 124, output: session.outputBuffer });
          return;
        }

        const output = session.outputBuffer;
        if (output.includes("EXIT_CODE:")) {
          clearInterval(checkInterval);
          session.state = "idle";
          resolve({ exitCode: 0, output });
          return;
        }
      }, 100);
    });
  }

  /**
   * Stream command output as EventSource (Server-Sent Events).
   */
  streamCommand(sessionId: string, command: string, onOutput: (output: string) => void, onExit: (code: number) => void): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      onExit(1);
      return;
    }

    session.state = "running";
    session.lastCommand = command;
    session.commandHistory.push(command);

    // Listener for this command's output
    const onDataListener = (output: string) => {
      onOutput(output);
    };

    const onExitListener = (code: number) => {
      session.emitter.removeListener("output", onDataListener);
      session.emitter.removeListener("exit", onExitListener);
      session.state = "idle";
      onExit(code || 0);
    };

    session.emitter.on("output", onDataListener);
    session.emitter.once("exit", onExitListener);

    // Execute command
    if (session.process.stdin) {
      session.process.stdin.write(`${command}\n`);
    }
  }

  /**
   * Stop terminal session.
   */
  stopSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.process.stdin) {
      session.process.stdin.write("exit\n");
    }
    session.process.kill("SIGTERM");

    setTimeout(() => {
      if (!session.process.killed) {
        session.process.kill("SIGKILL");
      }
    }, 5000);

    this.sessions.delete(sessionId);
  }

  /**
   * Get session history.
   */
  getHistory(sessionId: string): string[] {
    const session = this.sessions.get(sessionId);
    return session?.commandHistory || [];
  }

  /**
   * Get current working directory of session.
   */
  getCwd(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    return session?.cwd || "";
  }
}

// Singleton instance
export const globalTerminalManager = new TerminalSessionManager();
