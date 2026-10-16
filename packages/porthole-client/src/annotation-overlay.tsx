import { useRef, useState } from "react";
import type { HumanAnnotation } from "portholejs/protocol";

type Rect = HumanAnnotation["rect"];

export function AnnotationOverlay({
  active,
  annotations,
  onCreate,
  onDismiss,
}: {
  active: boolean;
  annotations: HumanAnnotation[];
  onCreate: (rect: Rect, note: string) => Promise<void>;
  onDismiss: (id: number) => Promise<void>;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null);
  const [note, setNote] = useState("");
  const point = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  };
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: active ? 7 : 4,
        pointerEvents: active ? "auto" : "none",
        cursor: active ? "crosshair" : "default",
      }}
      onPointerDown={(event) => {
        if (!active || draft) return;
        start.current = point(event);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={(event) => {
        if (!active || !start.current) return;
        const end = point(event);
        setDraft({
          x: Math.min(start.current.x, end.x),
          y: Math.min(start.current.y, end.y),
          w: Math.abs(end.x - start.current.x),
          h: Math.abs(end.y - start.current.y),
        });
        start.current = null;
      }}
    >
      {annotations.map((annotation) => (
        <div
          key={annotation.id}
          data-testid="annotation-box"
          style={boxStyle(annotation.rect)}
        >
          <button
            title="Dismiss annotation"
            onClick={() => void onDismiss(annotation.id)}
            style={{
              pointerEvents: "auto",
              background: "#171717",
              color: "white",
              border: "1px solid #ffda64",
            }}
          >
            ×
          </button>
          <span style={{ background: "#171717", color: "#ffda64", padding: 2 }}>
            {annotation.note}
          </span>
        </div>
      ))}
      {draft && (
        <div style={{ ...boxStyle(draft), pointerEvents: "auto" }}>
          <textarea
            aria-label="Annotation note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Describe what you see"
            style={{ width: 180, height: 60 }}
          />
          <button
            onClick={() => {
              void onCreate(draft, note);
              setDraft(null);
              setNote("");
            }}
            disabled={!note.trim() || draft.w <= 0 || draft.h <= 0}
          >
            Save note
          </button>
          <button onClick={() => setDraft(null)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

function boxStyle(rect: Rect): React.CSSProperties {
  return {
    position: "absolute",
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.w * 100}%`,
    height: `${rect.h * 100}%`,
    border: "2px solid #ffda64",
    boxSizing: "border-box",
    display: "flex",
    gap: 4,
    alignItems: "flex-start",
  };
}
