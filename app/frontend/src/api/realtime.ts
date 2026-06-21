import type { HouseholdCredential } from "../utils/localPersistence";

type RealtimeMessage = {
  type?: unknown;
  householdId?: unknown;
  reason?: unknown;
};

export type HouseholdChangeEvent = {
  householdId: string;
  reason: string;
};

export type RealtimeConnection = {
  close: () => void;
};

function getRealtimeUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

function parseRealtimeMessage(rawMessage: MessageEvent): RealtimeMessage | null {
  if (typeof rawMessage.data !== "string") {
    return null;
  }

  try {
    return JSON.parse(rawMessage.data) as RealtimeMessage;
  } catch {
    return null;
  }
}

export function connectHouseholdUpdates(
  credentials: HouseholdCredential[],
  onHouseholdChanged: (event: HouseholdChangeEvent) => void
): RealtimeConnection | null {
  if (!credentials.length) {
    return null;
  }

  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let closedByClient = false;

  function openSocket(): void {
    socket = new WebSocket(getRealtimeUrl());

    socket.addEventListener("open", () => {
      if (!socket) {
        return;
      }

      for (const credential of credentials) {
        socket.send(
          JSON.stringify({
            type: "subscribe",
            householdId: credential.householdId,
            accessToken: credential.accessToken
          })
        );
      }
    });

    socket.addEventListener("message", (rawMessage) => {
      const message = parseRealtimeMessage(rawMessage);
      if (
        message?.type !== "household-changed" ||
        typeof message.householdId !== "string" ||
        typeof message.reason !== "string"
      ) {
        return;
      }

      onHouseholdChanged({
        householdId: message.householdId,
        reason: message.reason
      });
    });

    socket.addEventListener("close", () => {
      socket = null;
      if (closedByClient || reconnectTimer !== null) {
        return;
      }

      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        openSocket();
      }, 2000);
    });
  }

  openSocket();

  return {
    close: () => {
      closedByClient = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      socket?.close();
    }
  };
}
