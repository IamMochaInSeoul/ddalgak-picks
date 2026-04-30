/**
 * PrimaryButton.tsx
 * F20 UX — DESIGN_DIRECTION §PrimaryButton
 * 화면당 1개 원칙. 56px 높이, accent gold, radius 2px, 그림자 없음.
 */
import type { ButtonHTMLAttributes } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 전체 너비 (기본: auto) */
  fullWidth?: boolean;
  /** 로딩 상태 */
  loading?: boolean;
}

export default function PrimaryButton({
  children,
  fullWidth,
  loading,
  disabled,
  style,
  ...rest
}: Props) {
  const isDisabled = disabled || loading;

  return (
    <button
      {...rest}
      disabled={isDisabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        height: 56,
        padding: "0 32px",
        width: fullWidth ? "100%" : undefined,
        background: isDisabled ? "var(--text-disabled, #3a3a3a)" : "var(--accent, #C9A961)",
        color: isDisabled ? "var(--text-tertiary, #666)" : "#0E0D0B",
        border: "none",
        borderRadius: "var(--radius-sm, 2px)",
        fontFamily: "var(--font-sans)",
        fontSize: 15,
        fontWeight: 700,
        letterSpacing: "0.01em",
        cursor: isDisabled ? "not-allowed" : "pointer",
        boxShadow: "none",
        transition: "background var(--dur-fast, 0.15s), opacity var(--dur-fast, 0.15s)",
        opacity: isDisabled ? 0.55 : 1,
        ...style,
      }}
    >
      {loading ? (
        <>
          <span style={{
            display: "inline-block",
            width: 16, height: 16,
            border: "2px solid rgba(14,13,11,0.3)",
            borderTopColor: "#0E0D0B",
            borderRadius: "50%",
            animation: "pbtn-spin 0.7s linear infinite",
          }} />
          {children}
        </>
      ) : children}

      <style>{`
        @keyframes pbtn-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </button>
  );
}
