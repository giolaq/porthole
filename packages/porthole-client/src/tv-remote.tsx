import { useCallback, useEffect } from "react";

type RemoteButton =
  | "dpad_up"
  | "dpad_down"
  | "dpad_left"
  | "dpad_right"
  | "select"
  | "back"
  | "home"
  | "menu"
  | "play_pause"
  | "rewind"
  | "fast_forward"
  | "volume_up"
  | "volume_down";

interface TvRemoteProps {
  ws: WebSocket | null;
}

const KEYBOARD_MAP: Record<string, RemoteButton> = {
  ArrowUp: "dpad_up",
  ArrowDown: "dpad_down",
  ArrowLeft: "dpad_left",
  ArrowRight: "dpad_right",
  Enter: "select",
  Escape: "back",
  Backspace: "back",
};

export function TvRemote({ ws }: TvRemoteProps) {
  const press = useCallback(
    (button: RemoteButton) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ kind: "remote", button }));
    },
    [ws],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const button = KEYBOARD_MAP[e.key];
      if (button) {
        e.preventDefault();
        press(button);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [press]);

  const Btn = ({
    label,
    button,
    round,
    small,
  }: {
    label: string;
    button: RemoteButton;
    round?: boolean;
    small?: boolean;
  }) => (
    <button
      onClick={() => press(button)}
      style={{
        width: round ? "56px" : small ? "52px" : "44px",
        height: round ? "56px" : small ? "32px" : "44px",
        fontSize: small ? "11px" : "16px",
        fontWeight: "bold",
        cursor: "pointer",
        border: "none",
        borderRadius: round ? "50%" : "8px",
        background: round ? "#e53935" : "#3a3a3a",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 2px 4px rgba(0,0,0,0.4)",
        transition: "transform 0.1s, background 0.1s",
      }}
      onMouseDown={(e) =>
        ((e.currentTarget as HTMLElement).style.transform = "scale(0.93)")
      }
      onMouseUp={(e) => ((e.currentTarget as HTMLElement).style.transform = "scale(1)")}
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLElement).style.transform = "scale(1)")
      }
    >
      {label}
    </button>
  );

  return (
    <div
      style={{
        width: "200px",
        background: "linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%)",
        borderRadius: "40px 40px 48px 48px",
        padding: "28px 20px 36px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "20px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
        border: "1px solid #2a2a2a",
      }}
    >
      {/* Power / brand area */}
      <div
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: "#4caf50",
          boxShadow: "0 0 6px #4caf50",
          marginBottom: "4px",
        }}
      />

      {/* D-pad ring */}
      <div
        style={{
          position: "relative",
          width: "140px",
          height: "140px",
          borderRadius: "50%",
          background: "#222",
          boxShadow: "inset 0 2px 8px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.05)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Up */}
        <button
          onClick={() => press("dpad_up")}
          style={{
            position: "absolute",
            top: "8px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "40px",
            height: "36px",
            background: "transparent",
            border: "none",
            color: "#aaa",
            fontSize: "20px",
            cursor: "pointer",
            borderRadius: "8px",
          }}
        >
          ▲
        </button>
        {/* Down */}
        <button
          onClick={() => press("dpad_down")}
          style={{
            position: "absolute",
            bottom: "8px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "40px",
            height: "36px",
            background: "transparent",
            border: "none",
            color: "#aaa",
            fontSize: "20px",
            cursor: "pointer",
            borderRadius: "8px",
          }}
        >
          ▼
        </button>
        {/* Left */}
        <button
          onClick={() => press("dpad_left")}
          style={{
            position: "absolute",
            left: "8px",
            top: "50%",
            transform: "translateY(-50%)",
            width: "36px",
            height: "40px",
            background: "transparent",
            border: "none",
            color: "#aaa",
            fontSize: "20px",
            cursor: "pointer",
            borderRadius: "8px",
          }}
        >
          ◀
        </button>
        {/* Right */}
        <button
          onClick={() => press("dpad_right")}
          style={{
            position: "absolute",
            right: "8px",
            top: "50%",
            transform: "translateY(-50%)",
            width: "36px",
            height: "40px",
            background: "transparent",
            border: "none",
            color: "#aaa",
            fontSize: "20px",
            cursor: "pointer",
            borderRadius: "8px",
          }}
        >
          ▶
        </button>
        {/* Center OK */}
        <button
          onClick={() => press("select")}
          style={{
            width: "52px",
            height: "52px",
            borderRadius: "50%",
            background: "#333",
            border: "2px solid #444",
            color: "#fff",
            fontSize: "13px",
            fontWeight: "bold",
            cursor: "pointer",
            boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
          }}
        >
          OK
        </button>
      </div>

      {/* Nav row: Back / Home / Menu */}
      <div style={{ display: "flex", gap: "12px" }}>
        <Btn label="&#x2190;" button="back" small />
        <Btn label="&#x25CB;" button="home" small />
        <Btn label="&#x2261;" button="menu" small />
      </div>

      {/* Divider */}
      <div
        style={{
          width: "80%",
          height: "1px",
          background: "#333",
        }}
      />

      {/* Media transport */}
      <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
        <Btn label="&#x23EA;" button="rewind" round={false} small />
        <Btn label="&#x23EF;" button="play_pause" round />
        <Btn label="&#x23E9;" button="fast_forward" round={false} small />
      </div>

      {/* Volume */}
      <div style={{ display: "flex", gap: "12px" }}>
        <Btn label="Vol+" button="volume_up" small />
        <Btn label="Vol-" button="volume_down" small />
      </div>
    </div>
  );
}
