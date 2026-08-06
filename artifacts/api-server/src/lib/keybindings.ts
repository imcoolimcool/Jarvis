import { Request } from "express";

export type Platform = "mac" | "windows" | "linux";
export type Action =
  | "save"
  | "command-palette"
  | "search"
  | "replace"
  | "terminal"
  | "panel-1"
  | "panel-2"
  | "panel-3"
  | "panel-4"
  | "panel-5"
  | "panel-6"
  | "undo"
  | "redo"
  | "quick-fix"
  | "format"
  | "rename"
  | "go-to-definition"
  | "find-references"
  | "delete-line"
  | "duplicate-line"
  | "toggle-comment"
  | "run-tests"
  | "run-debug"
  | "build"
  | "git-commit"
  | "git-push"
  | "export-workspace"
  | "import-workspace";

export interface Keybinding {
  action: Action;
  mac: string;
  windows: string;
  linux: string;
  description: string;
}

export interface KeybindingConfig {
  platform: Platform;
  keybindings: Map<string, Action>;
  customBindings: Record<string, string>;
}

const DEFAULT_KEYBINDINGS: Keybinding[] = [
  {
    action: "save",
    mac: "Cmd+S",
    windows: "Ctrl+S",
    linux: "Ctrl+S",
    description: "Save current file",
  },
  {
    action: "command-palette",
    mac: "Cmd+Shift+P",
    windows: "Ctrl+Shift+P",
    linux: "Ctrl+Shift+P",
    description: "Open command palette",
  },
  {
    action: "search",
    mac: "Cmd+F",
    windows: "Ctrl+F",
    linux: "Ctrl+F",
    description: "Open find dialog",
  },
  {
    action: "replace",
    mac: "Cmd+H",
    windows: "Ctrl+H",
    linux: "Ctrl+H",
    description: "Open find and replace",
  },
  {
    action: "terminal",
    mac: "Cmd+J",
    windows: "Ctrl+J",
    linux: "Ctrl+J",
    description: "Toggle terminal",
  },
  {
    action: "panel-1",
    mac: "Cmd+1",
    windows: "Ctrl+1",
    linux: "Ctrl+1",
    description: "Focus panel 1 (Files)",
  },
  {
    action: "panel-2",
    mac: "Cmd+2",
    windows: "Ctrl+2",
    linux: "Ctrl+2",
    description: "Focus panel 2 (Search)",
  },
  {
    action: "panel-3",
    mac: "Cmd+3",
    windows: "Ctrl+3",
    linux: "Ctrl+3",
    description: "Focus panel 3 (Tests)",
  },
  {
    action: "panel-4",
    mac: "Cmd+4",
    windows: "Ctrl+4",
    linux: "Ctrl+4",
    description: "Focus panel 4 (Git)",
  },
  {
    action: "panel-5",
    mac: "Cmd+5",
    windows: "Ctrl+5",
    linux: "Ctrl+5",
    description: "Focus panel 5 (Debug)",
  },
  {
    action: "panel-6",
    mac: "Cmd+6",
    windows: "Ctrl+6",
    linux: "Ctrl+6",
    description: "Focus panel 6 (Preview)",
  },
  {
    action: "undo",
    mac: "Cmd+Z",
    windows: "Ctrl+Z",
    linux: "Ctrl+Z",
    description: "Undo last action",
  },
  {
    action: "redo",
    mac: "Cmd+Shift+Z",
    windows: "Ctrl+Shift+Z",
    linux: "Ctrl+Shift+Z",
    description: "Redo last undone action",
  },
  {
    action: "quick-fix",
    mac: "Cmd+.",
    windows: "Ctrl+.",
    linux: "Ctrl+.",
    description: "Show quick fix suggestions",
  },
  {
    action: "format",
    mac: "Cmd+Alt+F",
    windows: "Ctrl+Alt+F",
    linux: "Ctrl+Alt+F",
    description: "Format document",
  },
  {
    action: "rename",
    mac: "Cmd+R",
    windows: "Ctrl+R",
    linux: "Ctrl+R",
    description: "Rename symbol",
  },
  {
    action: "go-to-definition",
    mac: "Cmd+Click / F12",
    windows: "Ctrl+Click / F12",
    linux: "Ctrl+Click / F12",
    description: "Go to definition",
  },
  {
    action: "find-references",
    mac: "Cmd+Shift+F",
    windows: "Ctrl+Shift+F",
    linux: "Ctrl+Shift+F",
    description: "Find all references",
  },
  {
    action: "delete-line",
    mac: "Cmd+Shift+K",
    windows: "Ctrl+Shift+K",
    linux: "Ctrl+Shift+K",
    description: "Delete entire line",
  },
  {
    action: "duplicate-line",
    mac: "Cmd+D",
    windows: "Ctrl+D",
    linux: "Ctrl+D",
    description: "Duplicate line",
  },
  {
    action: "toggle-comment",
    mac: "Cmd+/",
    windows: "Ctrl+/",
    linux: "Ctrl+/",
    description: "Toggle line comment",
  },
  {
    action: "run-tests",
    mac: "Cmd+Shift+T",
    windows: "Ctrl+Shift+T",
    linux: "Ctrl+Shift+T",
    description: "Run all tests",
  },
  {
    action: "run-debug",
    mac: "Cmd+Shift+D",
    windows: "Ctrl+Shift+D",
    linux: "Ctrl+Shift+D",
    description: "Start debug session",
  },
  {
    action: "build",
    mac: "Cmd+B",
    windows: "Ctrl+B",
    linux: "Ctrl+B",
    description: "Build project",
  },
  {
    action: "git-commit",
    mac: "Cmd+Alt+C",
    windows: "Ctrl+Alt+C",
    linux: "Ctrl+Alt+C",
    description: "Commit changes",
  },
  {
    action: "git-push",
    mac: "Cmd+Alt+P",
    windows: "Ctrl+Alt+P",
    linux: "Ctrl+Alt+P",
    description: "Push to remote",
  },
  {
    action: "export-workspace",
    mac: "Cmd+Alt+E",
    windows: "Ctrl+Alt+E",
    linux: "Ctrl+Alt+E",
    description: "Export workspace",
  },
  {
    action: "import-workspace",
    mac: "Cmd+Alt+I",
    windows: "Ctrl+Alt+I",
    linux: "Ctrl+Alt+I",
    description: "Import workspace",
  },
];

