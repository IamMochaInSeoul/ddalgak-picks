/**
 * ReturningBanner.tsx — 재방문 배너 + 단골 인지 (PERSONALIZATION §4-2, §4-5)
 *
 * - 닉네임 없으면 배너 숨김
 * - totalSessions 기반 인사말 4단계
 * - 미완료 세션 있으면 이어서 하기 안내
 * - §9-5: var(--font-sans), fontStyle: "normal"
 */
import { useEffect, useState } from "react";
import { loadProfile } from "../lib/userProfile";
import { listFolderSessions } from "../lib/opfsStore";

interface UserProfile {
  nickname?: string | null;
  totalSessions?: number;
}

function getGreeting(profile: UserProfile, hasPendingSession: boolean): string {
  if (hasPendingSession) {
    return profile.nickname
      ? `${profile.nickname}님, 미완료 세션이 있습니다. 이어서 하시겠습니까?`
      : "미완료 세션이 있습니다. 이어서 하시겠습니까?";
  }

  const n = profile.totalSessions ?? 0;
  if (!profile.nickname) return "";
  if (n === 1) return `${profile.nickname}님, 다시 오셨네요.`;
  if (n < 5)  return `${profile.nickname}님, ${n + 1}번째 셀렉입니다.`;
  if (n < 20) return `${profile.nickname}님의 누적 셀렉 ${n}회.`;
  return `${profile.nickname}님, 꾸준히 와주시는군요. 누적 ${n}회.`;
}

export default function ReturningBanner() {
  const [greeting, setGreeting] = useState("");

  useEffect(() => {
    (async () => {
      const profile = loadProfile();
      const sessions = await listFolderSessions().catch(() => []);
      const inMemoryCount = 0; // 랜딩에서는 아직 메모리 세션 없음
      const hasPending = sessions.length > inMemoryCount;
      setGreeting(getGreeting(profile, hasPending));
    })();
  }, []);

  if (!greeting) return null;

  return (
    <div style={{
      width: "100%", maxWidth: 700,
      padding: "12px 24px",
      margin: "16px 20px 0",
      fontSize: "var(--text-sm)",
      color: "var(--text-secondary)",
      fontFamily: "var(--font-sans)",
      fontStyle: "normal",
      borderTop: "1px solid var(--border-subtle)",
    }}>
      {greeting}
    </div>
  );
}
