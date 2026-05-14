/**
 * GroupCompareModal.tsx
 * F5 -- 유사컷 그룹 비교 모달
 * PHASE1_PLAN §7-5 / PERSONALIZATION_PLAN §profile groupCompare
 *
 * 같은 그룹의 모든 컷을 격자로 표시.
 * 클릭하면 해당 컷을 그룹의 베스트로 교체.
 */
import { useCallback, useEffect, useRef } from "react";
import type { PhotoEntry, PhotoGroup } from "../lib/types";

interface Props {
  /** The group being compared */
  group: PhotoGroup;
  /** All photos in the session/gallery */
  photos: Map<string, PhotoEntry>;
  /** Swap the group best-shot */
  onSwap: (groupId: string, photoId: string) => void;
  /** Close the modal */
  onClose: () => void;
}

export default function GroupCompareModal({ group, photos, onSwap, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Close on overlay click
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  }, [onClose]);

  const groupPhotos = group.photoIds
    .map((id) => photos.get(id))
    .filter((p): p is PhotoEntry => p != null);

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(14,13,11,0.88)",
        backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px",
      }}
    >
      <div style={{
        background: "var(--bg-elevated, var(--bg2))",
        border: "1px solid var(--border-strong, var(--border))",
        borderRadius: "var(--radius-lg, 16px)",
        padding: "28px 24px",
        maxWidth: 640, width: "100%",
        maxHeight: "90vh", overflow: "auto",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 20,
        }}>
          <div>
            <div style={{
              fontFamily: "var(--font-sans)",
              fontSize: 17, fontWeight: 800,
              color: "var(--text-primary)",
              marginBottom: 4,
            }}>
              유사 컷 비교
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {groupPhotos.length}장 — 클릭하면 해당 컷을 베스트로 교체합니다
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text-secondary)", fontSize: 20, lineHeight: 1,
              padding: "4px 8px",
            }}
          >✕</button>
        </div>

        {/* Grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 12,
        }}>
          {groupPhotos.map((photo) => {
            const isBest = photo.id === group.selectedId || photo.isSelected;
            const score  = photo.score ? Math.round(photo.score.total * 100) : null;
            const imgSrc = photo.thumbnail ?? (photo.file ? URL.createObjectURL(photo.file) : null);

            return (
              <div
                key={photo.id}
                onClick={() => { onSwap(group.id, photo.id); onClose(); }}
                style={{
                  position: "relative",
                  cursor: "pointer",
                  borderRadius: "var(--radius-md)", 
                  border: isBest
                    ? "2px solid var(--accent)"
                    : "2px solid var(--border)",
                  overflow: "hidden",
                  background: "var(--bg-elevated)",
                  transition: "border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "var(--accent)";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-sm)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "";
                  (e.currentTarget as HTMLDivElement).style.borderColor =
                    isBest ? "var(--accent)" : "var(--border-subtle)";
                }}
              >
                {/* Thumbnail */}
                <div style={{ aspectRatio: "4/3", overflow: "hidden", background: "var(--bg3, #1a1a1a)" }}>
                  {imgSrc ? (
                    <img
                      src={imgSrc}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <div style={{
                      width: "100%", height: "100%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 28, color: "var(--text-tertiary)",
                    }}>
                      —
                    </div>
                  )}
                </div>

                {/* Best badge */}
                {isBest && (
                  <div style={{
                    position: "absolute", top: 6, left: 6,
                    background: "var(--accent)",
                    color: "#0E0D0B",
                    fontSize: 10, fontWeight: 800,
                    padding: "2px 7px", borderRadius: 4,
                    letterSpacing: "0.04em",
                  }}>
                    현재 베스트
                  </div>
                )}

                {/* Score */}
                {score !== null && (
                  <div style={{
                    position: "absolute", bottom: 6, right: 6,
                    background: "rgba(14,13,11,0.78)",
                    color: "#fff",
                    fontSize: 11, fontWeight: 700,
                    padding: "2px 6px", borderRadius: 4,
                    fontFamily: "var(--font-mono)",
                  }}>
                    {score}
                  </div>
                )}

                {/* Deduction badges */}
                {photo.deductions && photo.deductions.length > 0 && (
                  <div style={{
                    position: "absolute", bottom: 6, left: 6,
                    display: "flex", gap: 3, flexWrap: "wrap", maxWidth: "70%",
                  }}>
                    {photo.deductions.slice(0, 2).map((d) => (
                      <span key={d} style={{
                        fontSize: 9, padding: "1px 4px", borderRadius: "var(--radius-sm)",
                        background: "rgba(239,68,68,0.85)", color: "#fff",
                        fontWeight: 600,
                      }}>
                        {DEDUCTION_SHORT[d] ?? d}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 20, paddingTop: 16,
          borderTop: "1px solid var(--border)",
          fontSize: 12, color: "var(--text-tertiary)",
          textAlign: "center",
        }}>
          같은 그룹 내 사진끼리 비교합니다. 선택하면 모달이 닫힙니다.
        </div>
      </div>
    </div>
  );
}

const DEDUCTION_SHORT: Record<string, string> = {
  EYE_CLOSED:           "눈감음",
  BLUR:                 "흔들",
  SIDE_FACE:            "측면",
  EYE_REGION_DARK:      "어둠",
  LOW_CONFIDENCE:       "불확실",
  NO_SUBJECT:           "미감지",
  EYE_SQUINT_SMILE:     "웃음",
  BLUR_AESTHETIC_BOKEH: "보케",
  BLUR_NOISE:           "노이즈",
};
