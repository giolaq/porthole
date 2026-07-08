import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

export interface DiffRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenDiffOptions {
  thresholdRatio?: number;
  region?: DiffRegion;
  pixelThreshold?: number;
}

export interface ScreenDiffResult {
  ok: boolean;
  mismatchRatio: number;
  mismatchPixels: number;
  comparedPixels: number;
  diffPng?: Uint8Array;
}

export function comparePngScreens(
  baselinePng: Uint8Array,
  currentPng: Uint8Array,
  opts: ScreenDiffOptions = {},
): ScreenDiffResult {
  const baseline = PNG.sync.read(Buffer.from(baselinePng));
  const current = PNG.sync.read(Buffer.from(currentPng));
  if (baseline.width !== current.width || baseline.height !== current.height) {
    throw new Error(
      `Screenshot dimensions differ: baseline ${baseline.width}x${baseline.height}, current ${current.width}x${current.height}.`,
    );
  }

  const region = normalizeRegion(opts.region, baseline.width, baseline.height);
  const baselineData = region
    ? cropRgba(baseline.data, baseline.width, region)
    : baseline.data;
  const currentData = region
    ? cropRgba(current.data, current.width, region)
    : current.data;
  const width = region?.width ?? baseline.width;
  const height = region?.height ?? baseline.height;
  const diff = new PNG({ width, height });
  const mismatchPixels = pixelmatch(baselineData, currentData, diff.data, width, height, {
    threshold: opts.pixelThreshold ?? 0.1,
  });
  const comparedPixels = width * height;
  const mismatchRatio = comparedPixels === 0 ? 0 : mismatchPixels / comparedPixels;
  const thresholdRatio = opts.thresholdRatio ?? 0.02;

  return {
    ok: mismatchRatio <= thresholdRatio,
    mismatchRatio,
    mismatchPixels,
    comparedPixels,
    diffPng: PNG.sync.write(diff),
  };
}

export function parseDiffRegion(value: string): DiffRegion {
  const parts = value.split(",").map((part) => Number(part.trim()));
  const [x, y, width, height] = parts;
  if (
    parts.length !== 4 ||
    x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined ||
    parts.some((part) => !Number.isInteger(part) || part < 0) ||
    width === 0 ||
    height === 0
  ) {
    throw new Error("Region must be x,y,w,h using positive integer width/height.");
  }
  return {
    x,
    y,
    width,
    height,
  };
}

function normalizeRegion(
  region: DiffRegion | undefined,
  imageWidth: number,
  imageHeight: number,
): DiffRegion | undefined {
  if (!region) return undefined;
  if (region.x + region.width > imageWidth || region.y + region.height > imageHeight) {
    throw new Error(
      `Region ${region.x},${region.y},${region.width},${region.height} exceeds screenshot ${imageWidth}x${imageHeight}.`,
    );
  }
  return region;
}

function cropRgba(data: Uint8Array, sourceWidth: number, region: DiffRegion): Uint8Array {
  const result = new Uint8Array(region.width * region.height * 4);
  for (let y = 0; y < region.height; y++) {
    const sourceStart = ((region.y + y) * sourceWidth + region.x) * 4;
    const sourceEnd = sourceStart + region.width * 4;
    result.set(data.subarray(sourceStart, sourceEnd), y * region.width * 4);
  }
  return result;
}
