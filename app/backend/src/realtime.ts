import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { hasHouseholdAccess } from "./auth.js";

type SubscribeMessage = {
  type?: unknown;
  householdId?: unknown;
  accessToken?: unknown;
};

type HouseholdChangeReason = "locations" | "pantry-items" | "shopping-list";

const householdSubscribers = new Map<string, Set<WebSocket>>();
const socketSubscriptions = new WeakMap<WebSocket, Set<string>>();

function sendJson(socket: WebSocket, payload: unknown): void {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(payload));
}

function removeSocketSubscriptions(socket: WebSocket): void {
  const subscribedHouseholds = socketSubscriptions.get(socket);
  if (!subscribedHouseholds) {
    return;
  }

  for (const householdId of subscribedHouseholds) {
    const subscribers = householdSubscribers.get(householdId);
    subscribers?.delete(socket);
    if (subscribers?.size === 0) {
      householdSubscribers.delete(householdId);
    }
  }

  subscribedHouseholds.clear();
}

async function subscribeToHousehold(socket: WebSocket, message: SubscribeMessage): Promise<void> {
  if (message.type !== "subscribe" || typeof message.householdId !== "string" || typeof message.accessToken !== "string") {
    sendJson(socket, { type: "error", message: "Invalid subscription message." });
    return;
  }

  const householdId = message.householdId.trim();
  const accessToken = message.accessToken;
  if (!householdId || !accessToken || !(await hasHouseholdAccess(householdId, accessToken))) {
    sendJson(socket, { type: "error", message: "Invalid household id or access token." });
    socket.close(1008, "Unauthorized");
    return;
  }

  let socketHouseholds = socketSubscriptions.get(socket);
  if (!socketHouseholds) {
    socketHouseholds = new Set<string>();
    socketSubscriptions.set(socket, socketHouseholds);
  }

  socketHouseholds.add(householdId);

  let subscribers = householdSubscribers.get(householdId);
  if (!subscribers) {
    subscribers = new Set<WebSocket>();
    householdSubscribers.set(householdId, subscribers);
  }

  subscribers.add(socket);
  sendJson(socket, { type: "subscribed", householdId });
}

export function initializeRealtime(server: Server): void {
  const webSocketServer = new WebSocketServer({ server, path: "/ws" });

  webSocketServer.on("connection", (socket) => {
    socket.on("message", (rawMessage) => {
      void (async () => {
        try {
          const message = JSON.parse(rawMessage.toString()) as SubscribeMessage;
          await subscribeToHousehold(socket, message);
        } catch {
          sendJson(socket, { type: "error", message: "Invalid JSON message." });
        }
      })();
    });

    socket.on("close", () => {
      removeSocketSubscriptions(socket);
    });
  });
}

export function notifyHouseholdChanged(householdId: string, reason: HouseholdChangeReason): void {
  const subscribers = householdSubscribers.get(householdId);
  if (!subscribers?.size) {
    return;
  }

  for (const subscriber of subscribers) {
    sendJson(subscriber, {
      type: "household-changed",
      householdId,
      reason
    });
  }
}
