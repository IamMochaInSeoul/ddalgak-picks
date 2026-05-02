/**
 * recommendedCount.ts
 * F3 -- 폴더별 목표 장수 추천
 * PHASE1_PLAN §7-3
 */
import type { EventTag } from "./types";

// Event tag -> default recommended count
export const RECOMMENDED_COUNTS: Record<EventTag | "other", number> = {
  maternity:      10,
  newborn:        15,
  "50days":       15,
  "100days":      30,
  first_birthday: 50,
  wedding:        80,
  family:         20,
  pet_profile:    30,
  travel:         40,
  other:          30,
};

// Studio presets
export interface AlbumPreset {
  label: string;
  counts: Partial<Record<EventTag | "other", number>>;
}

export const STUDIO_PRESETS: AlbumPreset[] = [
  {
    label: "표준 앨범 (100컷)",
    counts: {
      newborn:        20,
      "50days":       20,
      "100days":      30,
      first_birthday: 30,
    },
  },
  {
    label: "프리미엄 앨범 (160컷)",
    counts: {
      newborn:        30,
      "50days":       30,
      "100days":      50,
      first_birthday: 50,
    },
  },
  {
    label: "웨딩 기본 (120컷)",
    counts: {
      wedding: 120,
    },
  },
];

/**
 * Returns recommended count for a given event tag.
 * Falls back to "other" default when tag is absent or unknown.
 */
export function getRecommendedCount(tag: EventTag | string | undefined): number {
  if (!tag) return RECOMMENDED_COUNTS.other;
  return (RECOMMENDED_COUNTS as Record<string, number>)[tag] ?? RECOMMENDED_COUNTS.other;
}
