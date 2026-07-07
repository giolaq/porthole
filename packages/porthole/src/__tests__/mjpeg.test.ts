import { describe, expect, it } from "vitest";
import { MJPEG_BOUNDARY, multipartPart } from "../server/mjpeg.js";

describe("multipartPart", () => {
  it("frames an image part with boundary and headers", () => {
    const part = multipartPart({
      mime: "image/png",
      data: new Uint8Array([1, 2, 3]),
    }).toString("binary");
    expect(part).toContain(`--${MJPEG_BOUNDARY}\r\n`);
    expect(part).toContain("Content-Type: image/png\r\n");
    expect(part).toContain("Content-Length: 3\r\n\r\n");
    expect(part.endsWith("\r\n")).toBe(true);
  });
});
