/**
 * PhotoDetailModal.tsx — PHASE1_PLAN ⑥ 사진 상세 확인 흐름
 *
 * Flow A·B·C 공통. 카드 바디 클릭으로 진입.
 * - NOTES 섹션: 큐레이터 톤 (의료 명세 표 형식)
 * - 그룹 베스트 점프
 * - 키보드 네비 (← → Space Esc + −)
 * - 모바일: 풀스크린 슬라이드업 시트 (<768px)
 *
 * DESIGN_DIRECTION §9-5 v2.1: var(--font-sans) + fontWeight 800,
 * var(--font-display) 직접 참조 금지.
 */
import { useEffect, useCallback, useState, useRef } from "react";
import type { PhotoEntry } from "../lib/types";
import { buildScoreBreakdown } from "../lib/scoreBreakdown";

interface Props {
  photo: PhotoEntry;
  allPhotos: PhotoEntry[];
  groupBestPhoto?: PhotoEntry;
  onClose: () => void;
  onNavigate: (photoId: string) => void;
  onToggleSelect: (photoId: string) => void;
  onJumpToGroupBest?: () => void;
}

export default function PhotoDetailModal({
  photo,
  allPhotos,
  groupBestPhoto,
  onClose,
  onNavigate,
  onToggleSelect,
  onJumpToGroupBest,
}: Props) {
  const [zoom, setZoom]       = useState(1);
  const [pan, setPan]         = useState({ x: 0, y: 0 });
  const [isPanning, setPanning] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" && window.innerWidth < 768
  );
  const dragStart = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null);

  const idx   = allPhotos.findIndex((p) => p.id === photo.id);
  const total = allPhotos.length;

  // 줌 리셋 (사진 바뀔 때)
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, [photo.id]);

  // resize 추적
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // 키보드 네비
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape")                                { onClose(); return; }
    if (e.key === "ArrowLeft"  && idx > 0)                 { onNavigate(allPhotos[idx - 1].id); return; }
    if (e.key === "ArrowRight" && idx < total - 1)         { onNavigate(allPhotos[idx + 1].id); return; }
    if (e.key === " ")                                     { e.preventDefault(); onToggleSelect(photo.id); return; }
    if (e.key === "+" || e.key === "=")                    { setZoom((z) => Math.min(z * 1.25, 5)); return; }
    if (e.key === "-")                                     { setZoom((z) => Math.max(z / 1.25, 1)); return; }
  }, [idx, total, allPhotos, onClose, onNavigate, onToggleSelect, photo.id]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  // body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const breakdown  = buildScoreBreakdown(
    photo,
    groupBestPhoto?.score?.total ? Math.round(groupBestPhoto.score.total * 100) : undefined,
    groupBestPhoto?.id,
  );

  const previewSrc = photo.thumbnail || (photo.file ? URL.createObjectURL(photo.file) : "");
  const fileName   = (photo.displayName ?? photo.file?.name ?? photo.id).replace(/\.[^.]+$/, "");

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(13, 15, 18, 0.92)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: isMobile ? 0 : "var(--space-8)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: isMobile ? "100%" : 960,
          height: isMobile ? "100dvh" : "auto",
          maxHeight: isMobile ? "100dvh" : "92vh",
          background: "var(--bg-elevated)",
          border: isMobile ? "none" : "1px solid var(--border-subtle)",
          borderRadius: isMobile ? 0 : "var(--radius-lg, 16px)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          paddingBottom: isMobile ? "env(safe-area-inset-bottom)" : 0,
          animation: isMobile ? "ddalgakSlideUp 280ms cubic-bezier(0, 0, 0.2, 1)" : undefined,
        }}
      >
        {/* ── 헤더: 파일명 · N of M ── */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "var(--space-3) var(--space-4)",
          borderBottom: "1px solid var(--border-subtle)",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-xs)",
          color: "var(--text-secondary)",
          letterSpacing: "var(--tracking-uppercase)",
          textTransform: "uppercase",
          flexShrink: 0,
        }}>
          <button
            onClick={() => idx > 0 && onNavigate(allPhotos[idx - 1].id)}
            disabled={idx === 0}
            aria-label="이전"
            style={{
              background: "transparent", border: "none",
              color: idx === 0 ? "var(--text-disabled)" : "var(--text-primary)",
              cursor: idx === 0 ? "default" : "pointer",
              padding: "6px 10px", fontFamily: "inherit", fontSize: "inherit",
            }}
          >← 이전</button>

          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "50%" }}>
            {fileName} · {idx + 1} of {total}
          </span>

          <button
            onClick={() => idx < total - 1 && onNavigate(allPhotos[idx + 1].id)}
            disabled={idx >= total - 1}
            aria-label="다음"
            style={{
              background: "transparent", border: "none",
              color: idx >= total - 1 ? "var(--text-disabled)" : "var(--text-primary)",
              cursor: idx >= total - 1 ? "default" : "pointer",
              padding: "6px 10px", fontFamily: "inherit", fontSize: "inherit",
            }}
          >다음 →</button>
        </div>

        {/* ── 이미지 영역 ── */}
        <div
          style={{
            flex: 1, minHeight: isMobile ? 240 : 400,
            background: "var(--bg-base)",
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden", position: "relative",
            cursor: zoom > 1 ? (isPanning ? "grabbing" : "grab") : "default",
            touchAction: "none",
          }}
          onMouseDown={(e) => {
            if (zoom <= 1) return;
            setPanning(true);
            dragStart.current = { x: e.clientX, y: e.clientY, sx: pan.x, sy: pan.y };
          }}
          onMouseMove={(e) => {
            if (!isPanning || !dragStart.current) return;
            setPan({
              x: dragStart.current.sx + (e.clientX - dragStart.current.x),
              y: dragStart.current.sy + (e.clientY - dragStart.current.y),
            });
          }}
          onMouseUp={() => { setPanning(false); dragStart.current = null; }}
          onMouseLeave={() => { setPanning(false); dragStart.current = null; }}
          onWheel={(e) => {
            e.preventDefault();
            setZoom((z) => Math.max(1, Math.min(5, z * (e.deltaY > 0 ? 0.92 : 1.08))));
          }}
        >
          {previewSrc ? (
            <img
              src={previewSrc}
              alt={fileName}
              draggable={false}
              style={{
                maxWidth: "100%", maxHeight: "100%",
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transition: isPanning ? "none" : "transform 240ms cubic-bezier(0.4, 0, 0.2, 1)",
                userSelect: "none", pointerEvents: "none",
              }}
            />
          ) : (
            <div style={{ color: "var(--text-tertiary)", fontSize: 14 }}>미리보기 없음</div>
          )}
        </div>

        {/* ── NOTES 섹션 ── */}
        <div style={{
          padding: "var(--space-4) var(--space-6)",
          borderTop: "1px solid var(--border-subtle)",
          fontFamily: "var(--font-sans)",
          color: "var(--text-primary)",
          maxHeight: isMobile ? "36vh" : 240,
          overflowY: "auto",
          flexShrink: 0,
        }}>
          {/* SCORE */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "baseline",
            marginBottom: "var(--space-3)",
          }}>
            <span style={{
              fontSize: "var(--text-xs)", fontFamily: "var(--font-mono)",
              color: "var(--text-tertiary)",
              letterSpacing: "var(--tracking-uppercase)", textTransform: "uppercase",
            }}>SCORE</span>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: "var(--text-md)",
              color: "var(--text-primary)", fontWeight: 500,
            }}>
              {breakdown.finalScore} / 100
            </span>
          </div>

          {/* NOTES 레이블 */}
          <div style={{
            fontSize: "var(--text-xs)", fontFamily: "var(--font-mono)",
            color: "var(--text-tertiary)",
            letterSpacing: "var(--tracking-uppercase)", textTransform: "uppercase",
            marginBottom: "var(--space-2)",
          }}>NOTES</div>

          {/* NOTES 내용 */}
          {breakdown.penalties.length === 0 && breakdown.bonuses.length === 0 ? (
            <p style={{
              fontFamily: "var(--font-sans)",
              fontStyle: "normal",
              fontWeight: 400,
              color: "var(--text-secondary)",
              fontSize: "var(--text-sm)",
              margin: 0,
            }}>
              NOTES 없음 — 흠잡을 데 없는 컷입니다.
            </p>
          ) : (
            <div style={{ borderTop: "1px solid var(--border-subtle)" }}>
              {[...breakdown.penalties, ...breakdown.bonuses].map((row, i) => (
                <div key={`${row.code}-${i}`} style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(120px, 1fr) 2fr auto",
                  gap: "var(--space-3)",
                  padding: "var(--space-2) 0",
                  borderBottom: "1px solid var(--border-subtle)",
                  fontFamily: "var(--font-sans)",
                }}>
                  <span style={{ color: "var(--text-primary)", fontSize: "var(--text-sm)" }}>
                    {row.label}
                  </span>
                  <span style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
                    {row.detail}
                  </span>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)",
                    color: row.delta < 0 ? "var(--text-secondary)"
                          : row.delta > 0 ? "var(--accent)"
                          : "var(--text-tertiary)",
                    minWidth: 40, textAlign: "right",
                  }}>
                    {row.delta > 0 ? "+" : ""}{row.delta !== 0 ? row.delta : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* 그룹 베스트 점프 */}
          {breakdown.groupBestScore != null
            && breakdown.groupBestPhotoId
            && breakdown.groupBestPhotoId !== photo.id
            && onJumpToGroupBest && (
            <div style={{
              marginTop: "var(--space-3)",
              padding: "var(--space-2) 0",
              fontSize: "var(--text-sm)",
              color: "var(--text-secondary)",
              fontFamily: "var(--font-sans)",
              fontStyle: "normal",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              gap: "var(--space-3)",
            }}>
              <span>이 그룹의 최고점은 {breakdown.groupBestScore}점.</span>
              <button
                onClick={onJumpToGroupBest}
                style={{
                  background: "transparent", border: "none",
                  color: "var(--accent)",
                  fontFamily: "var(--font-sans)",
                  fontStyle: "normal",
                  fontSize: "var(--text-sm)",
                  cursor: "pointer",
                  padding: "4px 0",
                  flexShrink: 0,
                }}
              >그 컷 보기 →</button>
            </div>
          )}
        </div>

        {/* ── 단축키 안내 (데스크톱만) ── */}
        {!isMobile && (
          <div style={{
            fontSize: "var(--text-xs)", fontFamily: "var(--font-mono)",
            color: "var(--text-tertiary)",
            letterSpacing: "var(--tracking-uppercase)", textTransform: "uppercase",
            padding: "var(--space-2) var(--space-6)",
            borderTop: "1px solid var(--border-subtle)",
            display: "flex", justifyContent: "space-between",
            flexShrink: 0,
          }}>
            <span>← → 사진 이동</span>
            <span>SPACE 빼기·넣기</span>
            <span>+ − 줌</span>
            <span>ESC 닫기</span>
          </div>
        )}

        {/* ── 액션 버튼 ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--space-3)",
          padding: "var(--space-3) var(--space-6)",
          borderTop: "1px solid var(--border-subtle)",
          flexShrink: 0,
        }}>
          {photo.isSelected ? (
            <button
              onClick={() => onToggleSelect(photo.id)}
              style={{
                padding: "12px",
                background: "transparent",
                color: "var(--text-secondary)",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-sm)",
                fontFamily: "var(--font-sans)",
                fontSize: "var(--text-sm)",
                cursor: "pointer",
                touchAction: "manipulation",
              }}
            >
              빼기
            </button>
          ) : (
            <button
              onClick={() => onToggleSelect(photo.id)}
              style={{
                padding: "12px",
                background: "transparent",
                color: "var(--accent)",
                border: "1px solid var(--accent)",
                borderRadius: "var(--radius-sm)",
                fontFamily: "var(--font-sans)",
                fontSize: "var(--text-sm)",
                cursor: "pointer",
                touchAction: "manipulation",
              }}
            >
              다시 넣기
            </button>
          )}

          <button
            onClick={onClose}
            style={{
              padding: "12px",
              background: "var(--accent)",
              color: "var(--bg-base)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
              fontWeight: 700,
              cursor: "pointer",
              touchAction: "manipulation",
            }}
          >
            {photo.isSelected ? "유지" : "닫기"}
          </button>
        </div>
      </div>
    </div>
  );
}
