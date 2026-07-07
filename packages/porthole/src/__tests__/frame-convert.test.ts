import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import { pngToScaledJpeg } from "../server/frame-convert.js";

function makePng(width: number, height: number): Uint8Array {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 200;
    png.data[i + 1] = 50;
    png.data[i + 2] = 50;
    png.data[i + 3] = 255;
  }
  return new Uint8Array(PNG.sync.write(png));
}

describe("pngToScaledJpeg", () => {
  it("downscales to the max dimension and emits JPEG", () => {
    const result = pngToScaledJpeg(makePng(1000, 600), 500, 70);
    expect(result.mime).toBe("image/jpeg");
    expect(result.data[0]).toBe(0xff);
    expect(result.data[1]).toBe(0xd8);
    const decoded = jpeg.decode(Buffer.from(result.data), { useTArray: true });
    expect(decoded.width).toBe(500);
    expect(decoded.height).toBe(300);
  });

  it("keeps small frames at native size", () => {
    const result = pngToScaledJpeg(makePng(120, 80), 800, 70);
    const decoded = jpeg.decode(Buffer.from(result.data), { useTArray: true });
    expect(decoded.width).toBe(120);
    expect(decoded.height).toBe(80);
  });

  it("throws on non-PNG input", () => {
    expect(() => pngToScaledJpeg(new Uint8Array([1, 2, 3]))).toThrow();
  });
});
