import type { ProtocolDevice } from "portholejs/protocol";

interface DevicePickerProps {
  devices: ProtocolDevice[];
  selected: ProtocolDevice | null;
  onSelect: (device: ProtocolDevice) => void;
}

export function DevicePicker({ devices, selected, onSelect }: DevicePickerProps) {
  if (devices.length === 0) {
    return <div style={{ padding: "8px", color: "#888" }}>No devices</div>;
  }

  return (
    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
      {devices.map((d) => (
        <button
          key={d.serial ?? d.name}
          onClick={() => onSelect(d)}
          style={{
            padding: "4px 8px",
            border: selected?.name === d.name ? "2px solid #4af" : "1px solid #444",
            borderRadius: "6px",
            background: selected?.name === d.name ? "#1a3a5a" : "#222",
            color: "#fff",
            cursor: "pointer",
            fontSize: "12px",
          }}
        >
          {d.name} [{d.profile}]{" "}
          {d.state === "running" ? "*" : d.state === "offline" ? "!" : "o"}
        </button>
      ))}
    </div>
  );
}
