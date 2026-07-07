import { PNG } from "pngjs";
import jpeg from "jpeg-js";

export interface ConvertedFrame {
  data: Uint8Array;
  mime: string;
}

// Convert a screencap PNG into a downscaled JPEG so the MJPEG fallback does
// not ship multi-megabyte native-resolution PNGs per frame. Pure JS on
// purpose — no native binaries (PRD §6).
export function pngToScaledJpeg(
  png: Uint8Array,
  maxDim = 800,
  quality = 70,
): ConvertedFrame {
  const decoded = PNG.sync.read(Buffer.from(png));
  const scale = Math.min(1, maxDim / Math.max(decoded.width, decoded.height));
  const width = Math.max(1, Math.round(decoded.width * scale));
  const height = Math.max(1, Math.round(decoded.height * scale));

  let rgba: Buffer;
  if (scale >= 1) {
    rgba = decoded.data;
  } else {
    rgba = Buffer.allocUnsafe(width * height * 4);
    for (let y = 0; y < height; y++) {
      const srcY = Math.min(decoded.height - 1, Math.round(y / scale));
      for (let x = 0; x < width; x++) {
        const srcX = Math.min(decoded.width - 1, Math.round(x / scale));
        const src = (srcY * decoded.width + srcX) * 4;
        const dst = (y * width + x) * 4;
        rgba[dst] = decoded.data[src] ?? 0;
        rgba[dst + 1] = decoded.data[src + 1] ?? 0;
        rgba[dst + 2] = decoded.data[src + 2] ?? 0;
        rgba[dst + 3] = 255;
      }
    }
  }

  const encoded = jpeg.encode({ data: rgba, width, height }, quality);
  return { data: new Uint8Array(encoded.data), mime: "image/jpeg" };
}
