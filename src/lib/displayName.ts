import type { PhotoEntry, PhotoType } from "./types";

const TYPE_PREFIX: Record<NonNullable<PhotoType>, string> = {
  portrait: "픽스",
  pet:      "반려",
  mixed:    "픽스",
};

const MOOD_WORDS = [
  "빛나는", "따뜻한", "눈부신", "사랑스러운", "소중한",
  "반짝이는", "포근한", "행복한", "특별한", "설레는",
  "순수한", "아름다운", "즐거운", "꿈같은", "찬란한",
];

const MOMENT_WORDS = [
  "순간", "기억", "장면", "하루", "웃음",
  "시간", "이야기", "풍경", "모습", "표정",
];

function pickWord<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

// 파일명에서 숫자 시퀀스 추출 (DSC_0042 → 42)
function extractSeq(filename: string): number {
  const m = filename.match(/(\d+)/g);
  if (!m) return 0;
  return parseInt(m[m.length - 1], 10);
}

/**
 * 선택된 사진들에 감성적인 displayName을 순서대로 할당.
 * 기존 displayName이 있으면 덮어쓰지 않음.
 */
export function assignDisplayNames(
  photos: Map<string, PhotoEntry>,
  photoType: PhotoType | null,
): Map<string, PhotoEntry> {
  const prefix = TYPE_PREFIX[photoType ?? "mixed"] ?? "픽스";
  const selected = [...photos.values()]
    .filter((p) => p.isSelected)
    .sort((a, b) => extractSeq(a.file?.name ?? "") - extractSeq(b.file?.name ?? ""));

  const result = new Map(photos);
  selected.forEach((photo, idx) => {
    if (result.get(photo.id)?.displayName) return; // 이미 있으면 유지
    const seed = idx + extractSeq(photo.file?.name ?? "");
    const mood = pickWord(MOOD_WORDS, seed + idx * 7);
    const moment = pickWord(MOMENT_WORDS, seed + idx * 13);
    const num = String(idx + 1).padStart(3, "0");
    const ext = (photo.file?.name ?? "photo.jpg").split(".").pop() ?? "jpg";
    const displayName = `${prefix}-${num} ${mood} ${moment}.${ext}`;
    result.set(photo.id, { ...result.get(photo.id)!, displayName });
  });
  return result;
}

/** ZIP 저장 시 사용할 파일명: displayName 있으면 사용, 없으면 원본 */
export function zipFilename(photo: PhotoEntry, watermarked = false): string {
  const name = photo.displayName ?? photo.file?.name ?? `photo_${photo.id}`;
  if (watermarked) {
    const base = name.replace(/\.[^.]+$/, "");
    return `${base}_wm.jpg`;
  }
  return name;
}
