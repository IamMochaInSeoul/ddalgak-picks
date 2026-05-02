/**
 * SecondaryButton.tsx
 * F20 UX — DESIGN_DIRECTION §SecondaryButton
 * border-only, no fill, no scale. hover: border → accent.
 */
import type { ButtonHTMLAttributes } from "react";
import { useState } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  fullWidth?: boolean;
}

export default function SecondaryButton({
  children,
  fullWidth,
  disabled,
  style,
  onMouseEnter,
  onMouseLeave,
  ...rest
}: Props) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      {...rest}
      disabled={disabled}
      onMouseEnter={(e) => { setHovered(true); onMouseEnter?.(e); }}
      onMouseLeave={(e) => { setHovered(false); onMouseLeave?.(e); }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        height: 48,
        padding: "0 24px",
        width: fullWidth ? "100%" : undefined,
        background: "transparent",
        color: disabled
          ? "var(--text-disabled, #3a3a3a)"
          : hovered
          ? "var(--accent, #C9A961)"
          : "var(--text-secondary)",
        border: `1px solid ${
          disabled
            ? "var(--border)"
            : hovered
            ? "var(--accent, #C9A961)"
            : "var(--border-strong)"
        }`,
        borderRadius: "var(--radius-sm, 2px)",
        fontFamily: "var(--font-sans)",
        fontSize: 14,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "color var(--dur-fast, 0.15s), border-color var(--dur-fast, 0.15s)",
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
