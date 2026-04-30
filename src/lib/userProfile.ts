/**
 * userProfile.ts
 * localStorage 'ddalgak-profile' 에 사용자 프로필 저장/불러오기.
 * 서버 전송 없음. 브라우저 전용.
 */

const PROFILE_KEY = "ddalgak-profile";

export interface UserProfile {
  nickname: string | null;
  honorific: "님" | "씨" | null;   // 기본 '님'
  firstVisitAt: number;
  totalSessions: number;
  totalPhotosProcessed: number;
  totalPhotosSelected: number;
  preferredFlowMode: "A" | "B" | "C" | null;
  language: "ko" | "en";
  /** 닉네임 다음에 물어볼 시점 관리 (totalSessions 기준) */
  nicknameDeferredUntilSession?: number;
}

const DEFAULTS: UserProfile = {
  nickname: null,
  honorific: "님",
  firstVisitAt: Date.now(),
  totalSessions: 0,
  totalPhotosProcessed: 0,
  totalPhotosSelected: 0,
  preferredFlowMode: null,
  language: "ko",
};

export function loadProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return { ...DEFAULTS, firstVisitAt: Date.now() };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS, firstVisitAt: Date.now() };
  }
}

export function saveProfile(patch: Partial<UserProfile>): void {
  try {
    const current = loadProfile();
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    // localStorage 쓰기 실패 무시 (시크릿 모드 등)
  }
}

/**
 * 분석 완료 시 세션 통계 기록.
 * totalSessions++, totalPhotosProcessed, totalPhotosSelected 누적.
 */
export function recordSession(stats: {
  processed: number;
  selected: number;
  flow: "A" | "B" | "C";
}): void {
  const profile = loadProfile();
  saveProfile({
    totalSessions: profile.totalSessions + 1,
    totalPhotosProcessed: profile.totalPhotosProcessed + stats.processed,
    totalPhotosSelected: profile.totalPhotosSelected + stats.selected,
    preferredFlowMode: stats.flow,
  });
}

/**
 * 닉네임 캡처 모달을 지금 표시할지 판단.
 * - totalSessions === 2 시점에 처음 표시
 * - "다음에" 클릭 시 5세션 뒤로 미룸
 */
export function shouldShowNicknameModal(): boolean {
  const profile = loadProfile();
  if (profile.nickname) return false;                        // 이미 입력함
  const defer = profile.nicknameDeferredUntilSession ?? 2;
  return profile.totalSessions >= defer;
}

/** "다음에" 클릭 시 5세션 뒤로 미루기 */
export function deferNicknameModal(): void {
  const profile = loadProfile();
  saveProfile({ nicknameDeferredUntilSession: profile.totalSessions + 5 });
}
