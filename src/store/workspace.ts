/** Multi-tab workspace document stored in `clips.content` as JSON. */

export const WORKSPACE_VERSION = 1 as const;
export const MAX_TABS = 20;
export const MAX_TAB_TITLE_LEN = 64;

export interface WorkspaceTab {
  id: string;
  title: string;
  body: string;
  language: string | null;
}

export interface Workspace {
  v: typeof WORKSPACE_VERSION;
  tabs: WorkspaceTab[];
  activeTabId: string;
}

function newId(): string {
  return crypto.randomUUID();
}

function clampTitle(title: string): string {
  const t = title.replace(/\s+/g, " ").trim();
  if (!t) return "Untitled";
  return t.slice(0, MAX_TAB_TITLE_LEN);
}

function normalizeTab(raw: unknown, fallbackLanguage: string | null): WorkspaceTab | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  if (typeof t.id !== "string" || !t.id) return null;
  if (typeof t.title !== "string") return null;
  if (typeof t.body !== "string") return null;
  const language =
    t.language === null || t.language === undefined
      ? fallbackLanguage
      : typeof t.language === "string"
        ? t.language || null
        : fallbackLanguage;
  return {
    id: t.id,
    title: clampTitle(t.title),
    body: t.body,
    language,
  };
}

/** True when `raw` is a v1 workspace document (not arbitrary user JSON). */
export function isWorkspaceDocument(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return false;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object") return false;
    const doc = parsed as Record<string, unknown>;
    if (doc.v !== WORKSPACE_VERSION) return false;
    if (!Array.isArray(doc.tabs) || doc.tabs.length === 0) return false;
    if (typeof doc.activeTabId !== "string" || !doc.activeTabId) return false;
    return doc.tabs.every(
      (tab) =>
        tab &&
        typeof tab === "object" &&
        typeof (tab as WorkspaceTab).id === "string" &&
        typeof (tab as WorkspaceTab).title === "string" &&
        typeof (tab as WorkspaceTab).body === "string"
    );
  } catch {
    return false;
  }
}

export function createWorkspace(
  body = "",
  opts: { title?: string; language?: string | null; id?: string } = {}
): Workspace {
  const id = opts.id ?? newId();
  return {
    v: WORKSPACE_VERSION,
    tabs: [
      {
        id,
        title: clampTitle(opts.title ?? "Content"),
        body,
        language: opts.language ?? null,
      },
    ],
    activeTabId: id,
  };
}

/** Lazy-migrate plain text (or invalid JSON) into a single-tab workspace. */
export function parseWorkspace(
  raw: string,
  fallbackLanguage: string | null = null
): Workspace {
  if (isWorkspaceDocument(raw)) {
    const parsed = JSON.parse(raw.trim()) as {
      v: number;
      tabs: unknown[];
      activeTabId: string;
    };
    const tabs = parsed.tabs
      .map((t) => normalizeTab(t, fallbackLanguage))
      .filter((t): t is WorkspaceTab => !!t);
    if (tabs.length === 0) return createWorkspace("", { language: fallbackLanguage });

    const activeTabId = tabs.some((t) => t.id === parsed.activeTabId)
      ? parsed.activeTabId
      : tabs[0].id;

    return { v: WORKSPACE_VERSION, tabs, activeTabId };
  }

  return createWorkspace(raw, { language: fallbackLanguage });
}

export function serializeWorkspace(ws: Workspace): string {
  return JSON.stringify({
    v: WORKSPACE_VERSION,
    tabs: ws.tabs.map((t) => ({
      id: t.id,
      title: t.title,
      body: t.body,
      language: t.language,
    })),
    activeTabId: ws.activeTabId,
  });
}

/** Plain text for SEO / previews / search display (tab bodies joined). */
export function workspacePlainText(raw: string): string {
  if (!isWorkspaceDocument(raw)) return raw;
  const ws = parseWorkspace(raw);
  return ws.tabs
    .map((t) => t.body)
    .filter((b) => b.trim())
    .join("\n\n");
}

