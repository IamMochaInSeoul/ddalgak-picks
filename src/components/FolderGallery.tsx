/**
 * FolderGallery.tsx — Flow B/C
 * 폴더별 분석 진행 + 탭 갤러리 + 폴더 구조 보존 ZIP
 *
 * v0.4.0 개선:
 * - 폴더 내 갤러리 뷰 탭: 선택됨 / 제외됨 / 전체
 * - 감점 사유 배지 (눈 감음, 흔들림 등)
 * - 중복 배지 (이전 세션에 사용됨)
 * - ZIP 저장 시 pHash 지문을 IndexedDB에 저장
 * - v0.4.0 Stage A: MonoNumber 카운터, 이전 배지 이모지 제거
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { analyzePhotos } from "../lib/analyzer";
import { mergePersonClusters } from "../lib/personClustering";
import { EVENT_TAG_LABELS } from "../lib/eventTagger";
import type { AppState, FolderSession, PersonCluster, PhotoEntry, PhotoGroup, DeductionCode } from "../lib/types";
import {
  DEFAULT_WEIGHTS,
  DEFAULT_PET_WEIGHTS,
  DEFAULT_FILTERS,
} from "../lib/types";
import LangToggle from "./LangToggle";
import PaymentGate from "./PaymentGate";
import MonoNumber from "./MonoNumber";
import NicknameCaptureModal from "./NicknameCaptureModal";
import UserAddress from "./UserAddress";
import GroupCompareModal from "./GroupCompareModal";
import PhotoDetailModal from "./PhotoDetailModal";
import { recordSession, shouldShowNicknameModal, loadProfile } from "../lib/userProfile";
import { isFreeBeta, FREE_BETA_COPY } from "../lib/freeBetaConfig";
import { saveZip, loadZip, type CachedZip } from "../lib/zipManager";
import { showToast } from "./Toast";
import { applyWatermark } from "../lib/watermark";
import {
  savePastSelections,
  loadPastHashes,
  clearOldHashes,
} from "../lib/pastSelectionStore";
import { findPastDupes, type DupeMatch } from "../lib/dedupe";
import { downloadDriveOriginal, getGoogleAccessToken } from "../lib/googleDrive";

// ── 분석 단계 레이블 ────────────────────────────────────────────────────────
const STAGE_LABELS: Record<string, string> = {
  loadingModel: "AI 모델 로딩 중…",
  hashing:      "사진 지문 계산 중…",
  grouping:     "유사 사진 묶는 중…",
  detecting:    "얼굴/피사체 감지 중…",
  scoring:      "사진 품질 평가 중…",
  selecting:    "베스트컷 선별 중…",
  done:         "완료",
};
function stageLabel(s: string) { return STAGE_LABELS[s] ?? s; }

// ── 감점 사유 레이블 ────────────────────────────────────────────────────────
const DEDUCTION_LABELS: Record<DeductionCode, string> = {
  EYE_CLOSED:            "눈 감음",
  BLUR:                  "흔들림",
  SIDE_FACE:             "옆모습",
  EYE_REGION_DARK:       "눈 어두움",
  LOW_CONFIDENCE:        "저신뢰",
  NO_SUBJECT:            "피사체 없음",
  EYE_SQUINT_SMILE:      "웃음 (눈 가늘어짐)",
  BLUR_AESTHETIC_BOKEH:  "아웃포커싱",
  BLUR_NOISE:            "저조도 노이즈",
};

// ── 갤러리 뷰 탭 ──────────────────────────────────────────────────────────
type GalleryView = "selected" | "excluded" | "all";

// ── 컴포넌트 ──────────────────────────────────────────────────────────────
export default function FolderGallery() {
  const setStep         = useStore((s) => s.setStep) as (step: AppState["step"]) => void;
  const flow            = useStore((s) => s.flow);
  const folderSessions  = useStore((s) => s.folderSessions);
  const updateSession   = useStore((s) => s.updateFolderSession);
  const maxPerGroup     = useStore((s) => s.maxPerGroup);
  const setPersonClusters = useStore((s) => s.setPersonClusters);

  const isPaid           = useStore((s) => s.payment.isPaid);
  const driveToken       = useStore((s) => s.driveToken);
  const setDriveToken    = useStore((s) => s.setDriveToken);
  const watermarkEnabled = useStore((s) => s.watermarkEnabled);
  const freeZipLimit     = useStore((s) => s.freeZipLimit);
  const personClusters   = useStore((s) => s.personClusters);
  const heroConfig       = useStore((s) => s.heroConfig);

  const [activeTab, setActiveTab]       = useState(0);
  const [galleryView, setGalleryView]   = useState<GalleryView>("selected");
  const [exporting, setExporting]          = useState(false);
  const [zipPercent, setZipPercent]        = useState(0);
  const [fetchingOriginals, setFetchingOriginals] = useState(false);
  const [origFetchProgress, setOrigFetchProgress] = useState({ current: 0, total: 0 });
  const [exported, setExported]         = useState(false);
  const [cachedZip, setCachedZip]       = useState<CachedZip | null>(null);
  const sessionZipId = useRef(`folder-zip-${Date.now()}`).current;
  const [showPaymentGate, setShowPaymentGate] = useState(false);
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [compareGroupId, setCompareGroupId] = useState<string | null>(null);
  const [modalPhotoId, setModalPhotoId]     = useState<string | null>(null);

  // 중복 정보: folderSessionId → Map<photoId, DupeMatch>
  const [dupeMap, setDupeMap] = useState<Map<string, Map<string, DupeMatch>>>(new Map());

  const analysisStarted = useRef(false);
  const sessionClusters = useRef<Map<string, PersonCluster>[]>([]);

  // ── 분석 실행 (폴더 순차 처리) ──────────────────────────────────────────
  useEffect(() => {
    if (analysisStarted.current) return;
    if (folderSessions.length === 0) return;
    analysisStarted.current = true;

    // 30일 이상 된 과거 지문 정리 (조용히)
    clearOldHashes(30).catch(() => {});

    (async () => {
      // 과거 지문 한 번만 로드
      const pastRecords = await loadPastHashes().catch(() => []);
      const completedResults: Awaited<ReturnType<typeof analyzePhotos>>[] = [];

      for (const session of folderSessions) {
        if (session.status !== "pending") continue;
        updateSession(session.id, { status: "analyzing", progress: 0, stage: "loadingModel" });

        try {
          const result = await analyzePhotos(
            session.files,
            "portrait",
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

          completedResults.push(result);
          sessionClusters.current.push(result.personClusters);

          // §16 HIGH — Drive 소스 세션: 분석 후 PhotoEntry에 driveFileId 등 주입
          let enrichedPhotos = result.photos;
          if (session.source === "google_drive" && session.driveItems && session.driveItems.length > 0) {
            const driveByName = new Map(session.driveItems.map((it) => [it.name, it]));
            enrichedPhotos = new Map(
              [...result.photos.entries()].map(([pid, photo]) => {
                const driveItem = driveByName.get(photo.file?.name ?? "");
                if (!driveItem) return [pid, photo];
                return [pid, {
                  ...photo,
                  driveFileId: driveItem.id,
                  driveThumbnailUrl: driveItem.thumbnailLink,
                  driveOriginalUrl: `https://www.googleapis.com/drive/v3/files/${driveItem.id}?alt=media`,
                  isOriginalDownloaded: false,
                }];
              }),
            );
            // 썸네일 분석 절감량 토스트
            const totalOrigBytes = session.driveItems.reduce(
              (s, it) => s + parseInt(it.size ?? "0", 10), 0,
            );
            if (totalOrigBytes > 0) {
              const savedMB = (totalOrigBytes / 1024 / 1024).toFixed(1);
              const thumbed = [...enrichedPhotos.values()].filter((p) => p.driveFileId && !p.isOriginalDownloaded).length;
              showToast(`☁ Drive 썸네일 분석 완료 — 원본 ${savedMB}MB (${thumbed}장) 절약`, "✅");
            }
          }

          updateSession(session.id, {
            status: "done",
            progress: 1,
            stage: "done",
            photos: enrichedPhotos,
            groups: result.groups,
          });

          // 이 폴더의 중복 검사
          if (pastRecords.length > 0) {
            const allPhotos = [...result.photos.values()];
            const dupes = findPastDupes(allPhotos, pastRecords);
            if (dupes.size > 0) {
              setDupeMap((prev) => {
                const next = new Map(prev);
                next.set(session.id, dupes);
                return next;
              });
            }
          }
        } catch (err) {
          console.error(`[FolderGallery] ${session.folderName} 분석 실패:`, err);
          updateSession(session.id, {
            status: "error",
            errorMessage: err instanceof Error ? err.message : "알 수 없는 오류",
          });
        }
      }

      // 세션 통계 기록 (닉네임 캡처 모달 트리거 포함)
      {
        const processed = completedResults.reduce((sum, r) => sum + r.photos.size, 0);
        const selected  = completedResults.reduce((sum, r) => sum + [...r.photos.values()].filter((p) => p.isSelected).length, 0);
        recordSession({ processed, selected, flow: (flow === "B" || flow === "C") ? flow : "C" });
        if (shouldShowNicknameModal()) setShowNicknameModal(true);
      }

      // 인물 클러스터 병합
      if (sessionClusters.current.length > 0) {
        const merged = mergePersonClusters(sessionClusters.current);
        setPersonClusters(merged);
        // 인물이 2명 이상 감지되면 주인공 선택 화면으로 (항상 활성)
        if (merged.size >= 2) {
          setStep("personSelect");
        }
      }
    })();
  // 마운트 1회만 실행
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 탭 변경 시 뷰를 "selected"로 초기화
  const handleTabChange = (idx: number) => {
    setActiveTab(idx);
    setGalleryView("selected");
  };

  const allDone = folderSessions.length > 0 &&
    folderSessions.every((s) => s.status === "done" || s.status === "error");

  const totalSelected = folderSessions.reduce((acc, s) =>
    acc + [...s.photos.values()].filter((p) => p.isSelected).length, 0);

  // ── 사진 선택/해제 토글 ───────────────────────────────────────────────────
  const togglePhoto = useCallback((session: FolderSession, photo: PhotoEntry) => {
    updateSession(session.id, {
      photos: new Map(
        [...session.photos.entries()].map(([id, p]) =>
          [id, p.id === photo.id ? { ...p, isSelected: !p.isSelected } : p]
        )
      ),
    });
  }, [updateSession]);

  // ── §16 원본 다운로드 훅 — ZIP 확정 전 Drive 썸네일 사진의 원본 획득 ────────
  const fetchDriveOriginals = useCallback(async (): Promise<boolean> => {
    // 선택된 Drive 사진 중 원본 미다운로드 목록
    const pending: Array<{ sessionId: string; photo: PhotoEntry }> = [];
    for (const session of folderSessions) {
      if (session.source !== "google_drive" || session.status !== "done") continue;
      for (const photo of session.photos.values()) {
        if (photo.isSelected && photo.driveFileId && !photo.isOriginalDownloaded) {
          pending.push({ sessionId: session.id, photo });
        }
      }
    }
    if (pending.length === 0) return true;

    // 토큰 확보 (전역 캐시 → 만료 시 재발급)
    let token = driveToken;
    try {
      if (!token) {
        token = await getGoogleAccessToken();
        setDriveToken(token);
      }
    } catch {
      showToast("Drive 인증 실패 — 썸네일로 ZIP을 생성합니다", "⚠️");
      return false;
    }

    setFetchingOriginals(true);
    setOrigFetchProgress({ current: 0, total: pending.length });

    let success = 0;
    for (let i = 0; i < pending.length; i++) {
      const { sessionId, photo } = pending[i];
      try {
        const origFile = await downloadDriveOriginal(
          { id: photo.driveFileId!, name: photo.file?.name ?? photo.driveFileId!, mimeType: photo.file?.type ?? "image/jpeg" },
          token!,
        );
        // 세션 photos 갱신
        const session = folderSessions.find((s) => s.id === sessionId);
        if (session) {
          updateSession(sessionId, {
            photos: new Map(
              [...session.photos.entries()].map(([pid, p]) =>
                pid === photo.id
                  ? [pid, { ...p, file: origFile, isOriginalDownloaded: true }]
                  : [pid, p]
              ),
            ),
          });
        }
        success++;
      } catch {
        // 실패 시 기존 썸네일로 폴백 (ZIP에 포함됨)
      }
      setOrigFetchProgress({ current: i + 1, total: pending.length });
    }

    setFetchingOriginals(false);
    if (success < pending.length) {
      showToast(`원본 ${pending.length - success}장 다운로드 실패 — 썸네일로 대체됩니다`, "⚠️");
    }
    return true;
  }, [folderSessions, driveToken, setDriveToken, updateSession]);

  // ── ZIP 내보내기 ───────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    if (exporting || fetchingOriginals) return;

    const selCount = folderSessions.reduce((sum, s) =>
      sum + [...s.photos.values()].filter((p) => p.isSelected).length, 0);

    const paymentEnabled = import.meta.env.VITE_FEATURE_PAYMENT === "true";
    if (paymentEnabled && !isPaid && selCount > freeZipLimit) {
      setShowPaymentGate(true);
      return;
    }

    // §16 — Drive 원본 받기 훅 (선택 확정 시점)
    await fetchDriveOriginals();

    setExporting(true);
    setExported(false);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      let freeRemaining = isPaid ? Infinity : freeZipLimit;

      // ZIP 생성 + 저장할 해시 수집
      const toSave: Array<{ hash: bigint; filename: string }> = [];
      const sessionId = `folder-${Date.now()}`;

      for (const session of folderSessions) {
        if (session.status !== "done") continue;
        const folder = zip.folder(session.folderName)!;
        for (const photo of session.photos.values()) {
          if (!photo.isSelected || !photo.file) continue;
          if (freeRemaining <= 0) break;
          if (watermarkEnabled) {
            const watermarked = await applyWatermark(photo.file);
            const baseName = photo.file.name.replace(/\.[^.]+$/, "");
            folder.file(`${baseName}_wm.jpg`, watermarked);
          } else {
            const buf = await photo.file.arrayBuffer();
            folder.file(photo.file.name, buf);
          }
          // 지문 수집 (hash가 유효한 경우만)
          if (photo.hash && photo.hash !== 0n) {
            toSave.push({ hash: photo.hash, filename: photo.file.name });
          }
          if (!isPaid) freeRemaining--;
        }
      }

      setZipPercent(0);
      const blob = await zip.generateAsync({ type: "blob" }, (meta) => {
        setZipPercent(Math.round(meta.percent));
      });
      const zipFilenameTs = `ddalgak-picks-${Date.now()}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = zipFilenameTs;
      a.click();
      URL.revokeObjectURL(url);
      // 24h 재다운로드 캐시 저장 (fire-and-forget)
      saveZip(sessionZipId, blob, zipFilenameTs).then(() => {
        loadZip(sessionZipId).then(setCachedZip);
      }).catch(() => {});
      setExported(true);
      setZipPercent(0);

      // 지문 저장 (비동기, 실패해도 무시)
      savePastSelections(toSave, sessionId).catch(() => {});

      // ZIP 완료 토스트 (닉네임 + hero 이름 포함)
      {
        const { nickname, honorific } = loadProfile();
        const namePrefix = nickname ? `${nickname}${honorific ?? "님"}, ` : "";
        const count = folderSessions.reduce((sum, s) => sum + [...s.photos.values()].filter((p) => p.isSelected).length, 0);
        const heroIds = heroConfig.selectedPersonIds;
        const heroNames = heroIds
          .map((id) => personClusters.get(id)?.displayName)
          .filter(Boolean) as string[];
        const heroSuffix = heroNames.length > 0 ? ` 〈${heroNames.join(", ")}〉 중심` : "";
        showToast(`${namePrefix}${count}장${heroSuffix} ZIP 저장 완료`, "💾");
      }
    } catch (err) {
      console.error("[FolderGallery] ZIP 생성 실패:", err);
    } finally {
      setExporting(false);
    }
  }, [folderSessions, exporting, fetchingOriginals, isPaid, watermarkEnabled, freeZipLimit, fetchDriveOriginals]);

  // ── 현재 탭 세션 ──────────────────────────────────────────────────────────
  const activeSession = folderSessions[activeTab] as FolderSession | undefined;

  // 모달 사진 (Map에서 직접 조회)
  const modalPhoto: PhotoEntry | null =
    modalPhotoId && activeSession
      ? (activeSession.photos.get(modalPhotoId) ?? null)
      : null;

  // 같은 세션 내 그룹 베스트 (Map API 사용)
  const getGroupBestInSession = useCallback((photoId: string): PhotoEntry | undefined => {
    if (!activeSession) return undefined;
    const photo = activeSession.photos.get(photoId);
    if (!photo) return undefined;
    const grp = activeSession.groups.find((g) => g.id === photo.groupId);
    if (!grp || !grp.selectedId || grp.selectedId === photoId) return undefined;
    return activeSession.photos.get(grp.selectedId);
  }, [activeSession]);

  // 갤러리 뷰에 따른 사진 목록
  const allSessionPhotos = activeSession
    ? [...activeSession.photos.values()]
    : [];
  const selectedPhotos = allSessionPhotos.filter((p) => p.isSelected);
  const excludedPhotos = allSessionPhotos.filter((p) => !p.isSelected);

  const visiblePhotos =
    galleryView === "selected" ? selectedPhotos :
    galleryView === "excluded" ? excludedPhotos :
    allSessionPhotos;

  const sessionDupes = activeSession ? (dupeMap.get(activeSession.id) ?? new Map()) : new Map<string, DupeMatch>();

  // Map from photoId → group (for group badge + compare button)
  const photoGroupMap = new Map<string, PhotoGroup>();
  if (activeSession) {
    for (const group of activeSession.groups) {
      for (const pid of group.photoIds) {
        photoGroupMap.set(pid, group);
      }
    }
  }

  /** F5: swap best-shot within a group (select chosen, deselect others in same group) */
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const swapGroupBest = useCallback((groupId: string, newBestId: string) => {
    if (!activeSession) return;
    const group = activeSession.groups.find((g) => g.id === groupId);
    if (!group) return;
    const groupPhotoIds = new Set(group.photoIds);
    updateSession(activeSession.id, {
      photos: new Map(
        [...activeSession.photos.entries()].map(([id, p]) => {
          if (groupPhotoIds.has(id)) {
            return [id, { ...p, isSelected: id === newBestId }];
          }
          return [id, p];
        })
      ),
      groups: activeSession.groups.map((g) =>
        g.id === groupId ? { ...g, selectedId: newBestId } : g
      ),
    });
  }, [activeSession, updateSession]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>

      {/* ── 헤더 ── */}
      <div style={{
        position: "sticky", top: isFreeBeta() ? 28 : 0, zIndex: 100,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "14px 24px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg)",
      }}>
        <button className="btn-secondary" style={{ padding: "6px 14px", fontSize: 13 }}
          onClick={() => setStep("folderUpload")}>
          ← 뒤로
        </button>
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--accent2)" }}>폴더 묶음 셀렉</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {allDone && totalSelected > 0 && (
            <button
              className="btn-primary"
              style={{ fontSize: 13, padding: "7px 16px" }}
              onClick={handleExport}
              disabled={exporting || fetchingOriginals}
            >
              {fetchingOriginals
                ? `원본 받는 중... ${origFetchProgress.current}/${origFetchProgress.total}`
                : exporting
                  ? (zipPercent > 0 ? `ZIP 만드는 중... ${zipPercent}%` : "ZIP 생성 중…")
                  : exported ? "✓ 완료." : isFreeBeta() ? FREE_BETA_COPY.downloadButton : `ZIP 저장 (${totalSelected}장)`}
            </button>
          )}
          <LangToggle />
        </div>
      </div>

      {/* ── 폴더 탭 바 ── */}
      <div style={{
        display: "flex", gap: 0, overflowX: "auto",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg2)",
        scrollbarWidth: "none",
      }}>
        {folderSessions.map((session, idx) => {
          const done     = session.status === "done";
          const error    = session.status === "error";
          const analyzing = session.status === "analyzing";
          const selCount = done
            ? [...session.photos.values()].filter((p) => p.isSelected).length
            : 0;

          return (
            <button
              key={session.id}
              onClick={() => handleTabChange(idx)}
              style={{
                padding: "12px 20px", fontSize: 13,
                fontWeight: activeTab === idx ? 700 : 500,
                color: activeTab === idx ? "var(--accent2)" : "var(--text2)",
                background: "transparent", border: "none",
                borderBottom: `2.5px solid ${activeTab === idx ? "var(--accent)" : "transparent"}`,
                cursor: "pointer", whiteSpace: "nowrap",
                transition: "color 0.15s",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <span>
                {error ? "⚠️" : analyzing ? "⏳" : done ? "✓" : "⏸"}{" "}
                {session.folderName}
              </span>
              {done && (
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "2px 6px",
                  borderRadius: "var(--radius-md)",
                  background: "rgba(45,67,86,0.15)",
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
      <div style={{ flex: 1, padding: "20px 20px 100px", maxWidth: 900, width: "100%", margin: "0 auto" }}>
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
            <div style={{
              width: "100%", maxWidth: 360, margin: "0 auto",
              height: 6, background: "var(--border)", borderRadius: "var(--radius-sm)", overflow: "hidden",
            }}>
              <div style={{
                height: "100%",
                width: `${Math.round(activeSession.progress * 100)}%`,
                background: "linear-gradient(90deg, var(--accent), var(--accent2))",
                transition: "width 0.3s",
                borderRadius: "var(--radius-sm)",
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
              display: "flex", alignItems: "center", gap: 12, marginBottom: 16,
              padding: "12px 16px", borderRadius: "var(--radius-md)",
              background: "rgba(45,67,86,0.08)",
              border: "1px solid rgba(45,67,86,0.2)",
            }}>
              <div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "3px 8px",
                  borderRadius: "var(--radius-sm)",
                  background: "rgba(45,67,86,0.15)",
                  color: "var(--accent2)",
                  marginRight: 8,
                }}>
                  {EVENT_TAG_LABELS[activeSession.eventTag]}
                </span>
                <span style={{ fontWeight: 700 }}>{activeSession.folderName}</span>
              </div>
              <div style={{ marginLeft: "auto", fontSize: 13, color: "var(--text-secondary)" }}>
                <MonoNumber value={activeSession.files.length} /> →{" "}
                <MonoNumber
                  value={selectedPhotos.length}
                  style={{ color: "var(--accent)", fontWeight: 600 }}
                />
              </div>
            </div>

            {/* ── 갤러리 뷰 탭 ── */}
            <div style={{
              display: "flex", gap: 0, marginBottom: 16,
              background: "var(--bg2)", borderRadius: "var(--radius-md)", padding: 4,
              width: "fit-content",
            }}>
              {(["selected", "excluded", "all"] as GalleryView[]).map((view) => {
                const label =
                  view === "selected" ? `선택됨 (${selectedPhotos.length})` :
                  view === "excluded" ? `제외됨 (${excludedPhotos.length})` :
                  `전체 (${allSessionPhotos.length})`;
                const isActive = galleryView === view;
                return (
                  <button
                    key={view}
                    onClick={() => setGalleryView(view)}
                    style={{
                      padding: "6px 14px", fontSize: 12, fontWeight: isActive ? 700 : 500,
                      borderRadius: "var(--radius-lg)", border: "none", cursor: "pointer",
                      background: isActive ? "var(--accent)" : "transparent",
                      color: isActive ? "#fff" : "var(--text2)",
                      transition: "all 0.15s",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* ── 사진 그리드 ── */}
            {visiblePhotos.length > 0 ? (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                gap: 8,
              }}>
                {visiblePhotos.map((photo) => {
                  const dupe = sessionDupes.get(photo.id);
                  const isSelected = photo.isSelected;

                  const photoGroup = photoGroupMap.get(photo.id);
                  return (
                    <div
                      key={photo.id}
                      onClick={() => setModalPhotoId(photo.id)}
                      style={{
                        position: "relative",
                        borderRadius: 8,
                        overflow: "hidden",
                        aspectRatio: "1",
                        background: "var(--bg3)",
                        border: `2px solid ${isSelected ? "rgba(45,67,86,0.5)" : "rgba(128,128,160,0.2)"}`,
                        cursor: "pointer",
                        opacity: isSelected ? 1 : 0.6,
                        transition: "opacity 0.15s, border-color 0.15s",
                      }}
                    >
                      <img
                        src={photo.thumbnail}
                        alt={photo.file?.name ?? photo.id}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        loading="lazy"
                      />

                      {/* 선택 여부 오버레이 */}
                      <div style={{
                        position: "absolute", top: 5, left: 5,
                        width: 18, height: 18, borderRadius: "50%",
                        background: isSelected ? "var(--accent)" : "rgba(0,0,0,0.5)",
                        border: "1.5px solid rgba(255,255,255,0.7)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, color: "#fff",
                      }}>
                        {isSelected ? "✓" : ""}
                      </div>

                      {/* 품질 배지 */}
                      <div style={{
                        position: "absolute", bottom: 4, right: 4,
                        fontSize: 10, fontWeight: 700, padding: "2px 5px",
                        borderRadius: "var(--radius-md)",
                        background: photo.confidence === "HIGH"
                          ? "rgba(0,200,100,0.85)"
                          : photo.confidence === "MEDIUM"
                            ? "rgba(255,180,0,0.85)"
                            : "rgba(200,80,80,0.85)",
                        color: "#fff",
                      }}>
                        {photo.confidence === "HIGH" ? "HIGH" : photo.confidence === "MEDIUM" ? "MED" : "LOW"}
                      </div>

                      {/* 중복 배지 */}
                      {dupe && (
                        <div style={{
                          position: "absolute", top: 4, right: 4,
                          fontSize: 10, fontWeight: 700, padding: "2px 5px",
                          borderRadius: "var(--radius-md)",
                          background: "rgba(251,191,36,0.9)",
                          color: "#1a1000",
                          maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}
                          title={`이전 세션 사용됨: ${dupe.matchedFilename}`}
                        >
                          이전
                        </div>
                      )}

                      {/* 감점 사유 배지 (제외됨/전체 탭) */}
                      {!isSelected && photo.deductions && photo.deductions.length > 0 && (
                        <div style={{
                          position: "absolute", bottom: 24, left: 0, right: 0,
                          display: "flex", gap: 3, flexWrap: "wrap", padding: "0 4px",
                          justifyContent: "center",
                        }}>
                          {photo.deductions.slice(0, 2).map((code) => (
                            <span key={code} style={{
                              fontSize: 9, fontWeight: 700, padding: "1px 5px",
                              borderRadius: "var(--radius-md)",
                              background: "rgba(239,68,68,0.85)",
                              color: "#fff",
                            }}>
                              {DEDUCTION_LABELS[code] ?? code}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* 그룹 배지 — N장 중 1장 */}
                      {photoGroup && photoGroup.photoIds.length > 1 && (
                        <div
                          onClick={(e) => { e.stopPropagation(); setCompareGroupId(photoGroup.id); }}
                          title="유사 컷 비교"
                          style={{
                            position: "absolute", top: 4, right: dupe ? 28 : 4,
                            fontSize: 9, fontWeight: 700, padding: "2px 5px",
                            borderRadius: "var(--radius-md)",
                            background: "rgba(45,67,86,0.85)",
                            color: "#fff",
                            cursor: "pointer",
                          }}
                        >
                          {photoGroup.photoIds.length}컷
                        </div>
                      )}

                      {/* 우하단 ±  버튼 — 즉시 토글 (stopPropagation으로 모달 방지) */}
                      <button
                        onClick={(e) => { e.stopPropagation(); togglePhoto(activeSession, photo); }}
                        aria-label={isSelected ? "선택에서 빼기" : "선택에 다시 넣기"}
                        style={{
                          position: "absolute", bottom: 6, right: 6, zIndex: 2,
                          width: 24, height: 24,
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border-subtle)",
                          background: "rgba(13, 15, 18, 0.72)",
                          color: isSelected ? "var(--text-secondary)" : "var(--accent)",
                          fontFamily: "var(--font-mono)",
                          fontSize: 14,
                          cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          touchAction: "manipulation",
                        }}
                      >
                        {isSelected ? "−" : "+"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text2)" }}>
                {galleryView === "selected" && "선별된 사진이 없습니다"}
                {galleryView === "excluded" && "제외된 사진이 없습니다"}
                {galleryView === "all" && "사진이 없습니다"}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 하단 전체 요약 + 액션 버튼 ── */}
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
            {isFreeBeta() && (
              <div style={{
                marginTop: 2, fontSize: 11,
                color: "var(--text-tertiary)",
                fontFamily: "var(--font-sans)", fontStyle: "normal",
              }}>
                {FREE_BETA_COPY.helperLine}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, flexShrink: 0, alignItems: "center" }}>
            {cachedZip && (
              <button
                className="btn-secondary"
                style={{ fontSize: 12, padding: "8px 14px" }}
                onClick={() => {
                  const url = URL.createObjectURL(cachedZip.blob);
                  const a = document.createElement("a");
                  a.href = url; a.download = cachedZip.filename; a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                방금 만든 ZIP 다시 받기 — {(cachedZip.size / 1024 / 1024).toFixed(1)}MB
              </button>
            )}
            <button
              className="btn-secondary"
              style={{ fontSize: 13, padding: "9px 18px" }}
              onClick={handleExport}
              disabled={exporting || fetchingOriginals || totalSelected === 0}
            >
              {fetchingOriginals
                ? `원본 받는 중... ${origFetchProgress.current}/${origFetchProgress.total}`
                : exporting
                  ? (zipPercent > 0 ? `ZIP 만드는 중... ${zipPercent}%` : "ZIP 생성 중…")
                  : exported ? "✓ 완료." : isFreeBeta() ? FREE_BETA_COPY.downloadButton : "ZIP 저장"}
            </button>
            {flow === "B" && (
              <button
                className="btn-primary"
                style={{ fontSize: 14, padding: "10px 22px" }}
                onClick={() => setStep("album")}
                disabled={totalSelected === 0}
              >
                📖 앨범 배치하기 →
              </button>
            )}
          </div>
        </div>
      )}

      {showPaymentGate && (
        <PaymentGate
          onClose={() => setShowPaymentGate(false)}
          onSuccess={() => { setShowPaymentGate(false); handleExport(); }}
        />
      )}

      {/* Nickname capture modal */}
      {showNicknameModal && (
        <NicknameCaptureModal onClose={() => setShowNicknameModal(false)} />
      )}

      {/* Group compare modal */}
      {compareGroupId && activeSession && (() => {
        const grp = activeSession.groups.find((g) => g.id === compareGroupId);
        return grp ? (
          <GroupCompareModal
            group={grp}
            photos={activeSession.photos}
            onSwap={(gid, pid) => swapGroupBest(gid, pid)}
            onClose={() => setCompareGroupId(null)}
          />
        ) : null;
      })()}

      {/* 사진 상세 모달 — Flow B/C 메인 누락 해소 (PHASE1_PLAN ⑥) */}
      {modalPhoto && activeSession && (
        <PhotoDetailModal
          photo={modalPhoto}
          allPhotos={[...activeSession.photos.values()]}
          groupBestPhoto={getGroupBestInSession(modalPhoto.id)}
          onClose={() => setModalPhotoId(null)}
          onNavigate={(id) => setModalPhotoId(id)}
          onToggleSelect={(id) => {
            const p = activeSession.photos.get(id);
            if (p) togglePhoto(activeSession, p);
          }}
          onJumpToGroupBest={() => {
            const best = getGroupBestInSession(modalPhoto.id);
            if (best) setModalPhotoId(best.id);
          }}
        />
      )}
    </div>
  );
}
