
import { useEffect, useCallback, useState, useRef, useMemo } from "react";
import type { PhotoEntry } from "../lib/types";

interface Props {
  photo: PhotoEntry;
  allPhotos: PhotoEntry[];
  onClose: () => void;
  onNavigate: (photoId: string) => void;
  onToggleSelect: (photoId: string) => void;
}

const DEDUCTION_INFO: Record<string, { label: string; desc: string; color: string }> = {
  EYE_CLOSED:      { label: "눈 감음",        desc: "눈이 감긴 상태로 촬영되었습니다.",                  color: "#ef4444" },
  BLUR:            { label: "흔들림/초점",     desc: "사진이 흔들리거나 초점이 맞지 않습니다.",           color: "#f59e0b" },
  SIDE_FACE:       { label: "측면 얼굴",       desc: "정면이 아닌 측면으로 촬영되었습니다.",              color: "#8b5cf6" },
  EYE_REGION_DARK: { label: "눈 감음(추정)",   desc: "눈 주변이 어둡거나 눈이 감긴 것으로 추정됩니다.", color: "#f97316" },
  LOW_CONFIDENCE:  { label: "감지 불확실",     desc: "AI가 얼굴을 명확하게 인식하지 못했습니다.",        color: "#6b7280" },
  NO_SUBJECT:      { label: "얼굴 미감지",     desc: "얼굴이 감지되지 않았습니다. 선명도 기준으로 평가됩니다.", color: "#3b82f6" },
};

const CONFIDENCE_LABEL: Record<string, { label: string; color: string }> = {
  HIGH:   { label: "높음 3/3", color: "var(--high)" },
  MEDIUM: { label: "보통 2/3", color: "var(--med)" },
  LOW:    { label: "낮음 1/3", color: "var(--low)" },
};

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(value * 100);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: "var(--text2)" }}>{label}</span>
        <span style={{ fontWeight: 700, color }}>{pct}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "var(--bg3)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width 0.4s ease" }} />
      </div>
    </div>
  );
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

