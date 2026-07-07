import { describe, it, expect } from "vitest";
import { detectProfileFromConfig } from "../profiles.js";

describe("detectProfileFromConfig", () => {
  it("detects android-tv profile", () => {
    const config = `
hw.device.name=Television (4K)
tag.id=android-tv
tag.display=Android TV
abi.type=x86_64
`;
    expect(detectProfileFromConfig(config)).toBe("tv");
  });

  it("detects google-tv profile", () => {
    const config = `
hw.device.name=Television
tag.id=google-tv
abi.type=x86_64
`;
    expect(detectProfileFromConfig(config)).toBe("tv");
  });

  it("detects phone profile when tag.id is default", () => {
    const config = `
hw.device.name=Pixel 7
tag.id=default
abi.type=x86_64
`;
    expect(detectProfileFromConfig(config)).toBe("phone");
  });

  it("detects phone profile when tag.id is google_apis", () => {
    const config = `
hw.device.name=Pixel 7
tag.id=google_apis
abi.type=x86_64
`;
    expect(detectProfileFromConfig(config)).toBe("phone");
  });

  it("defaults to phone when no tag.id", () => {
    const config = `
hw.device.name=Pixel 7
abi.type=x86_64
`;
    expect(detectProfileFromConfig(config)).toBe("phone");
  });

  it("handles whitespace around tag.id", () => {
    const config = `  tag.id = android-tv  `;
    expect(detectProfileFromConfig(config)).toBe("tv");
  });

  it("handles empty config", () => {
    expect(detectProfileFromConfig("")).toBe("phone");
  });
});
