import { useEffect, useRef, useState } from "react";
import { VideoCanvas } from "./video-canvas.js";
import { TouchOverlay } from "./touch-overlay.js";
import { TvRemote } from "./tv-remote.js";

interface HealthResponse {
  status: string;
  codec?: string;
  width?: number;
  height?: number;
}

export function App() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [profile, setProfile] = useState<"phone" | "tv">("phone");
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const pollHealth = async () => {
      try {
        const res = await fetch("/health");
        const data = (await res.json()) as HealthResponse;
        setHealth(data);
        if (data.status === "ok") {
          setProfile(
            data.width && data.height && data.width > data.height ? "tv" : "phone",
          );
        }
      } catch {
        setHealth(null);
      }
    };

    void pollHealth();
    const interval = setInterval(() => void pollHealth(), 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const connect = () => {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${proto}//${window.location.host}/ws`);
      socket.binaryType = "arraybuffer";

      // Buffer messages until VideoCanvas takes over
      const earlyMessages: ArrayBuffer[] = [];
      let drained = false;
      socket.addEventListener("message", (e: MessageEvent) => {
        if (!drained) {
          earlyMessages.push(e.data as ArrayBuffer);
        }
      });
      (socket as unknown as Record<string, unknown>)._earlyMessages =
        earlyMessages;
      (socket as unknown as Record<string, unknown>)._markDrained = () => {
        drained = true;
      };

      socket.onopen = () => {
        setWs(socket);
        setConnected(true);
      };

      socket.onclose = () => {
        setWs(null);
        setConnected(false);
        reconnectRef.current = setTimeout(connect, 2000);
      };

      socket.onerror = () => socket.close();
    };

    connect();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, []);

  const width = health?.width ?? 1080;
  const height = health?.height ?? 1920;

  const takeScreenshot = async () => {
    try {
      const res = await fetch("/screenshot");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "screenshot.png";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "#111",
        color: "#eee",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "8px 16px",
          borderBottom: "1px solid #333",
        }}
      >
        <strong>Porthole</strong>
        <span
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: connected ? "#4f4" : "#f44",
          }}
        />
        <span style={{ fontSize: "12px", color: "#888" }}>
          {connected ? "Connected" : "Disconnected"}
        </span>
        <span style={{ fontSize: "12px", color: "#888", marginLeft: "auto" }}>
          [{profile}] {width}x{height}
        </span>
        <button
          onClick={() => void takeScreenshot()}
          style={{
            padding: "4px 12px",
            background: "#333",
            border: "1px solid #555",
            borderRadius: "4px",
            color: "#eee",
            cursor: "pointer",
          }}
        >
          Screenshot
        </button>
      </header>

      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          padding: "16px",
        }}
      >
        <div
          style={{
            position: "relative",
            aspectRatio: `${width}/${height}`,
            maxHeight: "calc(100vh - 80px)",
            border: "2px solid #333",
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
          <VideoCanvas ws={ws} width={width} height={height} />
          {profile === "phone" && <TouchOverlay ws={ws} />}
        </div>

        {profile === "tv" && <TvRemote ws={ws} />}
      </main>
    </div>
  );
}
