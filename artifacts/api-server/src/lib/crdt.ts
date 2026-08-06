import * as Y from "yjs";

export interface UserAwareness {
  clientId: string;
  userId: string;
  userName: string;
  color: string;
  cursor?: {
    file: string;
    line: number;
    column: number;
  };
  selection?: {
    file: string;
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  timestamp: number;
}

export interface CollaborationSession {
  workspaceId: string;
  users: Map<string, UserAwareness>;
  yDoc: Y.Doc;
  files: Map<string, Y.Text>;
  terminal: Y.Array<any>;
  preview: Y.Map<any>;
}

const sessions = new Map<string, CollaborationSession>();
const userColors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E2"];

/**
 * Initialize a new collaborative session using Yjs CRDT
 */
export function initializeSession(workspaceId: string): CollaborationSession {
  if (sessions.has(workspaceId)) {
    return sessions.get(workspaceId)!;
  }

  const yDoc = new Y.Doc();
  const session: CollaborationSession = {
    workspaceId,
    users: new Map(),
    yDoc,
    files: new Map(),
    terminal: yDoc.getArray("terminal"),
    preview: yDoc.getMap("preview"),
  };

  sessions.set(workspaceId, session);
  return session;
}

/**
 * Get an existing session
 */
export function getSession(workspaceId: string): CollaborationSession | undefined {
  return sessions.get(workspaceId);
}

/**
 * Add a user to the session with awareness
 */
export function addUser(
  workspaceId: string,
  clientId: string,
  userId: string,
  userName: string,
): UserAwareness {
  const session = initializeSession(workspaceId);
  const color = userColors[session.users.size % userColors.length];

  const awareness: UserAwareness = {
    clientId,
    userId,
    userName,
    color,
    timestamp: Date.now(),
  };

  session.users.set(clientId, awareness);
  return awareness;
}

/**
 * Remove a user from the session
 */
export function removeUser(workspaceId: string, clientId: string): void {
  const session = sessions.get(workspaceId);
  if (session) {
    session.users.delete(clientId);
    if (session.users.size === 0) {
      sessions.delete(workspaceId);
    }
  }
}

/**
 * Get or create a shared text document for a file
 */
export function getSharedFile(workspaceId: string, filePath: string): Y.Text {
  const session = initializeSession(workspaceId);
  if (!session.files.has(filePath)) {
    session.files.set(filePath, session.yDoc.getText(`file:${filePath}`));
  }
  return session.files.get(filePath)!;
}

/**
 * Update a user's cursor position
 */
export function updateUserCursor(
  workspaceId: string,
  clientId: string,
  file: string,
  line: number,
  column: number,
): void {
  const session = sessions.get(workspaceId);
  if (session && session.users.has(clientId)) {
    const user = session.users.get(clientId)!;
    user.cursor = { file, line, column };
    user.timestamp = Date.now();
  }
}

/**
 * Update a user's selection range
 */
export function updateUserSelection(
  workspaceId: string,
  clientId: string,
  file: string,
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number,
): void {
  const session = sessions.get(workspaceId);
  if (session && session.users.has(clientId)) {
    const user = session.users.get(clientId)!;
    user.selection = { file, startLine, startColumn, endLine, endColumn };
    user.timestamp = Date.now();
  }
}

/**
 * Get all active users in a session
 */
export function getSessionUsers(workspaceId: string): UserAwareness[] {
  const session = sessions.get(workspaceId);
  return session ? Array.from(session.users.values()) : [];
}

/**
 * Broadcast a terminal event to the session
 */
export function broadcastTerminalEvent(
  workspaceId: string,
  event: {
    type: "output" | "input" | "error" | "clear";
    data: string;
    timestamp: number;
  },
): void {
  const session = sessions.get(workspaceId);
  if (session) {
    session.terminal.push([event]);
  }
}

/**
 * Broadcast a preview update
 */
export function broadcastPreviewUpdate(
  workspaceId: string,
  key: string,
  value: any,
): void {
  const session = sessions.get(workspaceId);
  if (session) {
    session.preview.set(key, value);
  }
}

/**
 * Get the current state of a file as a string
 */
export function getFileState(workspaceId: string, filePath: string): string {
  const yText = getSharedFile(workspaceId, filePath);
  return yText.toString();
}

/**
 * Apply remote changes to a file
 */
export function applyRemoteChanges(
  workspaceId: string,
  filePath: string,
  changes: Array<{ index: number; retain?: number; insert?: string; delete?: number }>,
): void {
  const yText = getSharedFile(workspaceId, filePath);
  // Changes are already applied via Yjs protocol
  // This is mainly for logging/auditing
}

/**
 * Export session state for persistence (optional)
 */
export function exportSessionState(workspaceId: string): { files: Record<string, string>; users: UserAwareness[] } | null {
  const session = sessions.get(workspaceId);
  if (!session) return null;

  const files: Record<string, string> = {};
  for (const [filePath, yText] of session.files) {
    files[filePath] = yText.toString();
  }

  return {
    files,
    users: Array.from(session.users.values()),
  };
}

/**
 * Clean up a session
 */
export function closeSession(workspaceId: string): void {
  const session = sessions.get(workspaceId);
  if (session) {
    session.yDoc.destroy();
    sessions.delete(workspaceId);
  }
}
