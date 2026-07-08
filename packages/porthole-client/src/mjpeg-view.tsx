interface MjpegViewProps {
  width: number;
  height: number;
}

export function MjpegView({ width, height }: MjpegViewProps) {
  return (
    <img
      data-testid="mjpeg-stream"
      src="/stream.mjpeg"
      width={width}
      height={height}
      style={{ maxWidth: "100%", height: "auto", display: "block" }}
      alt=""
    />
  );
}
