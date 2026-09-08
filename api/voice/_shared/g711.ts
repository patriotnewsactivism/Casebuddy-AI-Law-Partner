/**
 * G.711 μ-law codec and sample-rate conversion utilities.
 *
 * Used by the Twilio Media Streams bridge to transcode between Twilio's 8 kHz
 * G.711 μ-law audio and the 24 kHz 16-bit linear PCM expected by the realtime
 * voice provider. Pure TypeScript — no native or npm dependency.
 *
 * Reference: ITU-T G.711 (1988), Table 2 — μ-law encoding/decoding.
 */

// ── μ-law constants ─────────────────────────────────────────────────────────

const MULAW_BIAS = 0x84; // 132
const MULAW_MAX = 0x7FFF; // 32767
const MULAW_CLIP = 32635;

/** Segment (chord) lookup for μ-law encoding. */
const SEG_END = [0xFF, 0x1FF, 0x3FF, 0x7FF, 0xFFF, 0x1FFF, 0x3FFF, 0x7FFF] as const;

function searchSegment(val: number): number {
  for (let i = 0; i < 8; i++) {
    if (val <= SEG_END[i]) return i;
  }
  return 8;
}

// ── Encode: 16-bit linear PCM → 8-bit μ-law ─────────────────────────────────

/** Encode a single 16-bit signed PCM sample to an 8-bit μ-law byte. */
export function linearToMulaw(sample: number): number {
  let sign = (sample >> 8) & 0x80;
  if (sign !== 0) sample = -sample;
  if (sample > MULAW_CLIP) sample = MULAW_CLIP;
  sample += MULAW_BIAS;

  const seg = searchSegment(sample);
  if (seg >= 8) return (0x7F ^ sign);
  const ulawByte = (seg << 4) | ((sample >> (seg + 3)) & 0x0F);
  return ~(ulawByte | sign) & 0xFF;
}

// ── Decode: 8-bit μ-law → 16-bit linear PCM ─────────────────────────────────

/** μ-law decompression lookup table (256 entries). */
const MULAW_DECODE_TABLE: Int16Array = (() => {
  const t = new Int16Array(256);
  for (let i = 0; i < 256; i++) {
    const inv = ~i;
    const sign = inv & 0x80;
    const exponent = (inv >> 4) & 0x07;
    const mantissa = inv & 0x0F;
    let magnitude = ((mantissa << 3) + MULAW_BIAS) << exponent;
    magnitude -= MULAW_BIAS;
    t[i] = sign !== 0 ? -magnitude : magnitude;
  }
  return t;
})();

/** Decode a single 8-bit μ-law byte to a 16-bit signed PCM sample. */
export function mulawToLinear(ulawByte: number): number {
  return MULAW_DECODE_TABLE[ulawByte & 0xFF];
}

// ── Bulk encode/decode ───────────────────────────────────────────────────────

/** Encode an Int16Array of PCM samples to a Uint8Array of μ-law bytes. */
export function encodeMulaw(pcm: Int16Array): Uint8Array {
  const out = new Uint8Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    out[i] = linearToMulaw(pcm[i]);
  }
  return out;
}

/** Decode a Uint8Array of μ-law bytes to an Int16Array of PCM samples. */
export function decodeMulaw(ulaw: Uint8Array): Int16Array {
  const out = new Int16Array(ulaw.length);
  for (let i = 0; i < ulaw.length; i++) {
    out[i] = mulawToLinear(ulaw[i]);
  }
  return out;
}

// ── Resampling ───────────────────────────────────────────────────────────────

/**
 * Upsample 8 kHz 16-bit PCM to 24 kHz using linear interpolation.
 * Ratio is exactly 3:1, so every source sample maps to 3 output samples.
 */
export function resample8kTo24k(input: Int16Array): Int16Array {
  if (input.length === 0) return new Int16Array(0);
  const out = new Int16Array(input.length * 3);
  for (let i = 0; i < input.length - 1; i++) {
    const a = input[i];
    const b = input[i + 1];
    const base = i * 3;
    out[base] = a;
    out[base + 1] = Math.round(a + (b - a) / 3);
    out[base + 2] = Math.round(a + (2 * (b - a)) / 3);
  }
  // Last sample: replicate
  const last = input.length - 1;
  const base = last * 3;
  out[base] = input[last];
  out[base + 1] = input[last];
  out[base + 2] = input[last];
  return out;
}

/**
 * Downsample 24 kHz 16-bit PCM to 8 kHz by taking every 3rd sample.
 * A simple decimation filter; adequate for telephony voice.
 */
export function resample24kTo8k(input: Int16Array): Int16Array {
  const outLength = Math.floor(input.length / 3);
  const out = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    out[i] = input[i * 3];
  }
  return out;
}

// ── Convenience: Base64 helpers for Twilio Media payloads ────────────────────

/** Decode a base64-encoded G.711 μ-law payload to 16-bit PCM at 8 kHz. */
export function decodeTwilioPayload(base64: string): Int16Array {
  const binary = Buffer.from(base64, 'base64');
  return decodeMulaw(new Uint8Array(binary));
}

/**
 * Encode 16-bit PCM samples (at 8 kHz) to a base64-encoded G.711 μ-law payload
 * suitable for Twilio Media `media` messages.
 */
export function encodeTwilioPayload(pcm: Int16Array): string {
  const ulaw = encodeMulaw(pcm);
  return Buffer.from(ulaw).toString('base64');
}
