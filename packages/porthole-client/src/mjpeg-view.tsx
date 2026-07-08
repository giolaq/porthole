interface MjpegViewProps {
  width: number;
  height: number;
  deviceId?: string;
}

export function MjpegView({ width, height, deviceId }: MjpegViewProps) {
  const query = deviceId ? `?device=${encodeURIComponent(deviceId)}` : "";
  return (
    <img
      data-testid="mjpeg-stream"
      src={`/stream.mjpeg${query}`}
      width={width}
      height={height}
      style={{ maxWidth: "100%", height: "auto", display: "block" }}
      alt=""
    />
  );
}
