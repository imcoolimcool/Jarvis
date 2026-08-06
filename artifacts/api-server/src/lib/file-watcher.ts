import { watch, type FSWatcher } from "node:fs";
import { EventEmitter } from "node:events";
import path from "node:path";

/**
 * File Watcher for Hot Reload
 * Watches workspace directories and emits change events for preview auto-restart.
 */

export interface FileChangeEvent {
  type: "file" | "directory";
  event: "add" | "change" | "delete" | "rename";
  path: string;
  timestamp: number;
}

export class FileWatcher extends EventEmitter {
  private watchers: Map<string, FSWatcher> = new Map();
  private changeBuffers: Map<string, FileChangeEvent[]> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private ignorePatterns = [
    /node_modules/,
    /\.git/,
    /\.env/,
    /dist/,
    /build/,
    /__pycache__/,
    /\.pyc$/,
    /\.o$/,
    /\.a$/,
  ];

  /**
   * Watch a directory for changes.
   */
  watchDirectory(workspaceId: string, dirPath: string, debounceMs = 500): void {
    if (this.watchers.has(workspaceId)) {
      return; // Already watching
    }

    const watcher = watch(dirPath, { recursive: true }, (event, filename) => {
      if (!filename) return;

      // Check if file should be ignored
      if (this.ignorePatterns.some((pattern) => pattern.test(filename))) {
        return;
      }

      const fullPath = path.join(dirPath, filename);
      const changeEvent: FileChangeEvent = {
        type: "file",
        event: event as "add" | "change" | "delete" | "rename",
        path: filename,
        timestamp: Date.now(),
      };

      // Buffer changes for debouncing
      if (!this.changeBuffers.has(workspaceId)) {
        this.changeBuffers.set(workspaceId, []);
      }

      this.changeBuffers.get(workspaceId)!.push(changeEvent);

      // Clear existing debounce timer
      const existingTimer = this.debounceTimers.get(workspaceId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Set new debounce timer
      const newTimer = setTimeout(() => {
        const changes = this.changeBuffers.get(workspaceId) || [];
        this.emit("changed", workspaceId, changes);
        this.changeBuffers.set(workspaceId, []);
        this.debounceTimers.delete(workspaceId);
      }, debounceMs);

      this.debounceTimers.set(workspaceId, newTimer);
    });

    this.watchers.set(workspaceId, watcher);
  }

  /**
   * Stop watching a directory.
   */
  unwatch(workspaceId: string): void {
    const watcher = this.watchers.get(workspaceId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(workspaceId);
    }

    const timer = this.debounceTimers.get(workspaceId);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(workspaceId);
    }

    this.changeBuffers.delete(workspaceId);
  }

  /**
   * Get which file types changed (for smart preview restart).
   */
  getAffectedFileTypes(changes: FileChangeEvent[]): string[] {
    const types = new Set<string>();

    for (const change of changes) {
      const ext = path.extname(change.path).toLowerCase();
      if (ext) {
        types.add(ext);
      }
    }

    return Array.from(types);
  }

  /**
   * Determine if preview needs restart based on file changes.
   */
  shouldRestartPreview(changes: FileChangeEvent[], previewFileTypes: string[]): boolean {
    const affectedTypes = this.getAffectedFileTypes(changes);

    // Always restart on package.json, environment, or config changes
    const criticalFiles = ["package.json", "tsconfig.json", "vite.config.ts", ".env"];
    for (const change of changes) {
      if (criticalFiles.some((f) => change.path.endsWith(f))) {
        return true;
      }
    }

    // Check if any affected file type is in the preview watch list
    return affectedTypes.some((type) => previewFileTypes.includes(type));
  }

  /**
   * Clean up all watchers.
   */
  cleanup(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    this.changeBuffers.clear();
  }
}

// Singleton instance
export const globalFileWatcher = new FileWatcher();
