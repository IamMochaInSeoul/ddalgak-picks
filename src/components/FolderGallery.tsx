/**
 * FolderGallery.tsx — Flow B
 * 폴더별 분석 진행 + 탭 갤러리 + 폴더 구조 보존 ZIP
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { analyzePhotos } from "../lib/analyzer";
import { EVENT_TAG_LABELS } from "../lib/eventTagger";
import type { AppState, FolderSession, PhotoEntry } from "../lib/types";
import {
  DEFAULT_WEIGHTS,
  DEFAULT_PET_WEIGHTS,
  DEFAULT_FILTERS,
} from "../lib/types";
import LangToggle from "./LangToggle";

// ── 분석 진행 메시지 ────────────────────────────────────────────────────────
const STAGE_LABELS: Record<string, string> = {
  loadingModel:    "AI 모델 로딩 중…",
  hashing:         "사진 지문 계산 중…",
  grouping:        "유사 사진 묶는 중…",
  detecting:       "얼굴/피사체 감지 중…",
  scoring:         "사진 품질 평가 중…",
  selecting:       "베스트컷 선별 중…",
  done:            "완료",
};

function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage;
}

// ── 컴포넌트 ──────────────────────────────────────────────────────────────
export default function FolderGallery() {
  const setStep = useStore((s) => s.setStep) as (step: AppState["step"]) => void;
  const folderSessions  = useStore((s) => s.folderSessions);
  const updateSession   = useStore((s) => s.updateFolderSession);
  const maxPerGroup     = useStore((s) => s.maxPerGroup);

  const [activeTab, setActiveTab] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported]   = useState(false);
  const analysisStarted = useRef(false);

  // ── 분석 실행 (sequential per folder) ────────────────────────────────────
  useEffect(() => {
    if (analysisStarted.current) return;
    if (folderSessions.length === 0) return;
    analysisStarted.current = true;

    (async () => {
      for (const session of folderSessions) {
        if (session.status !== "pending") continue;

        updateSession(session.id, { status: "analyzing", progress: 0, stage: "loadingModel" });

        try {
          const result = await analyzePhotos(
            session.files,
            "portrait",       // 스튜디오 대부분 인물 촬영
            session.targetCount,
            DEFAULT_WEIGHTS,
            DEFAULT_PET_WEIGHTS,
            DEFAULT_FILTERS,
            (current, total, stage) => {
              updateSession(session.id, {
                progress: total > 0 ? current / total : 0,
                stage,
              });
            },
            maxPerGroup
          );

          updateSession(session.id, {
            status: "done",
            progress: 1,
            stage: "done",
            photos: result.photos,
            groups: result.groups,
          });
        } catch (err) {
          console.error(`[FolderGallery] ${session.folderName} 분석 실패:`, err);
          updateSession(session.id, {
            status: "error",
            errorMessage: err instanceof Error ? err.message : "알 수 없는 오류",
          });
        }
      }
    })();
  // Only run once on mount — intentional
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allDone = folderSessions.length > 0 &&
    folderSessions.every((s) => s.status === "done" || s.status === "error");

  const totalSelected = folderSessions.reduce((acc, s) => {
    return acc + [...s.photos.values()].filter((p) => p.isSelected).length;
  }, 0);

  // ── ZIP 다운로드 ───────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    setExported(false);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      for (const session of folderSessions) {
        if (session.status !== "done") continue;
        const folder = zip.folder(session.folderName)!;
        for (const photo of session.photos.values()) {
          if (!photo.isSelected || !photo.file) continue;
          const buf = await photo.file.arrayBuffer();
          folder.file(photo.file.name, buf);
        }
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ddalgak-picks-${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setExported(true);
    } catch (err) {
      console.error("[FolderGallery] ZIP 생성 실패:", err);
    } finally {
      setExporting(false);
    }
  }, [folderSessions, exporting]);

  // ── 현재 탭 세션 ──────────────────────────────────────────────────────────
  const activeSession: FolderSession | undefined = folderSessions[activeTab];
  const selectedPhotos: PhotoEntry[] = activeSession
    ? [...activeSession.photos.values()].filter((p) => p.isSelected)
    : [];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      {/* ── 헤더 ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 100,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "14px 24px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg)",
      }}>
        <button className="btn-secondary" style={{ padding: "6px 14px", fontSize: 13 }}
          onClick={() => setStep("folderUpload")}>
          ← 뒤로
        </button>
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--accent2)" }}>📁 폴더 묶음 셀렉</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {allDone && totalSelected > 0 && (
            <button
              className="btn-primary"
              style={{ fontSize: 13, padding: "7px 16px" }}
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? "ZIP 생성 중…" : exported ? "✓ 완료!" : `⬇ ZIP 저장 (${totalSelected}장)`}
            </button>
          )}
          <LangToggle />
        </div>
      </div>

      {/* ── 탭 바 ── */}
      <div style={{
        display: "flex", gap: 0, overflowX: "auto",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg2)",
        scrollbarWidth: "none",
      }}>
        {folderSessions.map((session, idx) => {
          const done = session.status === "done";
          const error = session.status === "error";
          const analyzing = session.status === "analyzing";
          const selCount = done
            ? [...session.photos.values()].filter((p) => p.isSelected).length
            : 0;

          return (
            <button
              key={session.id}
              onClick={() => setActiveTab(idx)}
              style={{
                padding: "12px 20px",
                fontSize: 13,
                fontWeight: activeTab === idx ? 700 : 500,
                color: activeTab === idx ? "var(--accent2)" : "var(--text2)",
                background: "transparent",
                border: "none",
                borderBottom: `2.5px solid ${activeTab === idx ? "var(--accent)" : "transparent"}`,
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "color 0.15s",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>
                {error ? "⚠️" : analyzing ? "⏳" : done ? "✓" : "⏸"}{" "}
                {session.folderName}
              </span>
              {done && (
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "2px 6px",
                  borderRadius: 10,
                  background: "rgba(108,99,255,0.15)",
                  color: "var(--accent2)",
                }}>
                  {selCount}장
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── 탭 콘텐츠 ── */}
      <div style={{ flex: 1, padding: "20px 20px 60px", maxWidth: 900, width: "100%", margin: "0 auto" }}>
        {!activeSession && (
          <div style={{ textAlign: "center", marginTop: 60, color: "var(--text2)" }}>
            폴더를 추가해주세요.
          </div>
        )}

        {/* 분석 중 */}
        {activeSession?.status === "analyzing" && (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              {activeSession.folderName} 분석 중…
            </div>
            <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 24 }}>
              {stageLabel(activeSession.stage)}
            </div>
            {/* 프로그레스 바 */}
            <div style={{
              width: "100%", maxWidth: 360, margin: "0 auto",
              height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden",
            }}>
              <div style={{
                height: "100%",
                width: `${Math.round(activeSession.progress * 100)}%`,
                background: "linear-gradient(90deg, var(--accent), var(--accent2))",
                transition: "width 0.3s",
                borderRadius: 3,
              }} />
            </div>
            <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 8 }}>
              {Math.round(activeSession.progress * 100)}%
            </div>
          </div>
        )}

        {/* 대기 중 */}
        {activeSession?.status === "pending" && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text2)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⏸</div>
            <div>이전 폴더 분석 완료 후 시작됩니다</div>
          </div>
        )}

        {/* 에러 */}
        {activeSession?.status === "error" && (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>분석 실패</div>
            <div style={{ fontSize: 13, color: "var(--text2)" }}>
              {activeSession.errorMessage ?? "알 수 없는 오류"}
            </div>
          </div>
        )}

        {/* 분석 완료 */}
        {activeSession?.status === "done" && (
          <>
            {/* 세션 요약 */}
            <div style={{
              display: "flex", alignItems: "center", gap: 12, marginBottom: 20,
              padding: "12px 16px", borderRadius: 10,
              background: "rgba(108,99,255,0.08)",
              border: "1px solid rgba(108,99,255,0.2)",
            }}>
              <div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "3px 8px",
                  borderRadius: 20,
                  background: "rgba(108,99,255,0.15)",
                  color: "var(--accent2)",
                  marginRight: 8,
                }}>
                  {EVENT_TAG_LABELS[activeSession.eventTag]}
                </span>
                <span style={{ fontWeight: 700 }}>{activeSession.folderName}</span>
              </div>
              <div style={{ marginLeft: "auto", fontSize: 13, color: "var(--text2)" }}>
                총 {activeSession.files.length.toLocaleString()}장 →{" "}
                <strong style={{ color: "var(--accent2)" }}>
                  {selectedPhotos.length}장
                </strong> 선별
              </div>
            </div>

            {/* 썸네일 그리드 */}
            {selectedPhotos.length > 0 ? (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                gap: 8,
              }}>
                {selectedPhotos.map((photo) => (
                  <div key={photo.id} style={{
                    position: "relative",
                    borderRadius: 8,
                    overflow: "hidden",
                    aspectRatio: "1",
                    background: "var(--bg3)",
                    border: "2px solid rgba(108,99,255,0.4)",
                    cursor: "pointer",
                  }}
                    onClick={() => {
                      updateSession(activeSession.id, {
                        photos: new Map(
                          [...activeSession.photos.entries()].map(([id, p]) =>
                            [id, p.id === photo.id ? { ...p, isSelected: !p.isSelected } : p]
                          )
                        ),
                      });
                    }}
                  >
                    <img
                      src={photo.thumbnail}
                      alt={photo.file?.name ?? photo.id}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      loading="lazy"
                    />
                    {/* 품질 배지 */}
                    <div style={{
                      position: "absolute", bottom: 4, right: 4,
                      fontSize: 10, fontWeight: 700, padding: "2px 6px",
                      borderRadius: 8,
                      background: photo.confidence === "HIGH"
                        ? "rgba(0,200,100,0.85)"
                        : photo.confidence === "MEDIUM"
                          ? "rgba(255,180,0,0.85)"
                          : "rgba(200,80,80,0.85)",
                      color: "#fff",
                    }}>
                      {photo.confidence === "HIGH" ? "HIGH" : photo.confidence === "MEDIUM" ? "MED" : "LOW"}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text2)" }}>
                선별된 사진이 없습니다
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 하단 전체 요약 + ZIP 버튼 ── */}
      {allDone && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          padding: "14px 20px",
          background: "var(--bg2)",
          borderTop: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, zIndex: 200,
        }}>
          <div style={{ fontSize: 13, color: "var(--text2)" }}>
            {folderSessions.filter((s) => s.status === "done").length}개 폴더 완료
            {" · "}
            <strong style={{ color: "var(--accent2)" }}>총 {totalSelected}장</strong> 선별
          </div>
          <button
            className="btn-primary"
            style={{ fontSize: 14, padding: "10px 24px", flexShrink: 0 }}
            onClick={handleExport}
            disabled={exporting || totalSelected === 0}
          >
            {exporting ? "ZIP 생성 중…" : exported ? "✓ 다운로드 완료!" : "⬇ 전체 ZIP 저장"}
          </button>
        </div>
      )}
    </div>
  );
}
