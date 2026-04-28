import type {
  AnalysisWeights,
  PetWeights,
  PhotoScore,
  PetScore,
  DeductionCode,
  ConfidenceGrade,
} from "./types";

/** Calculate portrait (person) quality score from MediaPipe results */
export function calcPortraitScore(
  blendshapes: Record<string, number>,
  headYaw: number,
  headPitch: number,
  sharpness: number,
  weights: AnalysisWeights
): PhotoScore {
  // Eye openness: 1 - blink score (0 = wide open, 1 = fully closed)
  const blinkL = blendshapes["eyeBlinkLeft"] ?? 0;
  const blinkR = blendshapes["eyeBlinkRight"] ?? 0;
  const eyeOpen = 1 - (blinkL + blinkR) / 2;

  // Expression: smile score
  const smileL = blendshapes["mouthSmileLeft"] ?? 0;
  const smileR = blendshapes["mouthSmileRight"] ?? 0;
  const expression = (smileL + smileR) / 2;

  // Facing: penalize large head rotations
  const facing = Math.max(
    0,
    1 - Math.abs(headYaw) / 45 - Math.abs(headPitch) / 30
  );

  const total =
    eyeOpen * weights.eyeOpen +
    sharpness * weights.sharpness +
    expression * weights.expression +
    facing * weights.facing;

  return { eyeOpen, sharpness, expression, facing, total: Math.min(total, 1) };
}

/** Calculate deduction codes for portrait */
export function calcPortraitDeductions(
  score: PhotoScore,
  confidence: number
): DeductionCode[] {
  const codes: DeductionCode[] = [];
  if (score.eyeOpen < 0.4) codes.push("EYE_CLOSED");
  if (score.sharpness < 0.3) codes.push("BLUR");
  if (score.facing < 0.4) codes.push("SIDE_FACE");
  if (confidence < 0.6) codes.push("LOW_CONFIDENCE");
  return codes;
}

/** Calculate pet quality score from bounding box image region */
export function calcPetScore(
  sharpness: number,
  eyeRegionScore: number,
  bboxCenter: { x: number; y: number },
  imageSize: { w: number; h: number },
  weights: PetWeights
): PetScore {
  const cx = imageSize.w / 2;
  const cy = imageSize.h / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  const dist = Math.sqrt(
    (bboxCenter.x - cx) ** 2 + (bboxCenter.y - cy) ** 2
  );
  const position = Math.max(0, 1 - dist / maxDist);

  const total =
    sharpness * weights.sharpness +
    eyeRegionScore * weights.eyeEstimate +
    position * weights.position;

  return { sharpness, eyeEstimate: eyeRegionScore, position, total: Math.min(total, 1) };
}

/** Calculate pet deductions */
export function calcPetDeductions(score: PetScore): DeductionCode[] {
  const codes: DeductionCode[] = [];
  if (score.sharpness < 0.3) codes.push("BLUR");
  if (score.eyeEstimate < 0.3) codes.push("EYE_REGION_DARK");
  return codes;
}

/** Determine confidence grade based on top-two score spread */
export function calcGroupConfidence(
  scores: number[]
): ConfidenceGrade {
  if (scores.length === 0) return "LOW";
  const sorted = [...scores].sort((a, b) => b - a);
  const top = sorted[0];
  const second = sorted[1] ?? 0;
  const spread = top - second;

  if (top >= 0.75 && spread >= 0.15) return "HIGH";
  if (top >= 0.50 && spread >= 0.08) return "MEDIUM";
  return "LOW";
}

/**
 * 유사 그룹별 최대 허용 장수(maxPerGroup)를 지키면서 상위 N장 선별.
 * 전체 점수 내림차순으로 그리디 선택 — 같은 그룹에서 maxPerGroup 초과 시 스킵.
 */
