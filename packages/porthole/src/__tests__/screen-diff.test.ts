import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { comparePngScreens, parseDiffRegion } from "../screen-diff.js";

describe("comparePngScreens", () => {
  it("passes identical generated PNGs at zero threshold", () => {
    const png = createPng(3, 3, [20, 30, 40, 255]);
    const result = comparePngScreens(png, png, { thresholdRatio: 0 });

    expect(result.ok).toBe(true);
    expect(result.mismatchRatio).toBe(0);
  });

  it("reports a one-pixel diff ratio", () => {
    const baseline = createPng(2, 2, [0, 0, 0, 255]);
    const current = createPng(
      2,
      2,
      [0, 0, 0, 255],
      [{ x: 1, y: 1, rgba: [255, 0, 0, 255] }],
    );
    const result = comparePngScreens(baseline, current, { thresholdRatio: 0.2 });

    expect(result.ok).toBe(false);
    expect(result.mismatchPixels).toBe(1);
    expect(result.mismatchRatio).toBe(0.25);
    expect(result.diffPng?.byteLength).toBeGreaterThan(0);
  });

  it("compares only the requested region", () => {
    const baseline = createPng(3, 3, [0, 0, 0, 255]);
    const current = createPng(
      3,
      3,
      [0, 0, 0, 255],
      [{ x: 2, y: 2, rgba: [255, 0, 0, 255] }],
    );

    expect(
      comparePngScreens(baseline, current, {
        thresholdRatio: 0,
        region: { x: 0, y: 0, width: 2, height: 2 },
      }).ok,
    ).toBe(true);
  });

  it("throws on dimension mismatch", () => {
    expect(() => comparePngScreens(createPng(2, 2), createPng(3, 2))).toThrow(
      "Screenshot dimensions differ",
    );
  });
});

describe("parseDiffRegion", () => {
  it("parses x,y,w,h", () => {
    expect(parseDiffRegion("1,2,3,4")).toEqual({
      x: 1,
      y: 2,
      width: 3,
      height: 4,
    });
  });
});

function createPng(
  width: number,
  height: number,
  fill: [number, number, number, number] = [0, 0, 0, 255],
  points: Array<{ x: number; y: number; rgba: [number, number, number, number] }> = [],
): Uint8Array {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data.set(fill, i);
  }
  for (const point of points) {
    png.data.set(point.rgba, (point.y * width + point.x) * 4);
  }
  return PNG.sync.write(png);
}
