import type { PhotoEntry, GroupScoreEntry, AnalysisWeights, PhotoScore } from "./types";
import { selectTopPhotosWithSceneDiversity } from "./scorer";

/**
 * 씬별 구간 샘플링 — 피드백 수집용 사진 목록 생성
 *
 * 각 씬에서:
 *   - 상위 2장 (AI가 선택한 사진 — 기준선 파악)
 *   - 경계선 1장 (점수 0.40~0.65, 미선택 — 학습 효과 최대)
 *   - 상위 제외 1장 (제외됐지만 점수 높은 사진 — 억울한 탈락 발견)
 *
 * 씬을 순환하며 인터리브해서 다양성 확보.
 */
export function sampleFeedbackPhotos(
  photos: Map<string, PhotoEntry>,
  groupScoresWithScene: GroupScoreEntry[],
  targetSamples = 50
): string[] {
  if (groupScoresWithScene.length === 0) return [];

  // 씬별 그룹핑
  const byScene = new Map<string, GroupScoreEntry[]>();
  for (const g of groupScoresWithScene) {
    if (!byScene.has(g.sceneId)) byScene.set(g.sceneId, []);
    byScene.get(g.sceneId)!.push(g);
  }

  const sceneIds = [...byScene.keys()];

  type Tier = "selected" | "borderline" | "excluded";
  const tiers: Record<Tier, string[]> = { selected: [], borderline: [], excluded: [] };

  for (const sid of sceneIds) {
    const sorted = [...byScene.get(sid)!].sort((a, b) => b.score - a.score);

    const selected   = sorted.filter(g => photos.get(g.photoId)?.isSelected);
    const notSelected = sorted.filter(g => !photos.get(g.photoId)?.isSelected);
    const borderline = notSelected.filter(g => g.score >= 0.40 && g.score <= 0.65);
    const excluded   = notSelected.filter(g => !borderline.includes(g));

    // 씬당 상위 2장 (선택된 사진)
    selected.slice(0, 2).forEach(g => tiers.selected.push(g.photoId));
    // 씬당 경계선 1장
    if (borderline.length > 0) tiers.borderline.push(borderline[0].photoId);
    // 씬당 제외 상위 1장
    if (excluded.length > 0) tiers.excluded.push(excluded[0].photoId);
  }

  // 인터리브: 선택 → 경계선 → 제외 순으로 섞어서 다양성 확보
  const merged: string[] = [];
  const maxLen = Math.max(tiers.selected.length, tiers.borderline.length, tiers.excluded.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < tiers.selected.length)   merged.push(tiers.selected[i]);
    if (i < tiers.borderline.length) merged.push(tiers.borderline[i]);
    if (i < tiers.excluded.length)   merged.push(tiers.excluded[i]);
  }

  // 중복 제거 후 목표 수만큼
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of merged) {
    if (!seen.has(id)) { seen.add(id); result.push(id); }
    if (result.length >= targetSamples) break;
  }
  return result;
}

/**
 * 피드백 기반 가중치 조정
 *
 * 방향 벡터 = mean(liked 성분) - mean(disliked 성분)
 * new_weights = normalize( clamp(current + direction × 학습률, min=0.05) )
 */
export function adjustWeightsFromFeedback(
  photos: Map<string, PhotoEntry>,
  feedbackEntries: Map<string, boolean>,
  currentWeights: AnalysisWeights
): AnalysisWeights {
  const liked: PhotoScore[] = [];
  const disliked: PhotoScore[] = [];

  for (const [photoId, isLiked] of feedbackEntries) {
    const photo = photos.get(photoId);
    if (!photo?.score || !("eyeOpen" in photo.score)) continue;
    const s = photo.score as PhotoScore;
    if (isLiked) liked.push(s);
    else disliked.push(s);
  }

  if (liked.length === 0 && disliked.length === 0) return currentWeights;

  const mean = (arr: PhotoScore[], key: keyof Omit<PhotoScore, "total">) =>
    arr.length === 0 ? 0.5 : arr.reduce((s, p) => s + p[key], 0) / arr.length;

  const dims = ["eyeOpen", "sharpness", "expression", "facing"] as const;
  const LEARNING_RATE = 0.3;
  const MIN_WEIGHT = 0.05;

  const raw: Record<string, number> = {};
  for (const dim of dims) {
    const direction = mean(liked, dim) - mean(disliked, dim);
    raw[dim] = Math.max(MIN_WEIGHT, currentWeights[dim] + direction * LEARNING_RATE);
  }

  const sum = Object.values(raw).reduce((s, v) => s + v, 0);
  return {
    eyeOpen:    raw.eyeOpen    / sum,
    sharpness:  raw.sharpness  / sum,
    expression: raw.expression / sum,
    facing:     raw.facing     / sum,
  };
}

/**
 * 새 가중치로 점수를 재계산해서 씬 다양성 선별 재실행
 * — AI 분석 재실행 없이 기존 PhotoEntry.score 성분 재활용
 */
export function reextractWithPreference(
  photos: Map<string, PhotoEntry>,
  groupScoresWithScene: GroupScoreEntry[],
  newWeights: AnalysisWeights,
  targetCount: number,
  maxPerGroup: number
): Set<string> {
  const recomputed = groupScoresWithScene.map((g) => {
    const score = photos.get(g.photoId)?.score;
    let newTotal = g.score;
    if (score && "eyeOpen" in score) {
      const s = score as PhotoScore;
      newTotal = Math.min(
        1,
        s.eyeOpen    * newWeights.eyeOpen +
        s.sharpness  * newWeights.sharpness +
        s.expression * newWeights.expression +
        s.facing     * newWeights.facing
      );
    }
    return { ...g, score: newTotal };
  });

  return selectTopPhotosWithSceneDiversity(recomputed, targetCount, maxPerGroup);
}

/** 피드백 완료까지 필요한 최소 장수 */
export const FEEDBACK_MIN = 20;
/** 권장 피드백 장수 */
export const FEEDBACK_RECOMMEND = 30;
