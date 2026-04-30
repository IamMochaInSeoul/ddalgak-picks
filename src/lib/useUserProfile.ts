/**
 * useUserProfile.ts
 * UserProfile의 React reactive 훅.
 * localStorage 변경 시 window storage 이벤트로 다른 탭에도 반영.
 */

import { useState, useEffect, useCallback } from "react";
import { loadProfile, saveProfile, type UserProfile } from "./userProfile";

export function useUserProfile() {
  const [profile, setProfile] = useState<UserProfile>(() => loadProfile());

  // 같은 탭 내 변경 반영
  const refresh = useCallback(() => {
    setProfile(loadProfile());
  }, []);

  // 다른 탭 또는 외부 변경 감지
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "ddalgak-profile") refresh();
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [refresh]);

  const update = useCallback((patch: Partial<UserProfile>) => {
    saveProfile(patch);
    refresh();
  }, [refresh]);

  return { profile, update, refresh };
}
