export interface H264Sample {
  data: Uint8Array;
  timestamp: number;
  keyframe: boolean;
}

export interface Mp4VideoTrack {
  width: number;
  height: number;
  timescale?: number;
  durationMs?: number;
  config: Uint8Array;
  samples: H264Sample[];
}

interface PreparedSample {
  data: Uint8Array;
  duration: number;
  keyframe: boolean;
  offset: number;
}

const DEFAULT_TIMESCALE = 90_000;
// A late-joining recorder receives the server's cached keyframe whose PTS can
// be minutes older than the live stream; unclamped, that gap becomes one
// giant frozen first frame. No real inter-frame gap should exceed this.
const MAX_SAMPLE_DURATION_S = 1;
const MIN_SAMPLE_DURATION_S = 1 / 240;

export function createMp4(track: Mp4VideoTrack): Uint8Array {
  if (track.samples.length === 0) throw new Error("Cannot create MP4 without samples.");
  const timescale = track.timescale ?? DEFAULT_TIMESCALE;
  const parameterSets = h264ParameterSets(track.config);
  const prepared = prepareSamples(track.samples, timescale, track.durationMs);
  const ftyp = box(
    "ftyp",
    str("isom"),
    u32(0x200),
    str("isom"),
    str("iso2"),
    str("avc1"),
    str("mp41"),
  );
  const mdatPayload = concat(prepared.map((sample) => sample.data));
  const mdat = box("mdat", mdatPayload);
  const firstSampleOffset = ftyp.byteLength + 8;
  let offset = firstSampleOffset;
  for (const sample of prepared) {
    sample.offset = offset;
    offset += sample.data.byteLength;
  }
  const moov = moovBox(track, prepared, parameterSets, timescale);
  return concat([ftyp, mdat, moov]);
}

export function annexBToAvcc(data: Uint8Array): Uint8Array {
  const nals = splitAnnexBNals(data);
  return concat(
    nals.map((nal) => {
      const length = u32(nal.byteLength);
      return concat([length, nal]);
    }),
  );
}

export function splitAnnexBNals(data: Uint8Array): Uint8Array[] {
  const starts: number[] = [];
  for (let i = 0; i < data.byteLength - 3; i++) {
    if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1) {
      starts.push(i);
      i += 2;
    } else if (
      i < data.byteLength - 4 &&
      data[i] === 0 &&
      data[i + 1] === 0 &&
      data[i + 2] === 0 &&
      data[i + 3] === 1
    ) {
      starts.push(i);
      i += 3;
    }
  }
  return starts.map((start, index) => {
    const startCodeLength = data[start + 2] === 1 ? 3 : 4;
    const nalStart = start + startCodeLength;
    const nalEnd = starts[index + 1] ?? data.byteLength;
    return data.subarray(nalStart, nalEnd);
  });
}

export function hasMp4Box(data: Uint8Array, type: string): boolean {
  for (let offset = 0; offset + 8 <= data.byteLength;) {
    const size = readU32(data, offset);
    const boxType = new TextDecoder().decode(data.subarray(offset + 4, offset + 8));
    if (boxType === type) return true;
    if (size < 8) return false;
    offset += size;
  }
  return false;
}

function prepareSamples(
  samples: H264Sample[],
  timescale: number,
  durationMs: number | undefined,
): PreparedSample[] {
  const totalDurationSeconds = durationMs === undefined ? undefined : durationMs / 1000;
  const firstTimestamp = timestampSeconds(samples[0]?.timestamp ?? 0);
  return samples.map((sample, index) => {
    const next = samples[index + 1];
    const durationSeconds = next
      ? timestampSeconds(next.timestamp) - timestampSeconds(sample.timestamp)
      : totalDurationSeconds !== undefined
        ? Math.max(
            1 / 30,
            totalDurationSeconds - (timestampSeconds(sample.timestamp) - firstTimestamp),
          )
        : index > 0
          ? timestampSeconds(sample.timestamp) -
            timestampSeconds(previousSample(samples, index).timestamp)
          : 1 / 30;
    const clampedSeconds = Math.min(
      MAX_SAMPLE_DURATION_S,
      Math.max(MIN_SAMPLE_DURATION_S, durationSeconds),
    );
    return {
      data: annexBToAvcc(sample.data),
      duration: Math.max(1, Math.round(clampedSeconds * timescale)),
      keyframe: sample.keyframe,
      offset: 0,
    };
  });
}

function previousSample(samples: H264Sample[], index: number): H264Sample {
  const sample = samples[index - 1];
  if (!sample) throw new Error("Missing previous sample.");
  return sample;
}

function timestampSeconds(timestamp: number): number {
  return timestamp > 10_000 ? timestamp / 1_000_000 : timestamp / 1_000;
}

function h264ParameterSets(config: Uint8Array): { sps: Uint8Array; pps: Uint8Array } {
  const nals = splitAnnexBNals(config);
  const sps = nals.find((nal) => (nal[0] & 0x1f) === 7);
  const pps = nals.find((nal) => (nal[0] & 0x1f) === 8);
  if (!sps || !pps) throw new Error("H.264 config must contain SPS and PPS NAL units.");
  return { sps, pps };
}

