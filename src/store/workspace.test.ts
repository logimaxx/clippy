import { describe, expect, test } from "bun:test";
import {
  addTab,
  contentForStorage,
  createWorkspace,
  getActiveTab,
  isWorkspaceDocument,
  mergeContentWrite,
  parseWorkspace,
  removeTab,
  renameTab,
  serializeWorkspace,
  setActiveTab,
  updateTabBody,
  workspaceApiFields,
  workspacePlainText,
} from "./workspace";

describe("workspace", () => {
  test("wraps plain text on parse", () => {
    const ws = parseWorkspace("hello", "markdown");
    expect(ws.v).toBe(1);
    expect(ws.tabs).toHaveLength(1);
    expect(ws.tabs[0].body).toBe("hello");
    expect(ws.tabs[0].title).toBe("Content");
    expect(ws.tabs[0].language).toBe("markdown");
    expect(ws.activeTabId).toBe(ws.tabs[0].id);
  });

  test("round-trips serialized workspace", () => {
    const ws = addTab(createWorkspace("a"), { title: "Second", body: "b" });
    const raw = serializeWorkspace(ws);
    expect(isWorkspaceDocument(raw)).toBe(true);
    const again = parseWorkspace(raw);
    expect(again.tabs.map((t) => t.body)).toEqual(["a", "b"]);
    expect(again.activeTabId).toBe(ws.activeTabId);
  });

  test("does not treat arbitrary JSON as workspace", () => {
    expect(isWorkspaceDocument('{"foo":1}')).toBe(false);
    expect(isWorkspaceDocument("[1,2,3]")).toBe(false);
    const ws = parseWorkspace('{"foo":1}');
    expect(ws.tabs[0].body).toBe('{"foo":1}');
  });

  test("updateTabBody / remove / rename", () => {
    let ws = createWorkspace("one");
    const id1 = ws.tabs[0].id;
    ws = addTab(ws, { title: "Two", body: "two" });
    const id2 = ws.activeTabId;
    ws = updateTabBody(ws, id1, "ONE");
    expect(ws.tabs.find((t) => t.id === id1)?.body).toBe("ONE");
    ws = renameTab(ws, id2, "Notes");
    expect(ws.tabs.find((t) => t.id === id2)?.title).toBe("Notes");
    ws = setActiveTab(ws, id1);
    ws = removeTab(ws, id2);
    expect(ws.tabs).toHaveLength(1);
    expect(ws.activeTabId).toBe(id1);
    expect(removeTab(ws, id1)).toBe(ws);
  });

  test("mergeContentWrite patches active tab for plain text", () => {
    const existing = contentForStorage("first");
    const ws0 = parseWorkspace(existing);
    const withSecond = serializeWorkspace(
      addTab(ws0, { title: "Two", body: "second" })
    );
    // Active is second tab after add
    const merged = mergeContentWrite(withSecond, "SECOND!");
    const ws = parseWorkspace(merged);
    expect(getActiveTab(ws).body).toBe("SECOND!");
    expect(ws.tabs[0].body).toBe("first");
  });

  test("mergeContentWrite replaces when incoming is workspace JSON", () => {
    const incoming = serializeWorkspace(createWorkspace("fresh"));
    const merged = mergeContentWrite(contentForStorage("old"), incoming);
    expect(parseWorkspace(merged).tabs[0].body).toBe("fresh");
  });

  test("workspacePlainText joins bodies", () => {
    const ws = addTab(createWorkspace("a"), { body: "b" });
    expect(workspacePlainText(serializeWorkspace(ws))).toBe("a\n\nb");
    expect(workspacePlainText("plain")).toBe("plain");
  });

  test("workspaceApiFields exposes active body and tabs", () => {
    const raw = contentForStorage("hello");
    const fields = workspaceApiFields(raw);
    expect(fields.content).toBe("hello");
    expect(fields.tabs).toHaveLength(1);
    expect(fields.tabs[0].body).toBe("hello");
  });
});