export function getActiveTab(ws: Workspace): WorkspaceTab {
  return ws.tabs.find((t) => t.id === ws.activeTabId) ?? ws.tabs[0];
}

export function updateTabBody(ws: Workspace, tabId: string, body: string): Workspace {
  const tabs = ws.tabs.map((t) => (t.id === tabId ? { ...t, body } : t));
  if (!tabs.some((t) => t.id === tabId)) return ws;
  return { ...ws, tabs };
}

export function setActiveTab(ws: Workspace, tabId: string): Workspace {
  if (!ws.tabs.some((t) => t.id === tabId)) return ws;
  return { ...ws, activeTabId: tabId };
}

export function renameTab(ws: Workspace, tabId: string, title: string): Workspace {
  const tabs = ws.tabs.map((t) =>
    t.id === tabId ? { ...t, title: clampTitle(title) } : t
  );
  return { ...ws, tabs };
}

export function setTabLanguage(
  ws: Workspace,
  tabId: string,
  language: string | null
): Workspace {
  const tabs = ws.tabs.map((t) => (t.id === tabId ? { ...t, language } : t));
  return { ...ws, tabs };
}

export function addTab(
  ws: Workspace,
  opts: { title?: string; body?: string; language?: string | null; id?: string } = {}
): Workspace {
  if (ws.tabs.length >= MAX_TABS) return ws;
  const id = opts.id ?? newId();
  const tab: WorkspaceTab = {
    id,
    title: clampTitle(opts.title ?? `Tab ${ws.tabs.length + 1}`),
    body: opts.body ?? "",
    language: opts.language ?? null,
  };
  return {
    ...ws,
    tabs: [...ws.tabs, tab],
    activeTabId: id,
  };
}

export function removeTab(ws: Workspace, tabId: string): Workspace {
  if (ws.tabs.length <= 1) return ws;
  const idx = ws.tabs.findIndex((t) => t.id === tabId);
  if (idx < 0) return ws;
  const tabs = ws.tabs.filter((t) => t.id !== tabId);
  let activeTabId = ws.activeTabId;
  if (ws.activeTabId === tabId) {
    activeTabId = (tabs[idx - 1] ?? tabs[0]).id;
  }
  return { ...ws, tabs, activeTabId };
}

export function reorderTabs(ws: Workspace, orderedIds: string[]): Workspace {
  if (orderedIds.length !== ws.tabs.length) return ws;
  const map = new Map(ws.tabs.map((t) => [t.id, t]));
  const tabs: WorkspaceTab[] = [];
  for (const id of orderedIds) {
    const tab = map.get(id);
    if (!tab) return ws;
    tabs.push(tab);
  }
  return { ...ws, tabs };
}

/**
 * Write path for API / legacy clients: replace whole workspace JSON, or
 * patch the active tab body when given plain text.
 */
export function mergeContentWrite(
  existingRaw: string,
  incoming: string,
  language: string | null = null
): string {
  if (isWorkspaceDocument(incoming)) {
    return serializeWorkspace(parseWorkspace(incoming, language));
  }
  const ws = parseWorkspace(existingRaw, language);
  return serializeWorkspace(updateTabBody(ws, ws.activeTabId, incoming));
}

/** Normalize any raw content into a stored workspace document (creates). */
export function contentForStorage(
  raw: string,
  language: string | null = null
): string {
  return serializeWorkspace(parseWorkspace(raw, language));
}

export function workspaceApiFields(raw: string, language: string | null = null) {
  const ws = parseWorkspace(raw, language);
  const active = getActiveTab(ws);
  return {
    content: active.body,
    activeTabId: ws.activeTabId,
    tabs: ws.tabs.map((t) => ({
      id: t.id,
      title: t.title,
      body: t.body,
      language: t.language,
    })),
  };
}