/**
 * Detect platform from user agent
 */
export function detectPlatform(userAgent: string): Platform {
  if (userAgent.includes("Mac") || userAgent.includes("iPhone") || userAgent.includes("iPad")) {
    return "mac";
  }
  if (userAgent.includes("Windows") || userAgent.includes("Win")) {
    return "windows";
  }
  return "linux";
}

/**
 * Get keybinding for a specific action on a platform
 */
export function getKeybinding(action: Action, platform: Platform): string {
  const binding = DEFAULT_KEYBINDINGS.find((kb) => kb.action === action);
  if (!binding) return "";
  return binding[platform];
}

/**
 * Get all keybindings for a platform
 */
export function getAllKeybindings(platform: Platform): Record<string, string> {
  const result: Record<string, string> = {};
  for (const binding of DEFAULT_KEYBINDINGS) {
    result[binding.action] = binding[platform];
  }
  return result;
}

/**
 * Parse keyboard event into action
 */
export function parseKeyboardEvent(
  key: string,
  ctrlKey: boolean,
  metaKey: boolean,
  shiftKey: boolean,
  platform: Platform,
): Action | null {
  // Build the key combination string
  const parts: string[] = [];
  if (platform === "mac" && metaKey) parts.push("Cmd");
  if (platform !== "mac" && ctrlKey) parts.push("Ctrl");
  if (platform === "mac" && ctrlKey) parts.push("Ctrl");
  if (shiftKey) parts.push("Shift");
  parts.push(key);

  const combination = parts.join("+");

  // Find matching action
  for (const binding of DEFAULT_KEYBINDINGS) {
    const bindingForPlatform = binding[platform];
    if (bindingForPlatform === combination) {
      return binding.action;
    }
  }

  return null;
}

/**
 * Create keybinding config
 */
export function createKeybindingConfig(platform: Platform): KeybindingConfig {
  const keybindings = new Map<string, Action>();
  for (const binding of DEFAULT_KEYBINDINGS) {
    keybindings.set(binding[platform], binding.action);
  }

  return {
    platform,
    keybindings,
    customBindings: {},
  };
}

/**
 * Update custom keybinding
 */
export function updateCustomKeybinding(config: KeybindingConfig, shortcut: string, action: Action): void {
  config.customBindings[shortcut] = action;
  config.keybindings.set(shortcut, action);
}

/**
 * Get keybinding help overlay
 */
export function getKeybindingHelp(platform: Platform): Keybinding[] {
  return DEFAULT_KEYBINDINGS.map((kb) => ({
    ...kb,
    mac: kb.mac,
    windows: kb.windows,
    linux: kb.linux,
  }));
}
