import { z } from "zod";
import {
  MAX_CONTENT_LENGTH,
  clipContentSchema,
  contentTooLargeMessage,
} from "../lib/constants";
import { ensureClip, getClip, schedulePersist } from "../store/clips";
import { scheduleVersionSave } from "../store/versions";
import {
  MAX_TABS,
  MAX_TAB_TITLE_LEN,
  addTab,
  isWorkspaceDocument,
  mergeContentWrite,
  parseWorkspace,
  removeTab,
  renameTab,
  reorderTabs,
  serializeWorkspace,
  setActiveTab,
  setTabLanguage,
  updateTabBody,
} from "../store/workspace";
import * as rooms from "./rooms";
import type { WsData } from "./rooms";
import type { ServerWebSocket } from "bun";

type RoomSocket = ServerWebSocket<WsData>;

const tabUpdateSchema = z.object({
  type: z.literal("tab_update"),
  tabId: z.string().min(1).max(80),
  body: z.string().max(MAX_CONTENT_LENGTH),
});

const tabsMetaSchema = z.object({
  type: z.literal("tabs_meta"),
  action: z.enum(["add", "remove", "rename", "reorder", "activate", "language"]),
  tabId: z.string().min(1).max(80).optional(),
  title: z.string().max(MAX_TAB_TITLE_LEN).optional(),
  body: z.string().max(MAX_CONTENT_LENGTH).optional(),
  language: z.string().max(64).nullable().optional(),
  orderedIds: z.array(z.string().min(1).max(80)).max(MAX_TABS).optional(),
});

function sendContentTooLarge(ws: RoomSocket) {
  ws.send(JSON.stringify({ type: "error", message: contentTooLargeMessage() }));
}

function persistAndVersion(slug: string, serialized: string): boolean {
  if (serialized.length > MAX_CONTENT_LENGTH) return false;
  clipContentSchema.parse({ content: serialized });
  schedulePersist(slug, serialized);
  scheduleVersionSave(slug, () => serialized, null);
  return true;
}

async function loadMutableWorkspace(slug: string) {
  const clip = (await getClip(slug)) ?? (await ensureClip(slug));
  if (clip.encrypted) {
    return { error: "Encrypted clips require full document sync" as const };
  }
  return {
    clip,
    ws: parseWorkspace(clip.content, clip.language),
  };
}

export async function handleWorkspaceWsMessage(
  ws: RoomSocket,
  data: Record<string, unknown>
): Promise<boolean> {
  const { slug, canWrite } = ws.data;

  if (data.type === "update" && typeof data.content === "string") {
    if (!canWrite) {
      ws.send(JSON.stringify({ type: "error", message: "Read-only" }));
      return true;
    }
    if (data.content.length > MAX_CONTENT_LENGTH) {
      sendContentTooLarge(ws);
      return true;
    }
    const clip = (await getClip(slug)) ?? (await ensureClip(slug));

    let next: string;
    if (clip.encrypted || isWorkspaceDocument(data.content)) {
      next = data.content;
    } else {
      next = mergeContentWrite(clip.content, data.content, clip.language);
    }
    if (!persistAndVersion(slug, next)) {
      sendContentTooLarge(ws);
      return true;
    }
    rooms.broadcast(slug, { type: "update", content: next }, ws);
    return true;
  }

  if (data.type === "tab_update") {
    if (!canWrite) {
      ws.send(JSON.stringify({ type: "error", message: "Read-only" }));
      return true;
    }
    const parsed = tabUpdateSchema.safeParse(data);
    if (!parsed.success) {
      const tooLarge = parsed.error.issues.some(
        (i) => i.code === "too_big" && i.path.includes("body")
      );
      ws.send(
        JSON.stringify({
          type: "error",
          message: tooLarge ? contentTooLargeMessage() : "Invalid message",
        })
      );
      return true;
    }
    const msg = parsed.data;
    const loaded = await loadMutableWorkspace(slug);
    if ("error" in loaded) {
      ws.send(JSON.stringify({ type: "error", message: loaded.error }));
      return true;
    }
    if (!loaded.ws.tabs.some((t) => t.id === msg.tabId)) {
      ws.send(JSON.stringify({ type: "error", message: "Unknown tab" }));
      return true;
    }
    const nextWs = updateTabBody(loaded.ws, msg.tabId, msg.body);
    const serialized = serializeWorkspace(nextWs);
    if (!persistAndVersion(slug, serialized)) {
      sendContentTooLarge(ws);
      return true;
    }
    rooms.broadcast(
      slug,
      { type: "tab_update", tabId: msg.tabId, body: msg.body },
      ws
    );
    return true;
  }

  if (data.type === "tabs_meta") {
    if (!canWrite) {
      ws.send(JSON.stringify({ type: "error", message: "Read-only" }));
      return true;
    }
    const parsed = tabsMetaSchema.safeParse(data);
    if (!parsed.success) {
      const tooLarge = parsed.error.issues.some(
        (i) => i.code === "too_big" && i.path.includes("body")
      );
      ws.send(
        JSON.stringify({
          type: "error",
          message: tooLarge ? contentTooLargeMessage() : "Invalid message",
        })
      );
      return true;
    }
    const msg = parsed.data;
    const loaded = await loadMutableWorkspace(slug);
    if ("error" in loaded) {
      ws.send(JSON.stringify({ type: "error", message: loaded.error }));
      return true;
    }

    let nextWs = loaded.ws;
    switch (msg.action) {
      case "add": {
        if (nextWs.tabs.length >= MAX_TABS) {
          ws.send(JSON.stringify({ type: "error", message: "Tab limit reached" }));
          return true;
        }
        nextWs = addTab(nextWs, {
          title: msg.title,
          body: msg.body ?? "",
          language: msg.language ?? null,
          id: msg.tabId,
        });
        break;
      }
      case "remove": {
        if (!msg.tabId) {
          ws.send(JSON.stringify({ type: "error", message: "tabId required" }));
          return true;
        }
        nextWs = removeTab(nextWs, msg.tabId);
        break;
      }
      case "rename": {
        if (!msg.tabId || msg.title === undefined) {
          ws.send(JSON.stringify({ type: "error", message: "tabId and title required" }));
          return true;
        }
        nextWs = renameTab(nextWs, msg.tabId, msg.title);
        break;
      }
      case "reorder": {
        if (!msg.orderedIds) {
          ws.send(JSON.stringify({ type: "error", message: "orderedIds required" }));
          return true;
        }
        nextWs = reorderTabs(nextWs, msg.orderedIds);
        break;
      }
      case "activate": {
        if (!msg.tabId) {
          ws.send(JSON.stringify({ type: "error", message: "tabId required" }));
          return true;
        }
        nextWs = setActiveTab(nextWs, msg.tabId);
        break;
      }
      case "language": {
        if (!msg.tabId || msg.language === undefined) {
          ws.send(JSON.stringify({ type: "error", message: "tabId and language required" }));
          return true;
        }
        nextWs = setTabLanguage(nextWs, msg.tabId, msg.language);
        break;
      }
    }

    const serialized = serializeWorkspace(nextWs);
    if (!persistAndVersion(slug, serialized)) {
      sendContentTooLarge(ws);
      return true;
    }
    rooms.broadcast(
      slug,
      {
        type: "tabs_meta",
        action: msg.action,
        workspace: nextWs,
      },
      ws
    );
    return true;
  }

  return false;
}
