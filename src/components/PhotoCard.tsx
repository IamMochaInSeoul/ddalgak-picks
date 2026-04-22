
import { useRef, useEffect } from "react";
import type { PhotoEntry } from "../lib/types";

interface Props {
  photo: PhotoEntry;
  compact?: boolean;
  onDoubleClick?: (photoId: string) => void;  // 단일 클릭으로 동작
  onContextMenu?: (e: React.MouseEvent, photoId: string) => void;
}

const DEDUCTION_COLORS: Record<string, string> = {
  EYE_CLOSED: "#ef4444",
  BLUR: "#f59e0b",
  SIDE_FACE: "#8b5cf6",
  EYE_REGION_DARK: "#f97316",
  LOW_CONFIDENCE: "#6b7280",
  NO_SUBJECT: "#3b82f6",  // 파란색 (정보성 태그 — 오류가 아님)
};

const DEDUCTION_LABELS: Record<string, { ko: string; en: string }> = {
  EYE_CLOSED: { ko: "눈감음", en: "Eyes Closed" },
  BLUR: { ko: "흔들림", en: "Blurry" },
  SIDE_FACE: { ko: "측면", en: "Side Face" },
  EYE_REGION_DARK: { ko: "눈감음(추정)", en: "Possibly Closed" },
  LOW_CONFIDENCE: { ko: "감지불확실", en: "Low Confidence" },
  NO_SUBJECT: { ko: "인물미감지", en: "No Face" },
};

export default function PhotoCard({ photo, compact = false, onDoubleClick, onContextMenu }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = compact ? 140 : 180;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const img = new Image();
    img.src = photo.thumbnail;
    img.onload = () => {
      canvas.width = size;
      canvas.height = size;

      // Draw image (cropped to square)
      const aspect = img.width / img.height;
      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (aspect > 1) {
        sw = img.height;
        sx = (img.width - sw) / 2;
      } else {
        sh = img.width;
        sy = (img.height - sh) / 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);

      // Overlay for deductions (blur = orange border tint)
      if (photo.deductions.includes("BLUR")) {
        ctx.strokeStyle = "rgba(245,158,11,0.7)";
        ctx.lineWidth = 3;
        ctx.strokeRect(2, 2, size - 4, size - 4);
      }

      // NO_SUBJECT는 예술적 포즈 가능성 — 어두운 오버레이 없앰

      // Score bar at bottom
      const score = photo.score?.total ?? 0;
      const barW = Math.round(size * score);
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, size - 18, size, 18);
      ctx.fillStyle = score >= 0.7 ? "#22c55e" : score >= 0.4 ? "#f59e0b" : "#ef4444";
      ctx.fillRect(0, size - 18, barW, 18);
      ctx.fillStyle = "white";
      ctx.font = `bold ${compact ? 10 : 11}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(`${Math.round(score * 100)}`, size / 2, size - 4);
    };
  }, [photo.thumbnail, photo.deductions, photo.score, size]);

  const scoreNum = Math.round((photo.score?.total ?? 0) * 100);

  return (
    <div
      onClick={() => onDoubleClick?.(photo.id)}
      onContextMenu={(e) => { if (onContextMenu) { e.preventDefault(); onContextMenu(e, photo.id); } }}
      style={{
        borderRadius: 8,
        overflow: "hidden",
        border: `2px solid ${photo.isSelected ? "var(--accent)" : "var(--border)"}`,
        position: "relative",
        background: "var(--bg3)",
        transition: "border-color 0.15s, transform 0.1s",
        cursor: onDoubleClick ? "pointer" : "default",
      }}
    >
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", aspectRatio: "1" }} />

      {/* Selection indicator */}
      {photo.isSelected && (
        <div
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "var(--accent)",
            color: "white",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
          }}
        >
          ✓
        </div>
      )}

      {/* Deduction badges */}
      {photo.deductions.length > 0 && !compact && (
        <div
          style={{
            position: "absolute",
            bottom: 22,
            left: 4,
            display: "flex",
            gap: 3,
            flexWrap: "wrap",
          }}
        >
          {photo.deductions.slice(0, 2).map((d) => (
            <span
              key={d}
              style={{
                background: "rgba(0,0,0,0.75)",
                border: `1px solid ${DEDUCTION_COLORS[d] ?? "#666"}`,
                color: DEDUCTION_COLORS[d] ?? "#999",
                fontSize: 9,
                padding: "1px 5px",
                borderRadius: 3,
                fontWeight: 600,
              }}
            >
              {DEDUCTION_LABELS[d]?.ko ?? d}
            </span>
          ))}
        </div>
      )}

      {/* Score label when not compact — 파일명 미표시 */}
      {!compact && (
        <div
          style={{
            padding: "4px 8px",
            fontSize: 11,
            color: "var(--text2)",
            background: "var(--bg2)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <span style={{ color: scoreNum >= 70 ? "var(--high)" : scoreNum >= 40 ? "var(--med)" : "var(--low)", fontWeight: 700 }}>
            {scoreNum}점
          </span>
        </div>
      )}
    </div>
  );
}
