/**
 * eventTagger.ts
 * 폴더명 → EventTag 자동 매핑
 * 한국어/영어 키워드 패턴 매칭 → 신뢰도 점수 기반 best match 반환
 */

import type { EventTag } from "./types";

interface TagRule {
  tag: EventTag;
  patterns: RegExp[];
}

const RULES: TagRule[] = [
  {
    tag: "maternity",
    patterns: [
      /만삭|임산부|임신|pregnancy|maternity/i,
    ],
  },
  {
    tag: "newborn",
    patterns: [
      /신생아|뉴본|newborn|new[-_ ]?born/i,
    ],
  },
  {
    tag: "50days",
    patterns: [
      /50일|50_?day|오십일/i,
    ],
  },
  {
    tag: "100days",
    patterns: [
      /100일|백일|100_?day|baek[-_ ]?il/i,
    ],
  },
  {
    tag: "first_birthday",
    patterns: [
      /돌|돌잔치|첫돌|돌스냅|first[-_ ]?birth|first[-_ ]?year|dol/i,
    ],
  },
  {
    tag: "wedding",
    patterns: [
      /웨딩|결혼|본식|혼례|wedding|bridal/i,
    ],
  },
  {
    tag: "family",
    patterns: [
      /가족|패밀리|family|fam[-_ ]?shoot/i,
    ],
  },
  {
    tag: "pet_profile",
    patterns: [
      /강아지|고양이|반려|펫|pet|dog|cat|animal/i,
    ],
  },
  {
    tag: "travel",
    patterns: [
      /여행|travel|trip|vacation|tour/i,
    ],
  },
];

/**
 * 폴더명으로부터 EventTag를 추론합니다.
 * 매칭되는 규칙이 없으면 "other"를 반환합니다.
 */
export function inferEventTag(folderName: string): EventTag {
  const normalized = folderName.normalize("NFC");

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(normalized)) {
        return rule.tag;
      }
    }
  }
  return "other";
}

/** EventTag 한국어 라벨 */
export const EVENT_TAG_LABELS: Record<EventTag, string> = {
  maternity:      "만삭",
  newborn:        "신생아",
  "50days":       "50일",
  "100days":      "백일",
  first_birthday: "돌잔치",
  wedding:        "웨딩",
  family:         "가족",
  pet_profile:    "펫 프로필",
  travel:         "여행",
  other:          "기타",
};

export const ALL_EVENT_TAGS: EventTag[] = [
  "maternity", "newborn", "50days", "100days",
  "first_birthday", "wedding", "family", "pet_profile",
  "travel", "other",
];
