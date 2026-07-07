import { describe, expect, it } from "vitest";
import {
  displaySize,
  filterTree,
  findFocused,
  findInTree,
  parseUiAutomatorXml,
} from "../ui-tree.js";

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  <node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="x" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" bounds="[0,0][1920,1080]">
    <node index="1" text="Home" resource-id="app:id/home" class="android.widget.TextView" package="x" content-desc="Home tile" clickable="true" enabled="true" focusable="true" focused="true" bounds="[100,200][300,280]" />
  </node>
</hierarchy>`;

describe("parseUiAutomatorXml", () => {
  it("parses nodes and bounds", () => {
    const tree = parseUiAutomatorXml(xml);
    expect(tree[0]?.children[0]?.text).toBe("Home");
    expect(tree[0]?.children[0]?.bounds).toEqual({ l: 100, t: 200, r: 300, b: 280 });
  });

  it("finds focused node", () => {
    expect(findFocused(parseUiAutomatorXml(xml))?.resourceId).toBe("app:id/home");
  });

  it("filters with ancestors retained", () => {
    const filtered = filterTree(parseUiAutomatorXml(xml), "home");
    expect(filtered[0]?.children).toHaveLength(1);
  });
});

describe("coordinate normalization", () => {
  // Regression test: bounds come from the NATIVE display resolution, which
  // differs from the (scaled) scrcpy stream metadata. A centered element
  // must normalize to 0.5 against the dump's own display size.
  const nativeXml = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  <node text="" resource-id="" class="android.widget.FrameLayout" enabled="true" bounds="[0,0][1344,2992]">
    <node text="Centered" resource-id="app:id/center" class="android.widget.Button" clickable="true" enabled="true" bounds="[572,1396][772,1596]" />
  </node>
</hierarchy>`;

  it("derives display size from the dump itself", () => {
    expect(displaySize(parseUiAutomatorXml(nativeXml))).toEqual({
      width: 1344,
      height: 2992,
    });
  });

  it("normalizes centers against the native display, not stream metadata", () => {
    const match = findInTree(parseUiAutomatorXml(nativeXml), { text: "Centered" });
    expect(match?.center).toEqual({ x: 672, y: 1496 });
    expect(match?.normalizedCenter?.x).toBeCloseTo(0.5, 3);
    expect(match?.normalizedCenter?.y).toBeCloseTo(0.5, 3);
  });

  it("returns null normalized center when bounds are unusable", () => {
    const empty = `<hierarchy><node text="Ghost" bounds="[0,0][0,0]" /></hierarchy>`;
    const match = findInTree(parseUiAutomatorXml(empty), { text: "Ghost" });
    expect(match?.normalizedCenter).toBeNull();
  });
});
