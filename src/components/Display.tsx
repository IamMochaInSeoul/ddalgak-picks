/**
 * Display.tsx — 세리프 디스플레이 헤드라인 컴포넌트
 * DESIGN_DIRECTION.md §3-2, §6 Step 3
 *
 * 사용처: 화면 헤더·랜딩 메인 카피·갤러리 카운터 한 줄 요약 등
 * 어디나 쓰면 무겁다 — 화면당 1~2곳에만 적용.
 */
import type { CSSProperties, ElementType, ReactNode } from "react";

type DisplaySize = "xl" | "1" | "2";

const SIZE_MAP: Record<DisplaySize, { fontSize: string; lineHeight: number }> = {
  "xl": { fontSize: "var(--text-xl)",   lineHeight: 1.15 },  // 36px — 섹션 헤드
  "1":  { fontSize: "var(--display-1)", lineHeight: 1.1  },  // 56px — 랜딩 메인
  "2":  { fontSize: "var(--display-2)", lineHeight: 1.0  },  // 80px — 갤러리 카운터
};

interface DisplayProps {
  as?: ElementType;
  size?: DisplaySize;
  italic?: boolean;
  color?: string;
  style?: CSSProperties;
  className?: string;
  children: ReactNode;
}

export default function Display({
  as: Tag = "h1",
  size = "1",
  italic = false,
  color = "var(--text-primary)",
  style,
  className,
  children,
}: DisplayProps) {
  const { fontSize, lineHeight } = SIZE_MAP[size];

  return (
    <Tag
      className={className}
      style={{
        fontFamily:     "var(--font-sans)",       // 산세리프 (Pretendard) 통일
        fontSize,
        lineHeight,
        letterSpacing:  "var(--tracking-display)",
        /* italic prop: 한글 디스플레이는 italic 어색하므로 fontStyle은 normal 유지.
           가벼운 톤은 fontWeight 800→600으로만 표현. */
        fontWeight:     italic ? 600 : 800,        // 굵게 통일 (한글 가독성)
        fontStyle:      "normal",                  // 한글 italic 어색 — 강제 normal
        color,
        margin:         0,
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}
