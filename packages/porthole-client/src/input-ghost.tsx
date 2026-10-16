import { useEffect, useState } from "react";
import type { ActivityEvent } from "portholejs/protocol";

export function InputGhost({ event }: { event: ActivityEvent | null }) {
  const [visible, setVisible] = useState<ActivityEvent | null>(null);
  useEffect(() => {
    if (
      !event ||
      event.actor.kind === "human" ||
      !["tap", "long_press", "swipe"].includes(event.action) ||
      event.outcome !== "ok"
    )
      return;
    setVisible(event);
    const timer = setTimeout(() => setVisible(null), 800);
    return () => clearTimeout(timer);
  }, [event]);
  if (!visible) return null;
  const x = Number(visible.params?.x ?? visible.params?.x1);
  const y = Number(visible.params?.y ?? visible.params?.y1);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const x2 = Number(visible.params?.x2);
  const y2 = Number(visible.params?.y2);
  return (
    <div
      data-testid="input-ghost"
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 5 }}
    >
      <style>{`@keyframes porthole-ghost { from { opacity: 1; transform: translate(-50%,-50%) scale(.4) } to { opacity: 0; transform: translate(-50%,-50%) scale(2) } } @media (prefers-reduced-motion: reduce) { .porthole-ghost { animation: none !important; opacity: .8 } }`}</style>
      {visible.action === "swipe" && Number.isFinite(x2) && Number.isFinite(y2) && (
        <svg
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <line
            x1={x * 100}
            y1={y * 100}
            x2={x2 * 100}
            y2={y2 * 100}
            stroke="#68d5ff"
            strokeWidth="1"
            strokeDasharray="2 1"
          />
        </svg>
      )}
      <div
        className="porthole-ghost"
        style={{
          position: "absolute",
          left: `${x * 100}%`,
          top: `${y * 100}%`,
          width: 24,
          height: 24,
          border: `3px ${visible.action === "long_press" ? "solid" : "solid"} #68d5ff`,
          borderRadius: "50%",
          boxShadow: "0 0 12px #68d5ff",
          animation: "porthole-ghost .8s ease-out forwards",
        }}
      />
    </div>
  );
}
