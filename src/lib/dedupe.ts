/**
 * dedupe.ts — 중복 제거: 과거 세션과 pHash 비교
 *
 * - hammingDistance: 두 bigint pHash 간 bit 차이 수
 * - findPastDupes: PhotoEntry 배열 vs 과거 지문 목록 → 중복 매핑 반환
 *
 * 임계값(threshold) 기본값 8: Hamming≤8 이면 "같은 사진에 가까움"으로 판정
 */

import type { PhotoEntry } from "./types";
import type { PastHashRecord } from "./pastSelectionStore";

// ── Hamming 거리 ────────────────────────────────────────────────────────────
export function hammingDistance(a: bigint, b: bigint): number {
  let xor = a ^ b;
  let count = 0;
  while (xor !== 0n) {
    count += Number(xor & 1n);
    xor >>= 1n;
  }
  return count;
}

// ── 중복 정보 ──────────────────────────────────────────────────────────────
export interface DupeMatch {
  matchedFilename: string;
  matchedSessionId: string;
  distance: number;
}

/**
 * 현재 사진 배열에서 과거 지문과 Hamming≤threshold 인 것을 찾아 반환한다.
 *
 * @returns Map<photoId, DupeMatch>  — 중복으로 판정된 사진만 포함
 */
export function findPastDupes(
  photos: PhotoEntry[],
  pastRecords: PastHashRecord[],
  threshold = 8
): Map<string, DupeMatch> {
  const result = new Map<string, DupeMatch>();
  if (pastRecords.length === 0) return result;

  // BigInt 파싱은 한 번만
  const parsed = pastRecords.map((r) => ({
    hash: BigInt(r.hash),
    filename: r.filename,
    sessionId: r.sessionId,
  }));

  for (const photo of photos) {
    // hash가 0n인 경우(계산 실패)는 스킵
    if (!photo.hash || photo.hash === 0n) continue;

    let best: DupeMatch | null = null;
    for (const past of parsed) {
      const d = hammingDistance(photo.hash, past.hash);
      if (d <= threshold) {
        if (!best || d < best.distance) {
          best = {
            matchedFilename: past.filename,
            matchedSessionId: past.sessionId,
            distance: d,
          };
        }
      }
    }
    if (best) {
      result.set(photo.id, best);
    }
  }

  return result;
}
