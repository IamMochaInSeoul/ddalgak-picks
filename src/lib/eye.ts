// §3.1 Eye classification — EAR/MAR/CheekRise decision tree
import type { FaceFeature, Landmark } from "./types";

// MediaPipe Face Mesh landmark indices
const RIGHT_EYE = [33, 160, 158, 133, 153, 144] as const;
const LEFT_EYE  = [263, 385, 387, 362, 380, 373] as const;
const MOUTH_L   = 61;
const MOUTH_R   = 291;
const MOUTH_TOP = 13;
const MOUTH_BOT = 14;

function d2(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Eye Aspect Ratio from 6-landmark indices [outer, upper×2, inner, lower×2] */
export function computeEAR(
  lm: Landmark[],
  idx: readonly [number, number, number, number, number, number]
): number {
  const [i1, i2, i3, i4, i5, i6] = idx;
  const p = [lm[i1], lm[i2], lm[i3], lm[i4], lm[i5], lm[i6]];
  if (p.some((pt) => !pt)) return 0.25; // safe default: open
  const horiz = d2(p[0], p[3]);
  if (horiz < 1e-6) return 0.25;
  return (d2(p[1], p[5]) + d2(p[2], p[4])) / (2 * horiz);
}

/** Mouth Aspect Ratio — vertical opening / horizontal width */
export function computeMAR(lm: Landmark[]): number {
  const l = lm[MOUTH_L], r = lm[MOUTH_R];
  const t = lm[MOUTH_TOP], b = lm[MOUTH_BOT];
  if (!l || !r || !t || !b) return 0;
  const horiz = d2(l, r);
  return horiz < 1e-6 ? 0 : d2(t, b) / horiz;
}

/** Mouth corner angle in degrees — positive = right corner higher = smile */
export function computeMouthCornerAngle(lm: Landmark[]): number {
  const l = lm[MOUTH_L], r = lm[MOUTH_R];
  if (!l || !r) return 0;
  // image y is downward: positive dy → right corner is higher in image
  return Math.atan2(l.y - r.y, r.x - l.x) * (180 / Math.PI);
}

/** Cheek rise 0-1 — infraorbital (117/346) vs lower lid (145/374) gap */
export function computeCheekRise(lm: Landmark[]): number {
  const rCheekY = lm[117]?.y ?? 0;
  const rEyeY   = lm[145]?.y ?? 0;
  const lCheekY = lm[346]?.y ?? 0;
  const lEyeY   = lm[374]?.y ?? 0;
  const avg = ((rCheekY - rEyeY) + (lCheekY - lEyeY)) / 2;
  // neutral ≈ 0.15, fully risen ≈ 0.03 → map to [0, 1]
  return Math.max(0, Math.min(1, (0.15 - avg) / 0.12));
}

/** Compute EAR for both eyes from raw landmarks */
export function computeEARBoth(lm: Landmark[]): { earLeft: number; earRight: number } {
  return {
    earRight: computeEAR(lm, RIGHT_EYE),
    earLeft:  computeEAR(lm, LEFT_EYE),
  };
}

/**
 * §3.8 — gaze estimation from iris landmarks (468/473).
 * Returns normalized iris offset from eye center + camera-gaze flag.
 */
export function computeGaze(lm: Landmark[]): {
  irisOffset: { x: number; y: number };
  isLookingAtCamera: boolean;
  gazeConfidence: number;
} {
  const GAZE_THRESHOLD = 0.15;
  const noGaze = { irisOffset: { x: 0, y: 0 }, isLookingAtCamera: false, gazeConfidence: 0 };

  if (lm.length < 478) return noGaze;

  const rIris = lm[468]; // right iris center (MediaPipe index)
  const lIris = lm[473]; // left iris center
  if (!rIris || !lIris) return noGaze;

  // Eye centers from corner landmarks
  const rOuter = lm[33], rInner = lm[133];
  const lInner = lm[362], lOuter = lm[263];
  if (!rOuter || !rInner || !lInner || !lOuter) return noGaze;

  const rEyeW = Math.abs(rOuter.x - rInner.x);
  const lEyeW = Math.abs(lOuter.x - lInner.x);
  const rCtrX = (rOuter.x + rInner.x) / 2;
  const rCtrY = (rOuter.y + rInner.y) / 2;
  const lCtrX = (lInner.x + lOuter.x) / 2;
  const lCtrY = (lInner.y + lOuter.y) / 2;

  const rOffX = rEyeW > 1e-4 ? (rIris.x - rCtrX) / rEyeW : 0;
  const rOffY = rEyeW > 1e-4 ? (rIris.y - rCtrY) / rEyeW : 0;
  const lOffX = lEyeW > 1e-4 ? (lIris.x - lCtrX) / lEyeW : 0;
  const lOffY = lEyeW > 1e-4 ? (lIris.y - lCtrY) / lEyeW : 0;

  const avgX = (rOffX + lOffX) / 2;
  const avgY = (rOffY + lOffY) / 2;
  const dist = Math.hypot(avgX, avgY);
  const isLooking = dist < GAZE_THRESHOLD;

  return {
    irisOffset: { x: avgX, y: avgY },
    isLookingAtCamera: isLooking,
    gazeConfidence: isLooking ? Math.max(0, 1 - dist / GAZE_THRESHOLD) : 0,
  };
}

/**
 * §3.1.2 decision tree.
 * Returns eyeOpen [0-1] + eye-state flags.
 */
export function classifyEye(
  face: Pick<FaceFeature, "earLeft" | "earRight" | "marInner" | "cheekRise" | "mouthCornerAngle">
): { eyeOpen: number; isGenuineEyeClose: boolean; isLaughingSquint: boolean } {
  const ear = (face.earLeft + face.earRight) / 2;

  if (ear >= 0.20) {
    return { eyeOpen: 1.0, isGenuineEyeClose: false, isLaughingSquint: false };
  }

  if (ear < 0.15) {
    const squint =
      face.marInner >= 0.40 &&
      face.mouthCornerAngle >= 12 &&
      face.cheekRise >= 0.4;
    if (squint) {
      return { eyeOpen: 0.85, isGenuineEyeClose: false, isLaughingSquint: true };
    }
    return { eyeOpen: 0.0, isGenuineEyeClose: true, isLaughingSquint: false };
  }

  // 0.15 ≤ EAR < 0.20 — ambiguous
  const squint = face.marInner >= 0.35 && face.mouthCornerAngle >= 8;
  if (squint) {
    return { eyeOpen: 0.7, isGenuineEyeClose: false, isLaughingSquint: true };
  }
  return { eyeOpen: 0.4, isGenuineEyeClose: false, isLaughingSquint: false };
}
