import { describe, expect, it } from "vitest";
import { chooseDpadDirection, focusedMatches } from "../focus-navigation.js";
import { findFocused, parseUiAutomatorXml } from "../ui-tree.js";

describe("chooseDpadDirection", () => {
  it("moves across a grid toward the target", () => {
    const tree = parseUiAutomatorXml(
      xmlForNodes([
        node("A", 0, 0, true),
        node("B", 100, 0),
        node("C", 0, 100),
        node("D", 100, 100),
      ]),
    );

    expect(chooseDpadDirection(tree, { text: "D" })).toBe("dpad_right");
  });

  it("moves vertically in a rail", () => {
    const tree = parseUiAutomatorXml(
      xmlForNodes([node("Home", 0, 0, true), node("Library", 0, 120)]),
    );

    expect(chooseDpadDirection(tree, { text: "Library" })).toBe("dpad_down");
  });

  it("handles nested rows", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy>
  <node text="" class="root" enabled="true" bounds="[0,0][400,400]">
    <node text="" class="row" enabled="true" bounds="[0,0][400,100]">
      ${node("Focused", 20, 20, true)}
      ${node("Target", 250, 20)}
    </node>
  </node>
</hierarchy>`;

    expect(chooseDpadDirection(parseUiAutomatorXml(xml), { text: "Target" })).toBe(
      "dpad_right",
    );
  });

  it("returns null when the target already has focus", () => {
    const tree = parseUiAutomatorXml(xmlForNodes([node("Library", 0, 0, true)]));

    expect(chooseDpadDirection(tree, { text: "Library" })).toBeNull();
  });

  it("treats focus on a card container as arrival when a child holds the title", () => {
    // Leanback focuses the card CONTAINER; the title text lives on a child.
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy>
  <node text="" class="root" enabled="true" bounds="[0,0][400,400]">
    <node text="" class="CardView" enabled="true" focusable="true" focused="true" bounds="[0,0][200,200]">
      <node text="Catastrophe" class="TextView" enabled="true" bounds="[10,150][190,190]" />
    </node>
  </node>
</hierarchy>`;
    const tree = parseUiAutomatorXml(xml);
    const focused = findFocused(tree);
    if (!focused) throw new Error("fixture must contain a focused node");

    expect(focusedMatches(focused, { text: "Catastrophe" })).toBe(true);
    expect(chooseDpadDirection(tree, { text: "Catastrophe" })).toBeNull();
  });
});

function xmlForNodes(nodes: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><hierarchy><node text="" class="root" enabled="true" bounds="[0,0][400,400]">${nodes.join("")}</node></hierarchy>`;
}

function node(text: string, x: number, y: number, focused = false): string {
  return `<node text="${text}" resource-id="id/${text}" class="android.widget.TextView" content-desc="${text}" clickable="true" enabled="true" focusable="true" focused="${focused}" bounds="[${x},${y}][${x + 80},${y + 80}]" />`;
}
