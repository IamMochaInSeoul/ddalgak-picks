/**
 * TextLink.tsx
 * F20 UX — DESIGN_DIRECTION §TextLink
 * text-secondary, underline on hover.
 */
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import { useState } from "react";

type AsButton = ButtonHTMLAttributes<HTMLButtonElement> & { as?: "button" };
type AsAnchor = AnchorHTMLAttributes<HTMLAnchorElement> & { as: "a" };
type Props = (AsButton | AsAnchor) & { disabled?: boolean };

export default function TextLink({ children, disabled, style, ...rest }: Props) {
  const [hovered, setHovered] = useState(false);

  const baseStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    padding: 0,
    fontFamily: "var(--font-sans)",
    fontSize: "inherit",
    fontWeight: 500,
    color: disabled ? "var(--text-disabled)" : "var(--text-secondary)",
    cursor: disabled ? "not-allowed" : "pointer",
    textDecoration: hovered && !disabled ? "underline" : "none",
    textUnderlineOffset: 3,
    transition: "color var(--dur-fast, 0.15s)",
    opacity: disabled ? 0.5 : 1,
    ...style,
  };

  if ((rest as AsAnchor).as === "a") {
    const { as: _as, ...anchorRest } = rest as AsAnchor;
    return (
      <a
        {...anchorRest}
        style={baseStyle as React.CSSProperties}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {children}
      </a>
    );
  }

  const { as: _as, ...btnRest } = rest as AsButton;
  return (
    <button
      {...btnRest}
      disabled={disabled}
      style={baseStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </button>
  );
}
