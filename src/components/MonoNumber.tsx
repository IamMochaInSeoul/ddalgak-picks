/**
 * MonoNumber.tsx — 모노스페이스 숫자 표시 컴포넌트
 * DESIGN_DIRECTION.md §3-2, §6 Step 3
 *
 * 사용처: 진행률 %, 선택 장수, 총 장수, 가격 등
 * 효과: JetBrains Mono + tabular-nums → 숫자 정렬감 + 사진 전문툴 시그널
 */
import type { CSSProperties } from "react";

const fmt = new Intl.NumberFormat("ko-KR");

interface MonoNumberProps {
  /** 표시할 숫자 또는 이미 포맷된 문자열 */
  value: number | string;
  /** 숫자 뒤에 붙는 단위 (예: "%", "장") — 모노 폰트로 표시됨 */
  suffix?: string;
  /** 앞에 붙는 단위 (예: "₩") */
  prefix?: string;
  /** 숫자 포맷: 천단위 콤마 여부 (기본 true, 이미 문자열이면 무시) */
  format?: boolean;
  size?: number | string;
  color?: string;
  style?: CSSProperties;
}

export default function MonoNumber({
  value,
  suffix,
  prefix,
  format = true,
  size,
  color = "inherit",
  style,
}: MonoNumberProps) {
  const display =
    typeof value === "number" && format
      ? fmt.format(value)
      : String(value);

  return (
    <span
      style={{
        fontFamily:          "var(--font-mono)",
        fontVariantNumeric:  "tabular-nums",
        letterSpacing:       "0",
        fontSize:            size,
        color,
        ...style,
      }}
    >
      {prefix}{display}{suffix}
    </span>
  );
}