export default function PhotoModal({ photo, allPhotos, onClose, onNavigate, onToggleSelect }: Props) {
  const currentIndex = allPhotos.findIndex((p) => p.id === photo.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < allPhotos.length - 1;

  // 원본 파일 Object URL (고화질 표시용) — 모달 닫힐 때 revoke
  const originalUrl = useMemo(() => URL.createObjectURL(photo.file), [photo.file]);
  useEffect(() => {
    return () => URL.revokeObjectURL(originalUrl);
  }, [originalUrl]);

  // Zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const imgContainerRef = useRef<HTMLDivElement>(null);

  // Reset zoom when photo changes
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [photo.id]);

  const clampPan = useCallback((z: number, px: number, py: number) => {
    // Allow panning only when zoomed
    if (z <= 1) return { x: 0, y: 0 };
    const container = imgContainerRef.current;
    if (!container) return { x: px, y: py };
    const maxX = (container.clientWidth * (z - 1)) / 2;
    const maxY = (container.clientHeight * (z - 1)) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, px)),
      y: Math.max(-maxY, Math.min(maxY, py)),
    };
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((prev) => {
      const delta = e.deltaY > 0 ? -0.2 : 0.2;
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta));
      setPan((p) => clampPan(next, p.x, p.y));
      return next;
    });
  }, [clampPan]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom <= 1) return;
    dragging.current = true;
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
    e.preventDefault();
  }, [zoom, pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragStart.current.mx;
    const dy = e.clientY - dragStart.current.my;
    setPan(clampPan(zoom, dragStart.current.px + dx, dragStart.current.py + dy));
  }, [zoom, clampPan]);

  const handleMouseUp = useCallback(() => { dragging.current = false; }, []);

  const goNext = useCallback(() => {
    if (hasNext) onNavigate(allPhotos[currentIndex + 1].id);
  }, [hasNext, currentIndex, allPhotos, onNavigate]);

  const goPrev = useCallback(() => {
    if (hasPrev) onNavigate(allPhotos[currentIndex - 1].id);
  }, [hasPrev, currentIndex, allPhotos, onNavigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && zoom <= 1) goNext();
      if (e.key === "ArrowLeft" && zoom <= 1) goPrev();
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(MAX_ZOOM, z + 0.5));
      if (e.key === "-") setZoom((z) => { const next = Math.max(MIN_ZOOM, z - 0.5); if (next <= 1) setPan({ x: 0, y: 0 }); return next; });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, goNext, goPrev, zoom]);

  const score = photo.score;
  const isPortrait = score && "eyeOpen" in score;
  const isPet = score && "eyeEstimate" in score;
  const totalScore = Math.round((score?.total ?? 0) * 100);
  const totalColor = totalScore >= 70 ? "var(--high)" : totalScore >= 40 ? "#f59e0b" : "#ef4444";
  const conf = CONFIDENCE_LABEL[photo.confidence] ?? { label: "낮음", color: "#ef4444" };

  const zoomPct = Math.round(zoom * 100);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.92)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "12px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "flex", flexDirection: "row", gap: 0,
          background: "var(--bg2)", borderRadius: "var(--radius-lg)",
          overflow: "hidden",
          width: "min(96vw, 1100px)",
          height: "min(92vh, 760px)",
          border: "1px solid var(--border)",
        }}
      >
        {/* Left: image viewer */}
        <div
          ref={imgContainerRef}
          style={{
            flex: "1 1 65%", background: "#000",
            display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative", overflow: "hidden",
            cursor: zoom > 1 ? "grab" : "default",
          }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <img
            src={originalUrl}
            alt=""
            draggable={false}
            style={{
              maxWidth: "100%", maxHeight: "100%",
              objectFit: "contain", display: "block",
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              transition: dragging.current ? "none" : "transform 0.15s ease",
              userSelect: "none",
              pointerEvents: "none",
            }}
          />

          {/* Nav buttons — hide when zoomed */}
          {zoom <= 1 && hasPrev && (
            <button onClick={goPrev} style={{
              position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
              background: "rgba(0,0,0,0.65)", border: "none", color: "white",
              fontSize: 26, width: 44, height: 44, borderRadius: "50%", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>‹</button>
          )}
          {zoom <= 1 && hasNext && (
            <button onClick={goNext} style={{
              position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
              background: "rgba(0,0,0,0.65)", border: "none", color: "white",
              fontSize: 26, width: 44, height: 44, borderRadius: "50%", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>›</button>
          )}

          {/* Zoom controls */}
          <div style={{
            position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)",
            display: "flex", alignItems: "center", gap: 6,
            background: "rgba(0,0,0,0.7)", borderRadius: "var(--radius-sm)", padding: "4px 10px",
          }}>
            <button onClick={() => { const z = Math.max(MIN_ZOOM, zoom - 0.5); setZoom(z); if (z <= 1) setPan({ x: 0, y: 0 }); }}
              style={{ background: "none", border: "none", color: "white", fontSize: 18, cursor: "pointer", width: 28, lineHeight: 1 }}>−</button>
            <span style={{ color: "white", fontSize: 12, minWidth: 40, textAlign: "center" }}>{zoomPct}%</span>
            <button onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.5))}
              style={{ background: "none", border: "none", color: "white", fontSize: 18, cursor: "pointer", width: 28, lineHeight: 1 }}>+</button>
            {zoom > 1 && (
              <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
                style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "white", fontSize: 10, cursor: "pointer", borderRadius: 8, padding: "2px 7px" }}>
                초기화
              </button>
            )}
          </div>

          {/* Position indicator */}
          <div style={{
            position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.6)", color: "white", fontSize: 11,
            padding: "2px 10px", borderRadius: "var(--radius-md)",
          }}>
            {currentIndex + 1} / {allPhotos.length}
          </div>
        </div>

        {/* Right: evaluation panel */}
        <div style={{
          flex: "0 0 300px", padding: "20px", overflowY: "auto",
          display: "flex", flexDirection: "column", gap: 0,
          borderLeft: "1px solid var(--border)",
        }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            <button onClick={onClose} style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text2)", fontSize: 20, lineHeight: 1, padding: 0,
            }}>✕</button>
          </div>

          {/* Total score */}
          <div style={{
            textAlign: "center", marginBottom: 20,
            padding: "16px", borderRadius: "var(--radius-lg)", background: "var(--bg3)",
          }}>
            <div style={{ fontSize: 40, fontWeight: 900, color: totalColor }}>{totalScore}</div>
            <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 2 }}>종합 점수 (100점 만점)</div>
            <div style={{
              display: "inline-block", marginTop: 8,
              padding: "2px 10px", borderRadius: "var(--radius-md)",
              background: `${conf.color}22`, color: conf.color, fontSize: 11, fontWeight: 700,
            }}>
              신뢰도 {conf.label}
            </div>
          </div>

          {/* Score bars */}
          {isPortrait && score && "eyeOpen" in score && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", marginBottom: 8 }}>📊 세부 평가</div>
              <ScoreBar label="눈 뜸 정도"  value={score.eyeOpen}    color="var(--accent)" />
              <ScoreBar label="선명도"      value={score.sharpness}  color="var(--high)" />
              <ScoreBar label="표정 (미소)" value={score.expression} color="#f59e0b" />
              <ScoreBar label="정면 여부"   value={score.facing}     color="#3b82f6" />
            </div>
          )}
          {isPet && score && "eyeEstimate" in score && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", marginBottom: 8 }}>📊 세부 평가</div>
              <ScoreBar label="선명도"       value={score.sharpness}   color="var(--high)" />
              <ScoreBar label="눈 부위 선명" value={score.eyeEstimate} color="var(--accent)" />
              <ScoreBar label="피사체 위치"  value={score.position}    color="#f59e0b" />
            </div>
          )}

          {/* Deductions */}
          {photo.deductions.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", marginBottom: 8 }}>⚠️ 감점 요소</div>
              {photo.deductions.map((d) => {
                const info = DEDUCTION_INFO[d];
                if (!info) return null;
                return (
                  <div key={d} style={{
                    display: "flex", gap: 8, alignItems: "flex-start",
                    padding: "8px 10px", borderRadius: 8, marginBottom: 6,
                    background: `${info.color}18`, border: `1px solid ${info.color}44`,
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: info.color, flexShrink: 0, marginTop: 4 }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: info.color }}>{info.label}</div>
                      <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 2 }}>{info.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {photo.deductions.length === 0 && (
            <div style={{
              padding: "8px 12px", borderRadius: 8, marginBottom: 16,
              background: "rgba(107,139,90,0.1)", border: "1px solid rgba(107,139,90,0.3)",
              fontSize: 12, color: "var(--high)",
            }}>
              ✅ 감점 요소 없음
            </div>
          )}

          {/* Action button */}
          <button
            onClick={() => onToggleSelect(photo.id)}
            style={{
              width: "100%", padding: "12px", borderRadius: "var(--radius-md)", cursor: "pointer",
              border: `2px solid ${photo.isSelected ? "#ef4444" : "var(--accent)"}`,
              background: photo.isSelected ? "rgba(239,68,68,0.15)" : "rgba(45,67,86,0.15)",
              color: photo.isSelected ? "#ef4444" : "var(--accent2)",
              fontWeight: 700, fontSize: 14, transition: "all 0.15s",
            }}
          >
            {photo.isSelected ? "✕ 선택 제외" : "✓ 선택에 포함"}
          </button>

          <div style={{ fontSize: 11, color: "var(--text2)", textAlign: "center", marginTop: 10 }}>
            ESC 닫기 · ← → 이전/다음 · 스크롤 줌
          </div>
        </div>
      </div>
    </div>
  );
}
