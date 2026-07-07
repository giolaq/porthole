import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { adbBin, findAndroidSdk } from "./device-manager.js";

const execFileAsync = promisify(execFile);

export interface UiBounds {
  l: number;
  t: number;
  r: number;
  b: number;
}

export interface UiNode {
  class: string;
  text: string;
  resourceId: string;
  contentDesc: string;
  bounds: UiBounds;
  focused: boolean;
  focusable: boolean;
  clickable: boolean;
  enabled: boolean;
  children: UiNode[];
}

export interface UiMatch extends UiNode {
  center: { x: number; y: number };
}

export async function dumpUi(serial: string, filter?: string): Promise<UiNode[]> {
  const xml = await dumpUiXml(serial);
  const tree = parseUiAutomatorXml(xml);
  return filter ? filterTree(tree, filter) : tree;
}

export async function getFocusedNode(serial: string): Promise<UiNode | null> {
  return findFocused(parseUiAutomatorXml(await dumpUiXml(serial)));
}

export async function findElement(
  serial: string,
  query: { text?: string; resourceId?: string },
): Promise<UiMatch | null> {
  const tree = parseUiAutomatorXml(await dumpUiXml(serial));
  const node = flatten(tree).find((candidate) => {
    if (query.text && !candidate.text.includes(query.text)) return false;
    if (query.resourceId && !candidate.resourceId.includes(query.resourceId)) {
      return false;
    }
    return true;
  });
  return node ? withCenter(node) : null;
}

export async function waitForUiText(
  serial: string,
  text: string,
  timeoutMs: number,
): Promise<UiNode> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const tree = parseUiAutomatorXml(await dumpUiXml(serial));
    const found = flatten(tree).find((node) => node.text.includes(text));
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for text: ${text}`);
}

export function parseUiAutomatorXml(xml: string): UiNode[] {
  const nodes: UiNode[] = [];
  const stack: UiNode[] = [];
  const tagRe = /<\/node>|<node\b([^>]*?)(\/?)>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(xml)) !== null) {
    if (match[0] === "</node>") {
      stack.pop();
      continue;
    }

    const attrs = parseAttributes(match[1] ?? "");
    const node: UiNode = {
      class: attrs.get("class") ?? "",
      text: attrs.get("text") ?? "",
      resourceId: attrs.get("resource-id") ?? "",
      contentDesc: attrs.get("content-desc") ?? "",
      bounds: parseBounds(attrs.get("bounds") ?? ""),
      focused: attrs.get("focused") === "true",
      focusable: attrs.get("focusable") === "true",
      clickable: attrs.get("clickable") === "true",
      enabled: attrs.get("enabled") !== "false",
      children: [],
    };

    const parent = stack.at(-1);
    if (parent) parent.children.push(node);
    else nodes.push(node);

    if (match[2] !== "/") {
      stack.push(node);
    }
  }

  return nodes;
}

export function findFocused(nodes: UiNode[]): UiNode | null {
  for (const node of nodes) {
    if (node.focused) return node;
    const child = findFocused(node.children);
    if (child) return child;
  }
  return null;
}

export function filterTree(nodes: UiNode[], query: string): UiNode[] {
  const needle = query.toLowerCase();
  return nodes.flatMap((node) => {
    const children = filterTree(node.children, query);
    const selfMatches =
      node.text.toLowerCase().includes(needle) ||
      node.resourceId.toLowerCase().includes(needle) ||
      node.contentDesc.toLowerCase().includes(needle);
    return selfMatches || children.length > 0 ? [{ ...node, children }] : [];
  });
}

function flatten(nodes: UiNode[]): UiNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

function withCenter(node: UiNode): UiMatch {
  return {
    ...node,
    center: {
      x: (node.bounds.l + node.bounds.r) / 2,
      y: (node.bounds.t + node.bounds.b) / 2,
    },
  };
}

async function dumpUiXml(serial: string): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const direct = await tryDumpDirect(serial);
    if (direct.trim()) return direct;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  const adb = adbBin(findAndroidSdk());
  await execFileAsync(adb, [
    "-s",
    serial,
    "shell",
    "uiautomator",
    "dump",
    "/sdcard/window_dump.xml",
  ]);
  const { stdout } = await execFileAsync(adb, [
    "-s",
    serial,
    "exec-out",
    "cat",
    "/sdcard/window_dump.xml",
  ]);
  return stdout;
}

async function tryDumpDirect(serial: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      adbBin(findAndroidSdk()),
      ["-s", serial, "exec-out", "uiautomator", "dump", "/dev/tty"],
      { maxBuffer: 10 * 1024 * 1024 },
    );
    const start = stdout.indexOf("<?xml");
    return start === -1 ? stdout : stdout.slice(start);
  } catch {
    return "";
  }
}

function parseAttributes(input: string): Map<string, string> {
  const attrs = new Map<string, string>();
  const attrRe = /([\w:-]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(input)) !== null) {
    attrs.set(match[1] ?? "", decodeXml(match[2] ?? ""));
  }
  return attrs;
}

function parseBounds(value: string): UiBounds {
  const match = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(value);
  if (!match) return { l: 0, t: 0, r: 0, b: 0 };
  return {
    l: Number(match[1]),
    t: Number(match[2]),
    r: Number(match[3]),
    b: Number(match[4]),
  };
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}
