/**
 * scoreBreakdown.ts — PhotoDetailModal NOTES 섹션용 점수 분해
 *
 * - 감점 코드(EYE_CLOSED, BLUR, SIDE_FACE, LOW_CONFIDENCE, EYE_SQUINT_SMILE,
 *   BLUR_AESTHETIC_BOKEH, BLUR_NOISE)를 NOTES 표 행으로 변환
 * - heroBonus(Stage C v0.5.0)도 가산점 행으로 표시
 * - finalScore는 0~100 정수
 */

import type { PhotoEntry, PhotoScore, PetScore, DeductionCode } from "./types";

export interface NotesPenalty {
  code: DeductionCode;
  label: string;    // "눈 감음"
  detail: string;   // "EAR 임계 미달"
  delta: number;    // -15 (감점)
}

export interface NotesBonus {
  code: string;
  label: string;    // "주인공 등장"
  detail: string;
  delta: number;    // +25
}

export interface ScoreBreakdown {
  finalScore: number;          // 0~100
  penalties: NotesPenalty[];
  bonuses: NotesBonus[];
  groupBestScore?: number;     // 같은 pHash 그룹 1위 점수 (있을 때만)
  groupBestPhotoId?: string;
  isPet: boolean;
}

const PENALTY_LABEL: Record<DeductionCode, { label: string; detail: string; delta: number }> = {
  EYE_CLOSED:           { label: "눈 감음",           detail: "EAR 임계 미달",                    delta: -15 },
  BLUR:                 { label: "선명도 부족",        detail: "얼굴 영역 Laplacian 낮음",          delta: -8  },
  SIDE_FACE:            { label: "측면",              detail: "정면 각도 미달",                    delta: -6  },
  EYE_REGION_DARK:      { label: "눈 주변 어두움",     detail: "눈 영역 추정 신뢰 낮음",            delta: -5  },
  LOW_CONFIDENCE:       { label: "감지 신뢰 낮음",    detail: "AI 인식 신뢰도 60% 미만",           delta: -3  },
  NO_SUBJECT:           { label: "피사체 미감지",     detail: "선명도 기준만으로 평가",             delta: 0   },
  EYE_SQUINT_SMILE:     { label: "활짝 웃음",         detail: "감점 없음 — 웃음으로 판정",         delta: 0   },
  BLUR_AESTHETIC_BOKEH: { label: "인물 아웃포커싱",   detail: "감점 없음 — 의도된 보케",           delta: 0   },
  BLUR_NOISE:           { label: "저조도 노이즈",     detail: "조명 부족",                        delta: -5  },
};

export function buildScoreBreakdown(
  photo: PhotoEntry,
  groupBestScore?: number,
  groupBestPhotoId?: string,
): ScoreBreakdown {
  const isPet = !!photo.score && "position" in photo.score;
  const finalScore = Math.round((photo.score?.total ?? 0) * 100);

  const penalties: NotesPenalty[] = (photo.deductions ?? []).map((code) => {
    const meta = PENALTY_LABEL[code];
    return {
      code,
      label:  meta?.label  ?? code,
      detail: meta?.detail ?? "",
      delta:  meta?.delta  ?? 0,
    };
  });

  const bonuses: NotesBonus[] = [];

  // heroBonus (Stage C v0.5.0) — heroMatchKind: "all" | "any" | "none" | "non_hero_guaranteed"
  const heroBonus      = photo.heroBonus;
  const heroMatchKind  = photo.heroMatchKind;
  if (typeof heroBonus === "number" && heroBonus !== 0) {
    bonuses.push({
      code:   "hero",
      label:  heroBonus > 0 ? "주인공 등장" : "주인공 미등장",
      detail: heroMatchKind === "all"  ? "선택한 인물 모두 등장"
            : heroMatchKind === "any"  ? "선택한 인물 한 명 등장"
            : heroMatchKind === "none" ? "주인공 미등장"
            : "비주인공 보장 슬롯",
      delta: heroBonus,
    });
  }

  return {
    finalScore,
    penalties,
    bonuses,
    groupBestScore,
    groupBestPhotoId,
    isPet,
  };
}

// 항목별 점수 바 (v0.5.4에서 UI에 추가 예정)
export interface PortraitScoreDetail {
  kind: "portrait";
  eyeOpen: number;
  sharpness: number;
  expression: number;
  facing: number;
}

export interface PetScoreDetail {
  kind: "pet";
  sharpness: number;
  eyeEstimate: number;
  position: number;
}

export type ScoreDetail = PortraitScoreDetail | PetScoreDetail | null;

export function getScoreDetail(photo: PhotoEntry): ScoreDetail {
  if (!photo.score) return null;
  if ("position" in photo.score) {
    const s = photo.score as PetScore;
    return { kind: "pet", sharpness: s.sharpness, eyeEstimate: s.eyeEstimate, position: s.position };
  }
  const s = photo.score as PhotoScore;
  return { kind: "portrait", eyeOpen: s.eyeOpen, sharpness: s.sharpness, expression: s.expression, facing: s.facing };
}
