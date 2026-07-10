import type { ServerWebSocket } from "bun";

export interface WsData {
  slug: string;
}

type RoomSocket = ServerWebSocket<WsData>;

const rooms = new Map<string, Set<RoomSocket>>();

export function joinRoom(slug: string, ws: RoomSocket) {
  let room = rooms.get(slug);
  if (!room) {
    room = new Set();
    rooms.set(slug, room);
  }
  room.add(ws);
}

export function leaveRoom(slug: string, ws: RoomSocket) {
  const room = rooms.get(slug);
  if (!room) return;
  room.delete(ws);
  if (room.size === 0) rooms.delete(slug);
}

export function broadcast(
  slug: string,
  message: object,
  exclude?: RoomSocket
) {
  const room = rooms.get(slug);
  if (!room) return;

  const payload = JSON.stringify(message);
  for (const ws of room) {
    if (ws !== exclude && ws.readyState === 1) {
      ws.send(payload);
    }
  }
}

export function roomSize(slug: string): number {
  return rooms.get(slug)?.size ?? 0;
}

export function broadcastStatus(slug: string) {
  broadcast(slug, {
    type: "status",
    devices: roomSize(slug),
  });
}
