import { describe, expect, it } from "vitest";
import { filterTree, findFocused, parseUiAutomatorXml } from "../ui-tree.js";

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