export function selectTopPhotos(
  groupScores: { groupId: string; photoId: string; score: number }[],
  n: number,
  maxPerGroup = 2
): Map<string, string> {
  const sorted = [...groupScores].sort((a, b) => b.score - a.score);
  const result = new Map<string, string>();
  const countPerGroup = new Map<string, number>();

  for (const g of sorted) {
    if (result.size >= n) break;
    const cnt = countPerGroup.get(g.groupId) ?? 0;
    if (cnt >= maxPerGroup) continue;
    result.set(`${g.groupId}_${cnt}`, g.photoId);
    countPerGroup.set(g.groupId, cnt + 1);
  }

  return result;
}

/**
 * §3.5 — v3 final score (portrait mode).
 * Returns 0~100; heroBonus is additive raw points.
 */
export function calcFinalScoreV3(params: {
  eyeOpen: number;
  smileBalance: number;
  sharpness: number;
  expression: number;
  facing: number;
  composition: number;
  heroBonus?: number;
}): number {
  const base =
    params.eyeOpen      * 0.30 +
    params.smileBalance * 0.10 +
    params.sharpness    * 0.25 +
    params.expression   * 0.15 +
    params.facing       * 0.10 +
    params.composition  * 0.10;

  return Math.min(100, base * 100 + (params.heroBonus ?? 0));
}

/**
 * 씬(Scene) 다양성을 보장하면서 상위 N장 선별.
 *
 * 1. 씬별 사진 수 비례로 목표 할당량(quota) 배분
 * 2. 각 씬 내에서 점수 내림차순 greedy (maxPerGroup 제한)
 * 3. 미달 씬의 남은 자리를 전체 고득점 순으로 보충
 */
export function selectTopPhotosWithSceneDiversity(
  groupScores: { groupId: string; sceneId: string; photoId: string; score: number }[],
  n: number,
  maxPerGroup = 2
): Set<string> {
  // ① 씬별 사진 수 → 비례 할당량
  const sceneCount = new Map<string, number>();
  for (const g of groupScores) {
    sceneCount.set(g.sceneId, (sceneCount.get(g.sceneId) ?? 0) + 1);
  }
  const total = groupScores.length;
  const sceneIds = [...sceneCount.keys()];

  const sceneQuota = new Map<string, number>();
  let allocated = 0;
  for (const sid of sceneIds) {
    const q = Math.max(1, Math.round((sceneCount.get(sid)! / total) * n));
    sceneQuota.set(sid, q);
    allocated += q;
  }
  // 반올림 오차: 가장 큰 씬에서 보정
  const diff = n - allocated;
  if (diff !== 0 && sceneIds.length > 0) {
    const biggest = [...sceneCount.entries()].sort((a, b) => b[1] - a[1])[0][0];
    sceneQuota.set(biggest, (sceneQuota.get(biggest) ?? 0) + diff);
  }

  // ② 씬별 greedy 선택
  const selectedIds = new Set<string>();
  const countPerGroup = new Map<string, number>();

  for (const sid of sceneIds) {
    const quota = sceneQuota.get(sid) ?? 0;
    const scenePhotos = [...groupScores]
      .filter((g) => g.sceneId === sid)
      .sort((a, b) => b.score - a.score);

    let picked = 0;
    for (const g of scenePhotos) {
      if (picked >= quota) break;
      const cnt = countPerGroup.get(g.groupId) ?? 0;
      if (cnt >= maxPerGroup) continue;
      selectedIds.add(g.photoId);
      countPerGroup.set(g.groupId, cnt + 1);
      picked++;
    }
  }

  // ③ 할당량 미달 시 전체에서 보충
  if (selectedIds.size < n) {
    const remaining = [...groupScores]
      .filter((g) => !selectedIds.has(g.photoId))
      .sort((a, b) => b.score - a.score);

    for (const g of remaining) {
      if (selectedIds.size >= n) break;
      const cnt = countPerGroup.get(g.groupId) ?? 0;
      if (cnt >= maxPerGroup) continue;
      selectedIds.add(g.photoId);
      countPerGroup.set(g.groupId, cnt + 1);
    }
  }

  return selectedIds;
}
