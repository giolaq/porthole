import { useCallback } from "react";

interface TouchOverlayProps {
  ws: WebSocket | null;
}

export function TouchOverlay({ ws }: TouchOverlayProps) {
  const send = useCallback(
    (phase: "down" | "move" | "up", e: React.PointerEvent) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      ws.send(JSON.stringify({ kind: "touch", phase, x, y }));
    },
    [ws],
  );

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        touchAction: "none",
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        send("down", e);
      }}
      onPointerMove={(e) => {
        if (e.buttons > 0) send("move", e);
      }}
      onPointerUp={(e) => send("up", e)}
    />
  );
}
