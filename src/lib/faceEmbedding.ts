// §3.7 — Geometric identity descriptor from MediaPipe 478-point landmarks.
// 21 inter-landmark distances normalized by inter-eye span + L2 normalized.
// No external model needed — works with existing MediaPipe output.
import type { Landmark } from "./types";

// Landmark pairs that capture stable face geometry for identity
const PAIRS: readonly [number, number][] = [
  [33, 263],   // outer eye span (scale anchor)
  [133, 362],  // inner eye span
  [159, 145],  // right eye vertical
  [386, 374],  // left eye vertical
  [4, 152],    // nose tip → chin
  [10, 152],   // forehead → chin
  [10, 4],     // forehead → nose tip
  [129, 358],  // nose alar width
  [61, 291],   // mouth width
  [13, 14],    // lip gap
  [234, 454],  // jaw width
  [116, 345],  // cheekbone width
  [33, 4],     // right eye → nose tip
  [263, 4],    // left eye → nose tip
  [33, 61],    // right eye → mouth corner
  [263, 291],  // left eye → mouth corner
  [33, 152],   // right eye → chin
  [263, 152],  // left eye → chin
  [70, 300],   // brow outer span
  [55, 285],   // brow inner span
  [0, 17],     // full lip gap
] as const;

export const EMBEDDING_DIM = PAIRS.length; // 21

function d3(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}

/** Compute 21-dim identity descriptor — L2 normalized, scale-invariant */
export function computeFaceEmbedding(landmarks: Landmark[]): Float32Array {
  const vec = new Float32Array(EMBEDDING_DIM);
  if (landmarks.length < 468) return vec;

  const eyeSpan = d3(landmarks[33], landmarks[263]);
  if (eyeSpan < 1e-6) return vec;

  for (let i = 0; i < PAIRS.length; i++) {
    const [a, b] = PAIRS[i];
    vec[i] = d3(landmarks[a], landmarks[b]) / eyeSpan;
  }

  // L2 normalize
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm > 1e-6) for (let i = 0; i < vec.length; i++) vec[i] /= norm;

  return vec;
}

/** Cosine similarity — both vectors assumed L2 normalized */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return Math.max(-1, Math.min(1, dot));
}
