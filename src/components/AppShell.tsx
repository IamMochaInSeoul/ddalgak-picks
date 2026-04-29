import { useEffect, useRef, useState } from "react";
import { useStore } from "../lib/store";
import Landing from "./Landing";
import TypeSelect from "./TypeSelect";
import Upload from "./Upload";
import Analysis from "./Analysis";
import Gallery from "./Gallery";
import FeedbackMode from "./FeedbackMode";
import AlbumContainer from "./AlbumContainer";
import FolderUpload from "./FolderUpload";
import FolderGallery from "./FolderGallery";
import StudioTypeSelect from "./StudioTypeSelect";
import PersonSelect from "./PersonSelect";
import ErrorBoundary from "./ErrorBoundary";
import { ToastContainer } from "./Toast";
import DriveDownloadBanner from "./DriveDownloadBanner";
import {
  saveSession,
  loadSession,
  clearSession,
  type PersistedSession,
} from "../lib/sessionPersist";

/** 3초 디바운스 저장 */
function debounce<T extends (...args: Parameters<T>) => void>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export default function AppShell() {
  const step         = useStore((s) => s.step);
  const feedbackMode = useStore((s) => s.feedbackMode);
  const photos       = useStore((s) => s.photos);
  const photoType    = useStore((s) => s.photoType);
  const targetCount  = useStore((s) => s.targetCount);
  const locale       = useStore((s) => s.locale);
  const restoreSession = useStore((s) => s.restoreSession);

  const [recoveryData, setRecoveryData] = useState<PersistedSession | null>(null);
  const [recoveryChecked, setRecoveryChecked] = useState(false);

  // ── 앱 마운트 시 복구 데이터 확인 ──────────────────────────────────────
  useEffect(() => {
    loadSession().then((data) => {
      setRecoveryData(data);
      setRecoveryChecked(true);
    });
  }, []);

  // ── beforeunload: 분석 중 또는 갤러리에서 탭 닫기 경고 ─────────────────
  useEffect(() => {
    if (step !== "analysis" && step !== "gallery" && step !== "folderGallery") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // 모던 브라우저는 커스텀 메시지 무시 — 브라우저 기본 다이얼로그 표시됨
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [step]);

  // ── 갤러리 상태 자동저장 (3초 디바운스) ────────────────────────────────
  const debouncedSave = useRef(
    debounce(async (
      currentPhotos: typeof photos,
      currentPhotoType: typeof photoType,
      currentTargetCount: number,
      currentLocale: typeof locale,
    ) => {
      const allPhotos = [...currentPhotos.values()];
      const selected = allPhotos.filter((p) => p.isSelected);
      if (selected.length === 0) return;

      const selectedPhotos: PersistedSession["selectedPhotos"] = selected.map((p) => ({
        id: p.id,
        filename: p.file?.name ?? "",
        thumbnail: p.thumbnail,
        score: p.score?.total ?? 0,
        deductions: p.deductions,
        confidence: p.confidence,
        isSelected: true,
      }));

      await saveSession({
        savedAt: Date.now(),
        photoType: currentPhotoType ?? "mixed",
        targetCount: currentTargetCount,
        locale: currentLocale,
        totalCount: allPhotos.length,
        selectedCount: selected.length,
        selectedPhotos,
      });
    }, 3000),
  ).current;

  useEffect(() => {
    if (step !== "gallery") return;
    debouncedSave(photos, photoType, targetCount, locale);
  }, [step, photos, photoType, targetCount, locale, debouncedSave]);

  // ── 갤러리를 벗어나면(reset) 저장 데이터 삭제 ─────────────────────────
  useEffect(() => {
    if (step === "landing") {
      clearSession().catch(() => {});
    }
  }, [step]);

  // ── 복구 배너 핸들러 ───────────────────────────────────────────────────
  function handleRestore() {
    if (!recoveryData) return;
    restoreSession(recoveryData);
    setRecoveryData(null);
  }

  function handleDismissRecovery() {
    clearSession().catch(() => {});
    setRecoveryData(null);
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* ── 세션 복구 배너 ── */}
      {recoveryChecked && recoveryData && step === "landing" && (
        <div style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
          zIndex: 9000, maxWidth: 480, width: "calc(100% - 32px)",
          background: "var(--bg2)",
          border: "1px solid var(--border)",
          borderLeft: "4px solid var(--accent)",
          borderRadius: 14,
          boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
          padding: "16px 20px",
        }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
            💾 이전 작업이 남아있어요
          </div>
          <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 14, lineHeight: 1.6 }}>
            {new Date(recoveryData.savedAt).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} 저장
            &nbsp;·&nbsp; 총 {recoveryData.totalCount}장 중 <strong style={{ color: "var(--accent2)" }}>{recoveryData.selectedCount}장</strong> 선택됨
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleRestore}
              style={{
                flex: 1, padding: "9px 0", borderRadius: 9, border: "none", cursor: "pointer",
                background: "linear-gradient(135deg, var(--accent), var(--accent2))",
                color: "#fff", fontWeight: 700, fontSize: 14,
              }}
            >
              이어서 작업하기
            </button>
            <button
              onClick={handleDismissRecovery}
              style={{
                padding: "9px 18px", borderRadius: 9, cursor: "pointer",
                border: "1.5px solid var(--border)", background: "transparent",
                color: "var(--text2)", fontSize: 13,
              }}
            >
              새로 시작
            </button>
          </div>
        </div>
      )}

      <ToastContainer />
      <DriveDownloadBanner />
      <ErrorBoundary>
        {step === "landing"    && <Landing />}
        {step === "typeSelect" && <TypeSelect />}
        {step === "upload"     && <Upload />}
        {step === "analysis"   && <Analysis />}
        {step === "gallery"      && !feedbackMode && <Gallery />}
        {step === "gallery"      && feedbackMode  && <FeedbackMode />}
        {step === "album"        && <AlbumContainer />}
        {step === "studioSelect"  && <StudioTypeSelect />}
        {step === "folderUpload"  && <FolderUpload />}
        {step === "folderGallery" && <FolderGallery />}
        {step === "personSelect"  && <PersonSelect />}
      </ErrorBoundary>
    </div>
  );
}
