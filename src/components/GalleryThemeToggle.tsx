/**
 * GalleryThemeToggle — v2.2 §4-3 / §7-3
 *
 * 갤러리에 한정해 라이트/다크 모드 토글을 노출한다.
 * 디폴트는 라이트. 사용자가 다크 선택 시 localStorage("galleryTheme") = "dark"
 *
 * 부모(Gallery/FolderGallery)는 `<div data-theme={theme}>...</div>`로 감싸기만 하면
 * tokens.css의 [data-theme="dark"] 셀렉터가 surface·text·border를 다크 셋으로 덮어쓴다.
 */

import { useEffect, useState } from "react";

export type GalleryTheme = "light" | "dark";

const KEY = "galleryTheme";

export function useGalleryTheme(): [GalleryTheme, (t: GalleryTheme) => void] {
  const [theme, setThemeState] = useState<GalleryTheme>("light");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "dark" || saved === "light") {
        setThemeState(saved);
      }
    } catch {
      /* localStorage 비활성 환경은 라이트 유지 */
    }
  }, []);

  const setTheme = (next: GalleryTheme) => {
    setThemeState(next);
    try { localStorage.setItem(KEY, next); } catch { /* noop */ }
  };

  return [theme, setTheme];
}

export default function GalleryThemeToggle({
  theme, onChange,
}: {
  theme: GalleryTheme;
  onChange: (t: GalleryTheme) => void;
}) {
  const isDark = theme === "dark";
  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: "4px 10px",
    fontSize: "var(--text-2xs)",
    fontFamily: "var(--font-mono)",
    letterSpacing: "var(--tracking-uppercase)",
    textTransform: "uppercase",
    background: active ? "var(--accent)" : "transparent",
    color: active ? "var(--text-on-accent)" : "var(--text-secondary)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-sm)",
    cursor: active ? "default" : "pointer",
    transition: "background-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)",
  });

  return (
    <div
      role="group"
      aria-label="갤러리 테마"
      style={{
        display: "inline-flex",
        gap: 4,
        padding: 3,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <button
        type="button"
        style={btnStyle(!isDark)}
        onClick={() => onChange("light")}
        aria-pressed={!isDark}
        title="라이트"
      >
        라이트
      </button>
      <button
        type="button"
        style={btnStyle(isDark)}
        onClick={() => onChange("dark")}
        aria-pressed={isDark}
        title="다크"
      >
        다크
      </button>
    </div>
  );
}
