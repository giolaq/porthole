import type { RemoteButton } from "./keycodes.js";

export interface TouchEvent {
  kind: "touch";
  phase: "down" | "move" | "up";
  x: number;
  y: number;
}

export interface KeyEvent {
  kind: "key";
  phase: "down" | "up";
  keycode: number;
}

export interface TextEvent {
  kind: "text";
  text: string;
}

export interface RemoteEvent {
  kind: "remote";
  button: RemoteButton;
}

export type InputEvent = TouchEvent | KeyEvent | TextEvent | RemoteEvent;
