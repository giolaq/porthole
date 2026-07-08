import type { IncomingMessage, Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type { Engine, VideoChunk } from "../engine/types.js";
import { assertInputAllowed, parseInputEvent } from "../input-validation.js";
import type { DeviceInfo } from "../device-manager.js";
import { encodeVideoPacket } from "../protocol.js";
import { debugLog } from "../log.js";
import { sendGesture } from "../gesture.js";

export interface WsServerOptions {
  httpServer: Server;
  getEngine: (deviceId?: string) => Engine | null;
  getDevice?: (deviceId?: string) => DeviceInfo | undefined;
  getDefaultDeviceId?: () => string | undefined;
  token?: string;
}

export function createWsServer(opts: WsServerOptions) {
  const { httpServer, getEngine, getDevice, getDefaultDeviceId, token } = opts;

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  const clientDevices = new WeakMap<WebSocket, string>();
  const lastConfig = new Map<string, Buffer>();
  const lastKeyframe = new Map<string, Buffer>();

  function attachEngine(deviceId: string, engine: Engine): void {
    engine.onVideoChunk((chunk: VideoChunk) => {
      const packet = Buffer.from(encodeVideoPacket(chunk, deviceId));

      if (chunk.type === "config") {
        lastConfig.set(deviceId, packet);
      } else {
        const isKey = chunk.keyframe ?? hasIdrNal(chunk.data);
        if (isKey) {
          lastKeyframe.set(deviceId, packet);
        }
      }

      for (const client of wss.clients) {
        if (
          client.readyState === WebSocket.OPEN &&
          clientDevices.get(client) === deviceId
        ) {
          client.send(packet);
        }
      }
    });
  }

  wss.on("connection", (ws, req) => {
    debugLog("ws", "client connected");
    if (!isAuthorized(req, token)) {
      ws.close(1008, "Porthole token required.");
      return;
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    const deviceId = url.searchParams.get("device") ?? getDefaultDeviceId?.();
    if (!deviceId) {
      ws.close(1011, "No active device.");
      return;
    }
    clientDevices.set(ws, deviceId);
    // Send cached config + keyframe so late-joining clients can decode immediately
    const config = lastConfig.get(deviceId);
    const keyframe = lastKeyframe.get(deviceId);
    if (config) ws.send(config);
    if (keyframe) ws.send(keyframe);

    ws.on("message", (data) => {
      const engine = getEngine(deviceId);
      if (!engine) return;

      try {
        const event = parseInputEvent(JSON.parse(data.toString()));
        const device = getDevice?.(deviceId);
        if (device) assertInputAllowed(device.profile, event);
        if (event.kind === "gesture") {
          void sendGesture(event, (touch) => engine.sendInput(touch));
        } else {
          void engine.sendInput(event);
        }
      } catch {
        debugLog("ws", "ignored invalid input message");
        // Invalid message, ignore
      }
    });
  });

  return { wss, attachEngine };
}

function isAuthorized(req: IncomingMessage, token: string | undefined): boolean {
  if (!token) return true;
  if (isLocalAddress(req.socket.remoteAddress)) return true;
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.searchParams.get("token") === token) return true;
  return parseCookie(req.headers.cookie ?? "").get("porthole_token") === token;
}

function isLocalAddress(address: string | undefined): boolean {
  return (
    !address ||
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1"
  );
}

function parseCookie(cookie: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const part of cookie.split(";")) {
    const [key, value] = part.trim().split("=");
    if (key && value) values.set(key, value);
  }
  return values;
}

function hasIdrNal(data: Uint8Array): boolean {
  for (let i = 0; i < data.length - 4; i++) {
    if (data[i] === 0 && data[i + 1] === 0) {
      let offset = i + 2;
      if (data[offset] === 0) offset++;
      if (data[offset] === 1) {
        const nalByte = data[offset + 1];
        if (nalByte !== undefined && (nalByte & 0x1f) === 5) return true;
      }
    }
  }
  return false;
}
