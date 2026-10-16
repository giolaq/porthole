export type PortholeErrorCode =
  | "NO_DEVICE"
  | "DEVICE_NOT_READY"
  | "TOUCH_NOT_SUPPORTED"
  | "NOT_SUPPORTED_ON_VEGA"
  | "NOT_FOUND"
  | "TIMEOUT"
  | "BAD_REQUEST"
  | "ADB_FAILED"
  | "RECORDING_ACTIVE"
  | "PAUSED_BY_HUMAN";

export class PortholeError extends Error {
  constructor(
    readonly code: PortholeErrorCode,
    message: string,
    readonly httpStatus: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "PortholeError";
  }
}

export function asPortholeError(error: unknown): PortholeError {
  if (error instanceof PortholeError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new PortholeError("BAD_REQUEST", message, 400);
}
