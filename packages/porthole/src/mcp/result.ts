import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ControlClientError } from "../control-client.js";
import { PortholeError } from "../actions/errors.js";

let inboxProvider: (() => Promise<string | undefined>) | undefined;
export function setInboxProvider(provider: () => Promise<string | undefined>): void {
  inboxProvider = provider;
}

export function ok(value: unknown, text?: string, structured = true): CallToolResult {
  const content = [{ type: "text" as const, text: text ?? JSON.stringify(value) }];
  return structured &&
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? { content, structuredContent: value as Record<string, unknown> }
    : { content };
}

export function image(png: Uint8Array, extraText?: string): CallToolResult {
  return {
    content: [
      { type: "image", data: Buffer.from(png).toString("base64"), mimeType: "image/png" },
      ...(extraText ? [{ type: "text" as const, text: extraText }] : []),
    ],
  };
}

export function fail(error: unknown): CallToolResult {
  const porthole = error instanceof PortholeError || error instanceof ControlClientError;
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify({
          error: message,
          code: porthole ? error.code : "BAD_REQUEST",
          retryable: porthole ? error.retryable : false,
        }),
      },
    ],
  };
}

export async function guarded(
  fn: () => Promise<CallToolResult>,
): Promise<CallToolResult> {
  let result: CallToolResult;
  try {
    result = await fn();
  } catch (error) {
    result = fail(error);
  }
  const hint = await inboxProvider?.();
  if (hint) result.content.push({ type: "text", text: hint });
  return result;
}
