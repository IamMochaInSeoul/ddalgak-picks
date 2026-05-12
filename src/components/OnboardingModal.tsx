/**
 * OnboardingModal.tsx — 첫 방문 1-step 환영 모달 (PHASE1_PLAN §3-2)
 *
 * - localStorage "ddalgak-onboarded-at" 미존재 시 첫 진입에서 노출
 * - 큐레이터 톤: 이모지·느낌표 0개
 * - 산세리프 800 (v0.5.2.1 §9-5 정책 — var(--font-sans), fontStyle: "normal")
 */
import { useState, useEffect } from "react";

const ONBOARDED_KEY = "ddalgak-onboarded-at";

export default function OnboardingModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(ONBOARDED_KEY)) {
      setOpen(true);
    }
  }, []);

  const dismiss = (permanent: boolean) => {
    if (permanent) localStorage.setItem(ONBOARDED_KEY, String(Date.now()));
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed", inset: 0, zIndex: 9500,
        background: "rgba(13, 15, 18, 0.92)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "var(--space-6)",
      }}
      onClick={() => dismiss(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 480, width: "100%",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-12) var(--space-8)",
        }}
      >
        <h2 style={{
          fontFamily: "var(--font-sans)",
          fontWeight: 800,
          fontStyle: "normal",
          fontSize: "var(--text-xl)",
          color: "var(--text-primary)",
          marginTop: 0, marginBottom: "var(--space-6)",
          letterSpacing: "var(--tracking-display)",
        }}>
          환영합니다.
        </h2>

        <ol style={{
          fontSize: "var(--text-md)",
          color: "var(--text-secondary)",
          lineHeight: "var(--leading-base)",
          paddingLeft: "var(--space-6)",
          marginBottom: "var(--space-12)",
        }}>
          <li>사진을 끌어다 놓으면</li>
          <li>흔들림·눈감음·중복을 먼저 골라내고</li>
          <li>베스트만 추려드립니다.</li>
        </ol>

        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--space-4)",
        }}>
          <button
            onClick={() => dismiss(true)}
            style={{
              padding: "14px",
              background: "transparent",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-sm)",
              fontFamily: "var(--font-sans)",
              fontStyle: "normal",
              fontSize: "var(--text-md)",
              cursor: "pointer",
              touchAction: "manipulation",
            }}
          >
            다시 보지 않기
          </button>
          <button
            onClick={() => dismiss(true)}
            style={{
              padding: "14px",
              background: "var(--accent)",
              color: "var(--bg-base)",
              border: "1px solid var(--accent)",
              borderRadius: "var(--radius-sm)",
              fontFamily: "var(--font-sans)",
              fontStyle: "normal",
              fontSize: "var(--text-md)",
              fontWeight: 500,
              cursor: "pointer",
              touchAction: "manipulation",
            }}
          >
            시작
          </button>
        </div>
      </div>
    </div>
  );
}
