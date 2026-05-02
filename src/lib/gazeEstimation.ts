/**
 * gazeEstimation.ts
 * F18 — 카메라 응시 추정 (TECH_SPEC §3.8)
 *
 * MediaPipe FaceLandmarker의 478 랜드마크에서 yaw/pitch/roll + iris offset을 추출해
 * 주인공이 카메라를 바라보고 있는지 판단한다.
 *
 * heroBonus 계산의 응시 가산점(+5)에 사용된다.
 */

import type { Landmark } from "./types";

export interface GazeResult {
  isLookingAtCamera: boolean;
  gazeConfidence: number;  // 0~1
  yaw: number;   // degrees, 양수 = 오른쪽으로 틀림
  pitch: number; // degrees, 양수 = 위를 봄
}

// MediaPipe FaceLandmarker 478-point landmark indices
// 참고: https://developers.google.com/mediapipe/solutions/vision/face_landmarker
const LM = {
  // 눈 외곽
  R_EYE_OUTER:  33,   // 우안 외측
  R_EYE_INNER: 133,   // 우안 내측
  L_EYE_INNER: 362,   // 좌안 내측
  L_EYE_OUTER: 263,   // 좌안 외측
  // 코끝
  NOSE_TIP:       4,
  // 턱끝
  CHIN:         152,
  // 이마
  FOREHEAD:      10,
  // 입 꼬리
  MOUTH_L:       61,
  MOUTH_R:      291,
  // 홍채 (FaceLandmarker outputFaceBlendshapes 켜면 인덱스 468~477이 iris)
  R_IRIS_CENTER: 468,  // 우안 홍채 중심
  L_IRIS_CENTER: 473,  // 좌안 홍채 중심
};

const DEG = 180 / Math.PI;

/**
 * landmarks에서 yaw / pitch 추정.
 * 기하학적 비율 기반 — 별도 모델 불필요.
 */
function estimateYawPitch(lm: Landmark[]): { yaw: number; pitch: number } {
  if (lm.length < 468) return { yaw: 0, pitch: 0 };

  const rOuter = lm[LM.R_EYE_OUTER];
  const lOuter = lm[LM.L_EYE_OUTER];
  const noseTip = lm[LM.NOSE_TIP];
  const chin    = lm[LM.CHIN];
  const forehead = lm[LM.FOREHEAD];

  // 눈 중점 (좌우 대칭 기준)
  const eyeMidX = (rOuter.x + lOuter.x) / 2;
  const eyeMidY = (rOuter.y + lOuter.y) / 2;

  // 인터아이 거리 (정규화 기준)
  const eyeSpan = Math.hypot(lOuter.x - rOuter.x, lOuter.y - rOuter.y);
  if (eyeSpan < 1e-6) return { yaw: 0, pitch: 0 };

  // yaw: 코끝이 눈 중점에서 좌우로 얼마나 벗어났는지
  const noseLateralOffset = (noseTip.x - eyeMidX) / eyeSpan;
  const yaw = noseLateralOffset * 120; // 경험적 스케일링 (1.0 offset ≒ 120°)

  // pitch: 얼굴 세로 비율
  const faceH = Math.hypot(forehead.x - chin.x, forehead.y - chin.y);
  const noseVerticalRatio = (noseTip.y - eyeMidY) / (faceH > 1e-6 ? faceH : 1);
  // 정면 응시 시 약 0.35~0.45 범위
  const pitch = (noseVerticalRatio - 0.40) * 200; // ≈ 0 at 0.40

  return { yaw: yaw * DEG * 0.01, pitch: pitch * DEG * 0.01 };
}

/**
 * 홍채 중심이 눈 중앙에서 얼마나 벗어났는지 (0~1 정규화).
 * iris landmark(468~477)가 없으면 null 반환.
 */
function estimateIrisOffset(
  lm: Landmark[]
): { x: number; y: number } | null {
  if (lm.length < 478) return null;

  const rIris = lm[LM.R_IRIS_CENTER];
  const rOuter = lm[LM.R_EYE_OUTER];
  const rInner = lm[LM.R_EYE_INNER];
  const lIris = lm[LM.L_IRIS_CENTER];
  const lOuter = lm[LM.L_EYE_OUTER];
  const lInner = lm[LM.L_EYE_INNER];

  // 우안 홍채 오프셋
  const rEyeW = Math.hypot(rOuter.x - rInner.x, rOuter.y - rInner.y);
  const rEyeMidX = (rOuter.x + rInner.x) / 2;
  const rEyeMidY = (rOuter.y + rInner.y) / 2;
  const rOfsX = rEyeW > 1e-6 ? (rIris.x - rEyeMidX) / rEyeW : 0;
  const rOfsY = rEyeW > 1e-6 ? (rIris.y - rEyeMidY) / rEyeW : 0;

  // 좌안 홍채 오프셋
  const lEyeW = Math.hypot(lOuter.x - lInner.x, lOuter.y - lInner.y);
  const lEyeMidX = (lOuter.x + lInner.x) / 2;
  const lEyeMidY = (lOuter.y + lInner.y) / 2;
  const lOfsX = lEyeW > 1e-6 ? (lIris.x - lEyeMidX) / lEyeW : 0;
  const lOfsY = lEyeW > 1e-6 ? (lIris.y - lEyeMidY) / lEyeW : 0;

  return {
    x: (rOfsX + lOfsX) / 2,
    y: (rOfsY + lOfsY) / 2,
  };
}

/**
 * 주어진 얼굴 랜드마크에서 카메라 응시 여부를 판정한다.
 *
 * 판정 기준 (TECH_SPEC §3.8.2):
 *   gazeError = |irisOffset.x| + |irisOffset.y|*0.7 + |yaw|/30 + |pitch|/30
 *   gazeError < 0.4 AND |yaw| < 15° AND |pitch| < 12° → isLookingAtCamera = true
 *
 * iris landmark 없으면 yaw/pitch만으로 판정.
 */
export function estimateGaze(landmarks: Landmark[]): GazeResult {
  if (landmarks.length < 10) {
    return { isLookingAtCamera: false, gazeConfidence: 0, yaw: 0, pitch: 0 };
  }

  const { yaw, pitch } = estimateYawPitch(landmarks);
  const irisOfs = estimateIrisOffset(landmarks);

  let gazeError: number;

  if (irisOfs) {
    gazeError =
      Math.abs(irisOfs.x) +
      Math.abs(irisOfs.y) * 0.7 +
      Math.abs(yaw) / 30 +
      Math.abs(pitch) / 30;
  } else {
    // iris 없으면 yaw/pitch만으로 근사
    gazeError = Math.abs(yaw) / 20 + Math.abs(pitch) / 20;
  }

  const isLookingAtCamera =
    gazeError < 0.4 && Math.abs(yaw) < 15 && Math.abs(pitch) < 12;

  // confidence: gazeError가 작을수록 확신도 높음 (0~1 매핑)
  const gazeConfidence = Math.max(0, 1 - gazeError / 0.8);

  return { isLookingAtCamera, gazeConfidence, yaw, pitch };
}
