/**
 * UserAddress.tsx
 * 닉네임이 있으면 "민협님" / 없으면 fallback 렌더.
 * PERSONALIZATION_PLAN §4-2 컴포넌트.
 */

import { useUserProfile } from "../lib/useUserProfile";

interface UserAddressProps {
  /** 닉네임 없을 때 대체 문자열 */
  fallback?: string;
  /** true → "민협님, " (쉼표+공백) */
  withComma?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export default function UserAddress({
  fallback = "",
  withComma = false,
  className,
  style,
}: UserAddressProps) {
  const { profile } = useUserProfile();

  if (!profile.nickname) {
    return fallback ? <span className={className} style={style}>{fallback}</span> : null;
  }

  const honorific = profile.honorific ?? "님";
  const text = `${profile.nickname}${honorific}${withComma ? ", " : ""}`;

  return (
    <span className={className} style={style}>
      {text}
    </span>
  );
}
