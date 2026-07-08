import { useEffect, useRef, useState, type CSSProperties } from "react";
import { VideoCanvas, type VideoStats } from "./video-canvas.js";
import { TouchOverlay } from "./touch-overlay.js";
import { TvRemote } from "./tv-remote.js";
import { DevicePicker } from "./device-picker.js";
import { MjpegView } from "./mjpeg-view.js";
import {
  encodeInputEvent,
  type HealthResponse,
  type InputEvent,
} from "portholejs/protocol";

type Device = NonNullable<HealthResponse["device"]>;

export function App() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [profile, setProfile] = useState<"phone" | "tv">("phone");
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState("");
  const [logFilter, setLogFilter] = useState("");
  const [stats, setStats] = useState<VideoStats | null>(null);
  const [showStats, setShowStats] = useState(true);
  const [keyboardCaptured, setKeyboardCaptured] = useState(false);
  const [toast, setToast] = useState("");
  const [videoMode, setVideoMode] = useState<"webcodecs" | "mjpeg">("webcodecs");
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Aborted on device switch so a slow response for the previous device
    // cannot overwrite the newly selected device's state.
    const aborter = new AbortController();

    const pollHealth = async () => {
      try {
        const query = selectedDeviceId
          ? `?device=${encodeURIComponent(selectedDeviceId)}`
          : "";
        const res = await fetch(`/health${query}`, { signal: aborter.signal });
        const data = (await res.json()) as HealthResponse;
        setHealth(data);
        if (data.status === "ok") {
          setProfile(data.device?.profile ?? inferProfile(data.width, data.height));
          setVideoMode(selectVideoMode(data.preferredVideoMode));
        }
      } catch {
        if (!aborter.signal.aborted) setHealth(null);
      }
    };

    const pollDevices = async () => {
      try {
        const res = await fetch("/api/devices", { signal: aborter.signal });
        const nextDevices = (await res.json()) as Device[];
        setDevices(nextDevices);
        // Note: no auto-select here. With no explicit selection the server's
        // default device is used everywhere (and the picker falls back to
        // health.device), so auto-selecting would only force a WS reconnect
        // and decoder restart on every page load. If the explicitly selected
        // device disappears (emulator killed), fall back to the default.
        if (
          selectedDeviceId &&
          nextDevices.length > 0 &&
          !nextDevices.some((device) => device.serial === selectedDeviceId)
        ) {
          setSelectedDeviceId(null);
        }
      } catch {
        if (!aborter.signal.aborted) setDevices([]);
      }
    };

    void pollHealth();
    void pollDevices();
    const interval = setInterval(() => void pollHealth(), 3000);
    const deviceInterval = setInterval(() => void pollDevices(), 5000);
    return () => {
      aborter.abort();
      clearInterval(interval);
      clearInterval(deviceInterval);
    };
  }, [selectedDeviceId]);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    const connect = () => {
      if (disposed) return;
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const query = selectedDeviceId
        ? `?device=${encodeURIComponent(selectedDeviceId)}`
        : "";
      const nextSocket = new WebSocket(`${proto}//${window.location.host}/ws${query}`);
      socket = nextSocket;
      nextSocket.binaryType = "arraybuffer";

      // Buffer messages until VideoCanvas takes over
      const earlyMessages: ArrayBuffer[] = [];
      let drained = false;
      nextSocket.addEventListener("message", (e: MessageEvent) => {
        if (!drained) {
          earlyMessages.push(e.data as ArrayBuffer);
        }
      });
      (nextSocket as unknown as Record<string, unknown>)._earlyMessages = earlyMessages;
      (nextSocket as unknown as Record<string, unknown>)._markDrained = () => {
        drained = true;
      };

      nextSocket.onopen = () => {
        if (disposed) return;
        setWs(nextSocket);
        setConnected(true);
      };

      nextSocket.onclose = () => {
        if (disposed) return;
        setWs(null);
        setConnected(false);
        reconnectRef.current = setTimeout(connect, 2000);
      };

      nextSocket.onerror = () => nextSocket.close();
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      socket?.close();
    };
  }, [selectedDeviceId]);

  const width = health?.width ?? 1080;
  const height = health?.height ?? 1920;

  useEffect(() => {
    if (!keyboardCaptured) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setKeyboardCaptured(false);
        return;
      }
      if (profile === "tv") return;
      const keycode = phoneKeycode(event.key);
      if (keycode) {
        event.preventDefault();
        sendInput({ kind: "key", phase: "down", keycode });
        sendInput({ kind: "key", phase: "up", keycode });
      } else if (event.key.length === 1) {
        sendInput({ kind: "text", text: event.key });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [keyboardCaptured, profile, ws]);

  const takeScreenshot = async (copy: boolean) => {
    try {
      const res = await fetch(`/screenshot${deviceQuery(selectedDeviceId)}`);
      const blob = await res.blob();
      if (copy && navigator.clipboard && "ClipboardItem" in window) {
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type || "image/png"]: blob }),
        ]);
        setToast("Screenshot copied");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "screenshot.png";
      a.click();
      URL.revokeObjectURL(url);
      setToast("Screenshot saved");
    } catch {
      setToast("Screenshot failed");
    }
  };

  const fetchLogs = async () => {
    try {
      const query = new URLSearchParams({ lines: "300" });
      if (selectedDeviceId) query.set("device", selectedDeviceId);
      if (logFilter) query.set("filter", logFilter);
      const res = await fetch(`/api/logcat?${query}`);
      const data = (await res.json()) as { logcat?: string };
      setLogs(data.logcat ?? "");
    } catch {
      setLogs("Unable to read logcat.");
    }
  };

  const sendInput = (event: InputEvent) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(encodeInputEvent(event));
  };

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const baseEndpoint = file.name.endsWith(".apk") ? "/api/install" : "/api/push";
    const endpoint = `${baseEndpoint}${deviceQuery(selectedDeviceId)}`;
    setToast(file.name.endsWith(".apk") ? "Installing APK..." : "Pushing file...");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "x-porthole-filename": file.name },
        body: file,
      });
      if (!res.ok) throw new Error(await res.text());
      setToast(file.name.endsWith(".apk") ? "APK installed" : "File pushed");
    } catch {
      setToast("Drop failed");
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
        <DevicePicker
          devices={devices}
          selected={
            devices.find((device) => device.serial === selectedDeviceId) ??
            health?.device ??
            null
          }
          onSelect={(device) => {
            setSelectedDeviceId(device.serial);
            setStats(null);
            setToast(`${device.name} selected`);
          }}
        />
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
          [{profile}] {width}x{height} {videoMode}
        </span>
        {showStats && stats && (
          <span style={{ fontSize: "12px", color: "#aaa" }}>
            {stats.fps}fps {stats.bitrateKbps}kbps q{stats.queue}
          </span>
        )}
        <button onClick={() => setShowStats((value) => !value)} style={headerButtonStyle}>
          Stats
        </button>
        <button onClick={() => void takeScreenshot(false)} style={headerButtonStyle}>
          Save
        </button>
        <button onClick={() => void takeScreenshot(true)} style={headerButtonStyle}>
          Copy
        </button>
        <button
          onClick={() => {
            setShowLogs((value) => !value);
            if (!showLogs) void fetchLogs();
          }}
          style={headerButtonStyle}
        >
          Logs
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
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => void handleDrop(event)}
      >
        <div
          tabIndex={0}
          onFocus={() => setKeyboardCaptured(true)}
          onBlur={() => setKeyboardCaptured(false)}
          style={{
            position: "relative",
            aspectRatio: `${width}/${height}`,
            maxHeight: "calc(100vh - 80px)",
            border: "2px solid #333",
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
          {videoMode === "mjpeg" ? (
            <MjpegView
              width={width}
              height={height}
              deviceId={selectedDeviceId ?? undefined}
            />
          ) : (
            <VideoCanvas ws={ws} width={width} height={height} onStats={setStats} />
          )}
          {profile === "phone" && <TouchOverlay ws={ws} />}
          {keyboardCaptured && (
            <div
              style={{
                position: "absolute",
                right: 8,
                bottom: 8,
                padding: "4px 8px",
                borderRadius: "4px",
                background: "rgba(0,0,0,0.7)",
                color: "#fff",
                fontSize: "12px",
              }}
            >
              keyboard captured
            </div>
          )}
          {health?.status && health.status !== "ok" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(0,0,0,0.55)",
                color: "#fff",
                fontSize: "18px",
              }}
            >
              {health.status === "reconnecting" ? "Reconnecting..." : health.status}
            </div>
          )}
        </div>

        {profile === "tv" ? (
          <TvRemote ws={ws} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <PhoneButton label="Back" keycode={4} sendInput={sendInput} />
            <PhoneButton label="Home" keycode={3} sendInput={sendInput} />
            <PhoneButton label="Recents" keycode={187} sendInput={sendInput} />
            <PhoneButton label="Power" keycode={26} sendInput={sendInput} />
            <PhoneButton label="Vol+" keycode={24} sendInput={sendInput} />
            <PhoneButton label="Vol-" keycode={25} sendInput={sendInput} />
          </div>
        )}
      </main>
      {showLogs && (
        <section
          style={{
            borderTop: "1px solid #333",
            height: "28vh",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", gap: "8px", padding: "8px" }}>
            <input
              value={logFilter}
              onChange={(event) => setLogFilter(event.target.value)}
              placeholder="filter"
              style={{
                flex: 1,
                background: "#222",
                color: "#eee",
                border: "1px solid #444",
              }}
            />
            <button onClick={() => void fetchLogs()} style={headerButtonStyle}>
              Refresh
            </button>
          </div>
          <pre
            style={{
              flex: 1,
              overflow: "auto",
              margin: 0,
              padding: "8px",
              fontSize: "12px",
              color: "#cfcfcf",
              background: "#080808",
            }}
          >
            {logs}
          </pre>
        </section>
      )}
      {toast && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            bottom: 20,
            transform: "translateX(-50%)",
            background: "#222",
            border: "1px solid #555",
            borderRadius: "6px",
            padding: "8px 12px",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function selectVideoMode(
  preferred: "webcodecs" | "mjpeg" | undefined,
): "webcodecs" | "mjpeg" {
  const requested = new URLSearchParams(window.location.search).get("video");
  if (requested === "mjpeg") return "mjpeg";
  if (requested === "webcodecs") return "webcodecs";
  if (preferred === "mjpeg") return "mjpeg";
  return "VideoDecoder" in window ? "webcodecs" : "mjpeg";
}

const headerButtonStyle: CSSProperties = {
  padding: "4px 10px",
  background: "#333",
  border: "1px solid #555",
  borderRadius: "4px",
  color: "#eee",
  cursor: "pointer",
};

function PhoneButton({
  label,
  keycode,
  sendInput,
}: {
  label: string;
  keycode: number;
  sendInput: (event: InputEvent) => void;
}) {
  return (
    <button
      onClick={() => {
        sendInput({ kind: "key", phase: "down", keycode });
        sendInput({ kind: "key", phase: "up", keycode });
      }}
      style={{ ...headerButtonStyle, minWidth: "78px", height: "34px" }}
    >
      {label}
    </button>
  );
}

function inferProfile(
  width: number | undefined,
  height: number | undefined,
): "phone" | "tv" {
  return width && height && width > height ? "tv" : "phone";
}

function deviceQuery(deviceId: string | null): string {
  return deviceId ? `?device=${encodeURIComponent(deviceId)}` : "";
}

function phoneKeycode(key: string): number | null {
  switch (key) {
    case "Escape":
      return 4;
    case "Home":
      return 3;
    case "ArrowUp":
      return 19;
    case "ArrowDown":
      return 20;
    case "ArrowLeft":
      return 21;
    case "ArrowRight":
      return 22;
    case "Enter":
      return 66;
    default:
      return null;
  }
}