function moovBox(
  track: Mp4VideoTrack,
  samples: PreparedSample[],
  parameterSets: { sps: Uint8Array; pps: Uint8Array },
  timescale: number,
): Uint8Array {
  const duration = samples.reduce((sum, sample) => sum + sample.duration, 0);
  return box(
    "moov",
    mvhd(timescale, duration),
    trakBox(track, samples, parameterSets, timescale, duration),
  );
}

function trakBox(
  track: Mp4VideoTrack,
  samples: PreparedSample[],
  parameterSets: { sps: Uint8Array; pps: Uint8Array },
  timescale: number,
  duration: number,
): Uint8Array {
  return box(
    "trak",
    tkhd(track.width, track.height, duration),
    box(
      "mdia",
      mdhd(timescale, duration),
      hdlr(),
      box("minf", vmhd(), dinf(), stbl(track, samples, parameterSets)),
    ),
  );
}

function mvhd(timescale: number, duration: number): Uint8Array {
  return box(
    "mvhd",
    u32(0),
    u32(0),
    u32(0),
    u32(timescale),
    u32(duration),
    u32(0x00010000),
    u16(0x0100),
    zeros(10),
    matrix(),
    zeros(24),
    u32(2),
  );
}

function tkhd(width: number, height: number, duration: number): Uint8Array {
  return box(
    "tkhd",
    u32(0x00000007),
    u32(0),
    u32(0),
    u32(1),
    u32(0),
    u32(duration),
    zeros(8),
    u16(0),
    u16(0),
    u16(0),
    u16(0),
    matrix(),
    u32(width << 16),
    u32(height << 16),
  );
}

function mdhd(timescale: number, duration: number): Uint8Array {
  return box(
    "mdhd",
    u32(0),
    u32(0),
    u32(0),
    u32(timescale),
    u32(duration),
    u16(0x55c4),
    u16(0),
  );
}

function hdlr(): Uint8Array {
  return box("hdlr", u32(0), u32(0), str("vide"), zeros(12), str("VideoHandler\0"));
}

function vmhd(): Uint8Array {
  return box("vmhd", u32(1), u16(0), u16(0), u16(0), u16(0));
}

function dinf(): Uint8Array {
  return box("dinf", box("dref", u32(0), u32(1), box("url ", u32(1))));
}

function stbl(
  track: Mp4VideoTrack,
  samples: PreparedSample[],
  parameterSets: { sps: Uint8Array; pps: Uint8Array },
): Uint8Array {
  return box(
    "stbl",
    stsd(track, parameterSets),
    stts(samples),
    stss(samples),
    box("stsc", u32(0), u32(1), u32(1), u32(1), u32(1)),
    box(
      "stsz",
      u32(0),
      u32(0),
      u32(samples.length),
      ...samples.map((sample) => u32(sample.data.byteLength)),
    ),
    box(
      "stco",
      u32(0),
      u32(samples.length),
      ...samples.map((sample) => u32(sample.offset)),
    ),
  );
}

function stsd(
  track: Mp4VideoTrack,
  parameterSets: { sps: Uint8Array; pps: Uint8Array },
): Uint8Array {
  return box(
    "stsd",
    u32(0),
    u32(1),
    box(
      "avc1",
      zeros(6),
      u16(1),
      zeros(16),
      u16(track.width),
      u16(track.height),
      u32(0x00480000),
      u32(0x00480000),
      u32(0),
      u16(1),
      zeros(32),
      u16(0x0018),
      u16(0xffff),
      avcc(parameterSets),
    ),
  );
}

function stts(samples: PreparedSample[]): Uint8Array {
  return box(
    "stts",
    u32(0),
    u32(samples.length),
    ...samples.map((sample) => concat([u32(1), u32(sample.duration)])),
  );
}

function stss(samples: PreparedSample[]): Uint8Array {
  const keys = samples.flatMap((sample, index) =>
    sample.keyframe ? [u32(index + 1)] : [],
  );
  return box("stss", u32(0), u32(keys.length), ...keys);
}

function avcc({ sps, pps }: { sps: Uint8Array; pps: Uint8Array }): Uint8Array {
  return box(
    "avcC",
    u8(1),
    u8(sps[1] ?? 0x42),
    u8(sps[2] ?? 0),
    u8(sps[3] ?? 0x1f),
    u8(0xff),
    u8(0xe1),
    u16(sps.byteLength),
    sps,
    u8(1),
    u16(pps.byteLength),
    pps,
  );
}

function box(type: string, ...payloads: Uint8Array[]): Uint8Array {
  const payload = concat(payloads);
  return concat([u32(payload.byteLength + 8), str(type), payload]);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function matrix(): Uint8Array {
  return concat([
    u32(0x00010000),
    u32(0),
    u32(0),
    u32(0),
    u32(0x00010000),
    u32(0),
    u32(0),
    u32(0),
    u32(0x40000000),
  ]);
}

function str(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function zeros(length: number): Uint8Array {
  return new Uint8Array(length);
}

function u8(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff);
}

function u16(value: number): Uint8Array {
  const data = new Uint8Array(2);
  new DataView(data.buffer).setUint16(0, value);
  return data;
}

function u32(value: number): Uint8Array {
  const data = new Uint8Array(4);
  new DataView(data.buffer).setUint32(0, value >>> 0);
  return data;
}

function readU32(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset);
}
