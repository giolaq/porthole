import type { ActivityEvent } from "portholejs/protocol";

const badge = { human: "👤", agent: "🤖", cli: "⌨️", ci: "🏗" } as const;

export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <aside
      data-testid="activity-feed"
      style={{
        width: 280,
        minWidth: 220,
        alignSelf: "stretch",
        overflowY: "auto",
        borderLeft: "1px solid #333",
        background: "#181818",
        padding: 12,
      }}
    >
      <h2 style={{ margin: "0 0 12px", fontSize: 15 }}>Activity</h2>
      {[...events].reverse().map((event) => (
        <div
          key={event.id}
          data-testid="activity-row"
          style={{
            padding: "8px 0",
            borderBottom: "1px solid #333",
            fontSize: 12,
            color:
              event.outcome === "ok"
                ? "#ddd"
                : event.outcome === "rejected"
                  ? "#ffc266"
                  : "#ff8585",
          }}
        >
          <div>
            <span title={event.actor.kind}>{badge[event.actor.kind]}</span>{" "}
            <strong>{event.action}</strong>{" "}
            <small style={{ color: "#888", float: "right" }}>
              {relativeTime(event.ts)}
            </small>
          </div>
          {event.action === "note" ? (
            <p
              style={{
                margin: "4px 0",
                background: "#282838",
                padding: 8,
                borderRadius: 8,
              }}
            >
              {String(event.params?.message ?? "")}
            </p>
          ) : event.params && Object.keys(event.params).length > 0 ? (
            <div style={{ color: "#aaa", overflowWrap: "anywhere" }}>
              {formatParams(event.params)}
            </div>
          ) : null}
          {event.outcome !== "ok" && <div>{event.error?.message ?? event.outcome}</div>}
        </div>
      ))}
      {events.length === 0 && (
        <p style={{ color: "#888", fontSize: 12 }}>No activity yet.</p>
      )}
    </aside>
  );
}

function relativeTime(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}
function formatParams(params: Record<string, unknown>): string {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");
}
