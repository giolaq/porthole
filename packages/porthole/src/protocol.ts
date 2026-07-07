import type { VideoChunk } from "./engine/types.js";

export type WsPacketType = "config" | "delta" | "key";

export interface DecodedWsPacket {
  type: WsPacketType;
  timestamp: number;
  data: Uint8Array;
}

const PACKET_HEADER_BYTES = 13;

export function encodeVideoPacket(chunk: VideoChunk): Uint8Array {
  const type = chunk.type === "config" ? 0 : chunk.keyframe ? 2 : 1;
  const header = new Uint8Array(PACKET_HEADER_BYTES);
  const view = new DataView(header.buffer);
  view.setUint8(0, type);
  view.setUint32(1, chunk.data.byteLength);
  view.setFloat64(5, chunk.timestamp ?? 0);
  const packet = new Uint8Array(PACKET_HEADER_BYTES + chunk.data.byteLength);
  packet.set(header, 0);
  packet.set(chunk.data, PACKET_HEADER_BYTES);
  return packet;
}

export function decodeVideoPacket(data: ArrayBufferLike): DecodedWsPacket {
  const view = new DataView(data);
  const rawType = view.getUint8(0);
  const length = view.getUint32(1);
  const timestamp = data.byteLength >= PACKET_HEADER_BYTES ? view.getFloat64(5) : 0;
  const offset = data.byteLength >= PACKET_HEADER_BYTES ? PACKET_HEADER_BYTES : 5;
  const type: WsPacketType = rawType === 0 ? "config" : rawType === 2 ? "key" : "delta";
  return {
    type,
    timestamp,
    data: new Uint8Array(data, offset, length),
  };
}
