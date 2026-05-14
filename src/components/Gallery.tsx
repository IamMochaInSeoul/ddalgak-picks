import { useState, useCallback, useEffect, useRef } from "react";
import { useT } from "../lib/i18n";
import { useStore } from "../lib/store";
import { analyzePhotos } from "../lib/analyzer";
import type { PhotoEntry, PhotoGroup } from "../lib/types";
import PhotoCard from "./PhotoCard";
import PhotoModal from "./PhotoModal";
import PhotoDetailModal from "./PhotoDetailModal";
import GalleryThemeToggle, { useGalleryTheme } from "./GalleryThemeToggle";
import LangToggle from "./LangToggle";
import PaymentGate from "./PaymentGate";
import NicknameCaptureModal from "./NicknameCaptureModal";
import UserAddress from "./UserAddress";
import GroupCompareModal from "./GroupCompareModal";
import { applyWatermark } from "../lib/watermark";
import { assignDisplayNames, zipFilename } from "../lib/displayName";
import { showToast } from "./Toast";
import { sampleFeedbackPhotos } from "../lib/feedbackLearning";
import { clearSession } from "../lib/sessionPersist";
import { shouldShowNicknameModal, loadProfile } from "../lib/userProfile";
import { isFreeBeta, FREE_BETA_COPY } from "../lib/freeBetaConfig";
import { saveZip, loadZip, type CachedZip } from "../lib/zipManager";
import { track } from "../lib/analytics";

// 제외 사유 그룹 정의
const EXCLUSION_GROUPS: { key: string; label: string; emoji: string; codes: string[] }[] = [
  { key: "eye",    label: "눈 감음",        emoji: "", codes: ["EYE_CLOSED", "EYE_REGION_DARK"] },
  { key: "blur",   label: "흔들림·초점",    emoji: "", codes: ["BLUR", "BLUR_NOISE"] },
  { key: "side",   label: "측면 얼굴",      emoji: "", codes: ["SIDE_FACE"] },
  { key: "noface", label: "인물 감지 불가", emoji: "", codes: ["NO_SUBJECT", "LOW_CONFIDENCE"] },
  { key: "other",  label: "기타 제외",      emoji: "", codes: [] },   // catch-all
  // Info-only codes (not shown in exclusion tabs)
  // EYE_SQUINT_SMILE, BLUR_AESTHETIC_BOKEH — no exclusion, informational only
];

function getExclusionGroupKey(deductions: string[]): string {
  for (const g of EXCLUSION_GROUPS.slice(0, -1)) {
    if (deductions.some((d) => g.codes.includes(d))) return g.key;
  }
  return "other";
}

export default function Gallery() {
  const t = useT("gallery");
  const tExport = useT("export");
  const [galleryTheme, setGalleryTheme] = useGalleryTheme();

  const photos = useStore((s) => s.photos);
  const groups = useStore((s) => s.groups);
  const targetCount = useStore((s) => s.targetCount);
  const weights = useStore((s) => s.weights);
  const petWeights = useStore((s) => s.petWeights);
  const filters = useStore((s) => s.filters);
  const photoType = useStore((s) => s.photoType);
  const reextractCount = useStore((s) => s.reextractCount);
  const maxPerGroup = useStore((s) => s.maxPerGroup);
  const setFilters = useStore((s) => s.setFilters);
  const setWeights = useStore((s) => s.setWeights);
  const setMaxPerGroup = useStore((s) => s.setMaxPerGroup);
  const setPhotos = useStore((s) => s.setPhotos);
  const setGroups = useStore((s) => s.setGroups);
  const incrementReextract = useStore((s) => s.incrementReextract);
  const setStep = useStore((s) => s.setStep);
  const setAnalysisProgress = useStore((s) => s.setAnalysisProgress);
  const setGroupSelected = useStore((s) => s.setGroupSelected);
  const togglePhotoSelected = useStore((s) => s.togglePhotoSelected);

  // 세션 지속성
  const filesDetached  = useStore((s) => s.filesDetached);
  const reattachFiles  = useStore((s) => s.reattachFiles);
  const setFilesDetached = useStore((s) => s.setFilesDetached);

  // 취향 재추출
  const groupScoresWithScene = useStore((s) => s.groupScoresWithScene);
  const preferenceSelected   = useStore((s) => s.preferenceSelected);
  const preferenceWeights    = useStore((s) => s.preferenceWeights);
  const bannerDismissed      = useStore((s) => s.bannerDismissed);
  const enterFeedbackMode    = useStore((s) => s.enterFeedbackMode);
  const dismissBanner        = useStore((s) => s.dismissBanner);
  const clearPreference      = useStore((s) => s.clearPreference);

  const isPaid = useStore((s) => s.payment.isPaid);
  const watermarkEnabled = useStore((s) => s.watermarkEnabled);
  const freeZipLimit = useStore((s) => s.freeZipLimit);
  const personClusters = useStore((s) => s.personClusters);
  const heroConfig = useStore((s) => s.heroConfig);

  const [exporting, setExporting] = useState(false);
  const [zipPercent, setZipPercent] = useState(0);
  const [exported, setExported] = useState(false);
  const [cachedZip, setCachedZip] = useState<CachedZip | null>(null);
  // 세션 ID — 이 갤러리 세션의 고유 키 (마운트 시 1회 생성)
  const sessionZipId = useRef(`gallery-${Date.now()}`).current;
  const [copied, setCopied] = useState(false);
  const [showPaymentGate, setShowPaymentGate] = useState(false);
  const [showNicknameModal, setShowNicknameModal] = useState(() => shouldShowNicknameModal());
  const [showPanel, setShowPanel] = useState(false);
  const [reextracting, setReextracting] = useState(false);
  const [reextractDoneCount, setReextractDoneCount] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"selected" | "excluded" | "all">("selected");
  const [preferenceView, setPreferenceView] = useState<"ai" | "preference">("ai");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [expandedExcGroup, setExpandedExcGroup] = useState<string | null>(null);
  // 플로팅 배너
  const [bannerVisible, setBannerVisible] = useState(false);
  useEffect(() => {
    if (bannerDismissed || preferenceSelected) return;
    const t = setTimeout(() => setBannerVisible(true), 5000);
    return () => clearTimeout(t);
  }, [bannerDismissed, preferenceSelected]);

  // Modal state
  const [modalPhotoId, setModalPhotoId] = useState<string | null>(null);
  const [compareGroupId, setCompareGroupId] = useState<string | null>(null);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; photoId: string } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);

  // displayName 최초 1회 할당 (선택 확정 후)
  useEffect(() => {
    const named = assignDisplayNames(photos, photoType);
    // 변경된 항목이 있을 때만 store 업데이트
    let changed = false;
    for (const [id, p] of named) {
      if (p.displayName !== photos.get(id)?.displayName) { changed = true; break; }
    }
    if (changed) setPhotos(named);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const allPhotos = [...photos.values()];
  // 취향 뷰 vs AI 기본 뷰 전환
  const activePreference = preferenceSelected && preferenceView === "preference";
  const selectedPhotos = activePreference
    ? allPhotos.filter((p) => preferenceSelected!.has(p.id))
    : allPhotos.filter((p) => p.isSelected);
  const excludedPhotos = activePreference
    ? allPhotos.filter((p) => !preferenceSelected!.has(p.id))
    : allPhotos.filter((p) => !p.isSelected);
  const canReextract = reextractCount < 5;
  const MAX_REEXTRACT = 5;

  // Close context menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    if (ctxMenu) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  }, [ctxMenu]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setCtxMenu(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // 파일 재첨부 (새로고침 후 ZIP 다운로드 복구)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleReattachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  const handleReattachChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    // window.__ddalgak_files 도 갱신해서 재추출도 가능하게
    (window as unknown as Record<string, unknown>).__ddalgak_files = files;
    reattachFiles(files);
    // 모두 매칭되면 detached 해제 & 저장 클리어
    setFilesDetached(false);
    clearSession().catch(() => {});
    e.target.value = "";
  }, [reattachFiles, setFilesDetached]);

  const handlePhotoClick = useCallback((photoId: string) => {
    track({ name: "photo_modal_open" });
    setModalPhotoId(photoId);
  }, []);

  // 같은 그룹의 베스트 사진 반환 (그룹 베스트 점프용)
  const getGroupBest = useCallback((photoId: string): PhotoEntry | undefined => {
    const photo = photos.get(photoId);
    if (!photo) return undefined;
    const grp = groups.find((g) => g.id === photo.groupId);
    if (!grp || !grp.selectedId || grp.selectedId === photoId) return undefined;
    return photos.get(grp.selectedId);
  }, [photos, groups]);

  const handleContextMenu = useCallback((e: React.MouseEvent, photoId: string) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, photoId });
  }, []);

  const handleReextract = useCallback(async () => {
    if (!canReextract || reextracting) return;
    const files = (window as unknown as Record<string, unknown>).__ddalgak_files as File[] | undefined;
    if (!files || !photoType) return;
    track({ name: "reextract_start", params: { attempt: reextractCount + 1 } });
    setReextracting(true);
    setReextractDoneCount(null);
    incrementReextract();
    try {
      const result = await analyzePhotos(files, photoType, targetCount, weights, petWeights, filters,
        (current, total, stageKey) => setAnalysisProgress(current, total, stageKey), maxPerGroup);
      setPhotos(result.photos);
      setGroups(result.groups);
      // 완료된 선택 장수 계산 후 toast 표시 (3초)
      const selectedCount = [...result.photos.values()].filter((p) => p.isSelected).length;
      setReextractDoneCount(selectedCount);
      showToast(`${selectedCount}장 재선별 완료!`, "🔄");
      setTimeout(() => setReextractDoneCount(null), 3000);
    } catch (err) { console.error(err); }
    finally { setReextracting(false); }
  }, [canReextract, reextracting, photoType, targetCount, weights, petWeights, filters, maxPerGroup,
      incrementReextract, setPhotos, setGroups, setAnalysisProgress]);

  const paymentEnabled = import.meta.env.VITE_FEATURE_PAYMENT === "true";

  const handleExport = useCallback(async () => {
    // 결제 기능 활성 + 미결제 + 초과 시에만 게이트 표시
    if (paymentEnabled && !isPaid && selectedPhotos.length > freeZipLimit) {
      setShowPaymentGate(true);
      return;
    }
    track({ name: "zip_download_attempt", params: { photo_count: selectedPhotos.length } });
    setExporting(true);
    try {
      // 결제 비활성(무료 베타) 또는 유료 사용자는 전량 내보내기
      const photosToExport = (paymentEnabled && !isPaid) ? selectedPhotos.slice(0, freeZipLimit) : selectedPhotos;
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const folder = zip.folder("ddalgak-picks")!;
      for (const photo of photosToExport) {
        if (watermarkEnabled) {
          const watermarked = await applyWatermark(photo.file);
          folder.file(zipFilename(photo, true), watermarked);
        } else {
          const buf = await photo.file.arrayBuffer();
          folder.file(zipFilename(photo, false), buf);
        }
      }
      setZipPercent(0);
      const blob = await zip.generateAsync({ type: "blob" }, (meta) => {
        setZipPercent(Math.round(meta.percent));
      });
      const zipFilenameTs = `ddalgak-picks-${Date.now()}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = zipFilenameTs; a.click();
      URL.revokeObjectURL(url);
      // 24h 재다운로드 캐시 저장 (fire-and-forget)
      saveZip(sessionZipId, blob, zipFilenameTs).then(() => {
        loadZip(sessionZipId).then(setCachedZip);
      }).catch(() => {});
      track({ name: "zip_download_complete", params: {
        photo_count: photosToExport.length,
        size_mb: parseFloat((blob.size / 1024 / 1024).toFixed(1)),
      }});
      setExported(true);
      setZipPercent(0);
      const { nickname, honorific } = loadProfile();
      const namePrefix = nickname ? `${nickname}${honorific ?? "님"}, ` : "";
      const sizeMB = (blob.size / 1024 / 1024).toFixed(0);
      showToast(`${namePrefix}${photosToExport.length}장 · ${sizeMB}MB ZIP 저장 완료`, "✓");
    } catch (err) { console.error(err); }
    finally { setExporting(false); }
  }, [selectedPhotos, isPaid, freeZipLimit, watermarkEnabled]);

  const handleCopyFileList = useCallback(() => {
    const names = selectedPhotos.map((p) => p.displayName ?? p.file.name).join("\n");
    navigator.clipboard.writeText(names).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }, [selectedPhotos]);

  const confidenceBadgeClass = (grade: PhotoEntry["confidence"]) =>
    grade === "HIGH" ? "badge-high" : grade === "MEDIUM" ? "badge-medium" : "badge-low";
  const confidenceLabel = (grade: PhotoEntry["confidence"]) =>
    grade === "HIGH" ? t("high") : grade === "MEDIUM" ? t("medium") : t("low");

  const groupsWithPhotos: Array<{ group: PhotoGroup; entries: PhotoEntry[] }> =
    groups.map((g) => ({
      group: g,
      entries: g.photoIds.map((pid) => photos.get(pid)).filter(Boolean) as PhotoEntry[],
    })).filter((g) => g.entries.length > 0);

  // 제외 사진을 감점 사유별로 그룹핑
  const exclusionBuckets = EXCLUSION_GROUPS.map((g) => ({
    ...g,
    photos: excludedPhotos.filter((p) => getExclusionGroupKey(p.deductions) === g.key),
  })).filter((g) => g.photos.length > 0);

  // For modal navigation
  const displayedPhotos = viewMode === "selected" ? selectedPhotos
    : viewMode === "excluded" ? excludedPhotos
    : allPhotos;
  const modalPhoto = modalPhotoId ? photos.get(modalPhotoId) ?? null : null;
  const ctxPhoto = ctxMenu ? photos.get(ctxMenu.photoId) ?? null : null;

  const tabs: { key: "selected" | "excluded" | "all"; label: string }[] = [
    { key: "selected", label: `✓ 선택된 사진 (${selectedPhotos.length})` },
    { key: "excluded", label: `✕ 제외된 사진 (${excludedPhotos.length})` },
    { key: "all",      label: `전체 (${allPhotos.length})` },
  ];

  function handleOpenFeedback() {
    const samples = sampleFeedbackPhotos(photos, groupScoresWithScene, 50);
    enterFeedbackMode(samples);
    setBannerVisible(false);
  }

  return (
    <div data-theme={galleryTheme} style={{ minHeight: "100vh", background: "var(--bg-base)", color: "var(--text-primary)", paddingBottom: 80 }}>
      {/* Sticky header */}
      <div style={{ position: "sticky", top: isFreeBeta() ? 28 : 0, zIndex: 100, background: "var(--bg-base)",
        borderBottom: "1px solid var(--border-subtle)", padding: "12px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button className="btn-secondary" style={{ padding: "6px 14px", fontSize: 13 }}
            onClick={() => { setStep("landing"); useStore.getState().reset(); }}>
            ← {t("back")}
          </button>
          <span style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)" }}>딸깍픽스</span>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: canReextract ? "var(--text-secondary)" : "var(--critical)" }}>
              {canReextract ? t("reextractLeft", { count: MAX_REEXTRACT - reextractCount }) : t("reextractExhausted")}
            </span>
            <button className="btn-secondary" style={{ padding: "6px 14px", fontSize: 13, opacity: canReextract && !reextracting ? 1 : 0.4 }}
              disabled={!canReextract || reextracting} onClick={() => setShowPanel(!showPanel)}>
              조건 변경 · 재추출
            </button>
          </div>
          <GalleryThemeToggle theme={galleryTheme} onChange={setGalleryTheme} />
          <LangToggle />
        </div>

        {/* Re-extract panel */}
        {showPanel && (
          <div className="card" style={{ marginTop: 12, display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 280px" }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: "var(--text2)" }}>{t("weightPanel")}</h4>
              {photoType !== "pet" && (
                (["eyeOpen", "sharpness", "expression", "facing"] as const).map((key) => (
                  <div key={key} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                      <span>{t(key)}</span>
                      <span style={{ color: "var(--accent2)" }}>{Math.round(weights[key] * 100)}%</span>
                    </div>
                    <input type="range" min={0} max={100} step={5} value={Math.round(weights[key] * 100)}
                      onChange={(e) => setWeights({ ...weights, [key]: Number(e.target.value) / 100 })}
                      style={{ width: "100%" }} />
                  </div>
                ))
              )}
            </div>
            <div style={{ flex: "1 1 200px" }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: "var(--text2)" }}>{t("filterPanel")}</h4>
              {[
                { key: "excludeEyeClosed", label: t("excludeEyeClosed") },
                { key: "excludeBlur", label: t("excludeBlur") },
                { key: "frontOnly", label: t("frontOnly") },
                { key: "excludeLowConf", label: t("excludeLowConf") },
              ].map(({ key, label }) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer", fontSize: 13 }}>
                  <input type="checkbox" checked={filters[key as keyof typeof filters]}
                    onChange={(e) => setFilters({ ...filters, [key]: e.target.checked })}
                    style={{ accentColor: "var(--accent)" }} />
                  {label}
                </label>
              ))}
            </div>
            <div style={{ flex: "1 1 200px" }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "var(--text2)" }}>유사 사진 최대 허용</h4>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[
                  { label: "1장", value: 1 }, { label: "2장", value: 2 }, { label: "3장", value: 3 },
                  { label: "5장", value: 5 }, { label: "무제한", value: 9999 },
                ].map(({ label, value }) => (
                  <button key={value} onClick={() => setMaxPerGroup(value)}
                    style={{ padding: "5px 10px", borderRadius: "var(--radius-lg)", fontSize: 12,
                      border: `2px solid ${maxPerGroup === value ? "var(--accent)" : "var(--border)"}`,
                      background: maxPerGroup === value ? "rgba(10, 10, 11,0.15)" : "transparent",
                      color: maxPerGroup === value ? "var(--accent2)" : "var(--text2)",
                      fontWeight: 600, cursor: "pointer" }}>{label}</button>
                ))}
              </div>
            </div>
            <div style={{ flex: "1 1 100%", display: "flex", justifyContent: "flex-end" }}>
              <button className="btn-primary" disabled={!canReextract || reextracting}
                onClick={() => { setShowPanel(false); handleReextract(); }}>
                {reextracting ? "분석 중..." : t("reextract")}
              </button>
            </div>
          </div>
        )}

        {/* 취향 결과 비교 토글 */}
        {preferenceSelected && (
          <div style={{
            marginTop: 10, padding: "8px 12px", borderRadius: "var(--radius-md)",
            background: "rgba(107,139,90,0.08)", border: "1px solid rgba(107,139,90,0.3)",
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#16a34a" }}>내 취향 반영됨</span>
            <div style={{ display: "flex", gap: 4 }}>
              {(["ai", "preference"] as const).map((v) => (
                <button key={v} onClick={() => setPreferenceView(v)}
                  style={{
                    padding: "4px 12px", borderRadius: "var(--radius-md)", fontSize: 12, cursor: "pointer",
                    border: `1.5px solid ${preferenceView === v ? "#16a34a" : "var(--border)"}`,
                    background: preferenceView === v ? "rgba(107,139,90,0.2)" : "transparent",
                    color: preferenceView === v ? "#16a34a" : "var(--text2)",
                    fontWeight: preferenceView === v ? 700 : 400,
                  }}>
                  {v === "ai" ? "AI 기본" : "내 취향"}
                </button>
              ))}
            </div>
            {preferenceWeights && (
              <div style={{ display: "flex", gap: 10, marginLeft: 4 }}>
                {(["eyeOpen", "sharpness", "expression", "facing"] as const).map((k) => {
                  const labels: Record<string, string> = { eyeOpen: "눈뜸", sharpness: "선명도", expression: "표정", facing: "정면" };
                  return (
                    <span key={k} style={{ fontSize: 11, color: "var(--text2)" }}>
                      {labels[k]} <strong style={{ color: "var(--text)" }}>{Math.round(preferenceWeights[k] * 100)}%</strong>
                    </span>
                  );
                })}
              </div>
            )}
            <button onClick={() => { clearPreference(); setPreferenceView("ai"); }}
              style={{ marginLeft: "auto", fontSize: 11, color: "var(--text2)", background: "none",
                border: "none", cursor: "pointer", textDecoration: "underline" }}>
              초기화
            </button>
          </div>
        )}

        {/* Tabs */}
        <div style={{ marginTop: 10, display: "flex", gap: 6, alignItems: "center" }}>
          {tabs.map(({ key, label }) => (
            <button key={key} onClick={() => setViewMode(key)}
              style={{
                padding: "6px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                border: `1.5px solid ${viewMode === key ? (key === "excluded" ? "#ef4444" : "var(--accent)") : "var(--border)"}`,
                background: viewMode === key
                  ? (key === "excluded" ? "rgba(239,68,68,0.12)" : "rgba(10, 10, 11,0.15)")
                  : "transparent",
                color: viewMode === key
                  ? (key === "excluded" ? "#ef4444" : "var(--accent2)")
                  : "var(--text2)",
                fontWeight: viewMode === key ? 700 : 400,
              }}>{label}</button>
          ))}
          <span style={{ fontSize: 11, color: "var(--text2)", marginLeft: 8 }}>
            💡 클릭: 상세보기 · 우클릭: 선택/제외
          </span>
        </div>
      </div>

      {/* ── 파일 재첨부 배너 (새로고침 후 복구 시) ── */}
      {filesDetached && (
        <div style={{
          margin: "12px 24px 0",
          padding: "14px 18px",
          background: "rgba(245,158,11,0.1)",
          border: "1px solid rgba(245,158,11,0.4)",
          borderLeft: "4px solid #f59e0b",
          borderRadius: "var(--radius-lg)",
          display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 22 }}>⚠</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#d97706", marginBottom: 2 }}>
              ZIP 다운로드를 하려면 원본 파일을 다시 선택해주세요
            </div>
            <div style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.5 }}>
              새로고침 후에는 브라우저 보안 정책으로 파일을 다시 불러와야 합니다.
              이전과 같은 사진 파일들을 선택해 주세요.
            </div>
          </div>
          <button
            onClick={handleReattachClick}
            style={{
              padding: "9px 20px", borderRadius: "var(--radius-lg)", border: "none", cursor: "pointer",
              background: "#f59e0b", color: "#fff",
              fontWeight: 700, fontSize: 13, whiteSpace: "nowrap",
            }}
          >
            📂 파일 다시 선택
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleReattachChange}
          />
        </div>
      )}

      {/* Main content */}
      <div style={{ padding: "24px" }}>

        {/* ── 선택된 사진 ── */}
        {viewMode === "selected" && (
          selectedPhotos.length === 0 ? (
            <div style={{ textAlign: "center", padding: 80, color: "var(--text2)" }}>선택된 사진이 없습니다</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
              {selectedPhotos.map((photo) => (
                <div key={photo.id} style={{ position: "relative" }}>
                  <PhotoCard photo={photo}
                    onDoubleClick={handlePhotoClick}
                    onContextMenu={handleContextMenu}
                  />
                  {/* 우상단 빼기 버튼 — stopPropagation으로 모달 방지 */}
                  <button
                    onClick={(e) => { e.stopPropagation(); track({ name: "photo_toggle", params: { action: "deselect" } }); togglePhotoSelected(photo.id); }}
                    aria-label="선택에서 빼기"
                    style={{
                      position: "absolute", top: 8, right: 8, zIndex: 2,
                      width: 26, height: 26,
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-subtle)",
                      background: "rgba(13, 15, 18, 0.72)",
                      color: "var(--text-secondary)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 15,
                      cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      touchAction: "manipulation",
                    }}
                  >−</button>
                </div>
              ))}
            </div>
          )
        )}

        {/* ── 제외된 사진 (감점 사유별 그룹) ── */}
        {viewMode === "excluded" && (
          excludedPhotos.length === 0 ? (
            <div style={{ textAlign: "center", padding: 80, color: "var(--text2)" }}>제외된 사진이 없습니다.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {exclusionBuckets.map((bucket) => {
                const isOpen = expandedExcGroup === bucket.key || expandedExcGroup === null;
                return (
                  <div key={bucket.key} className="card" style={{ padding: 0, overflow: "hidden" }}>
                    {/* Bucket header */}
                    <div
                      onClick={() => setExpandedExcGroup(expandedExcGroup === bucket.key ? null : bucket.key)}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "14px 18px", cursor: "pointer",
                        background: "var(--bg2)",
                        borderBottom: isOpen ? "1px solid var(--border)" : "none",
                      }}
                    >
                      <span style={{ fontSize: 22 }}>{bucket.emoji}</span>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{bucket.label}</span>
                        <span style={{ marginLeft: 10, fontSize: 13, color: "var(--text2)" }}>
                          {bucket.photos.length}장
                        </span>
                      </div>
                      <span style={{ color: "var(--text2)", fontSize: 16 }}>
                        {isOpen ? "▲" : "▼"}
                      </span>
                    </div>

                    {/* Photos grid */}
                    {isOpen && (
                      <div style={{ padding: "16px 18px" }}>
                        <p style={{ fontSize: 12, color: "var(--text2)", marginBottom: 14 }}>
                          클릭하면 상세보기 · 우클릭 또는 아래 버튼으로 선택에 포함
                        </p>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14 }}>
                          {bucket.photos.map((photo) => (
                            <div key={photo.id} style={{ position: "relative" }}>
                              <PhotoCard photo={photo}
                                onDoubleClick={handlePhotoClick}
                                onContextMenu={handleContextMenu}
                              />
                              {/* Quick-add button */}
                              <button
                                onClick={() => { track({ name: "photo_toggle", params: { action: "select" } }); togglePhotoSelected(photo.id); }}
                                style={{
                                  position: "absolute", top: 6, left: 6,
                                  background: "rgba(10, 10, 11,0.9)", color: "white",
                                  border: "none", borderRadius: "var(--radius-md)", cursor: "pointer",
                                  fontSize: 10, fontWeight: 700, padding: "3px 7px",
                                }}
                              >
                                + 선택
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ── 전체 사진 (그룹별) ── */}
        {viewMode === "all" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {groupsWithPhotos.map(({ group, entries }) => {
              const isExpanded = expandedGroup === group.id;
              const selectedEntry = entries.find((e) => e.isSelected);
              const topEntry = [...entries].sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0))[0];
              return (
                <div key={group.id} className="card" style={{ padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
                    onClick={() => setExpandedGroup(isExpanded ? null : group.id)}>
                    <img src={(selectedEntry ?? topEntry)?.thumbnail} alt=""
                      style={{ width: 60, height: 60, objectFit: "cover", borderRadius: "var(--radius-md)", border: "2px solid var(--border)" }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{entries.length}장의 유사 컷</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <span className={`badge ${confidenceBadgeClass(group.confidence)}`}>{confidenceLabel(group.confidence)}</span>
                        {selectedEntry && <span className="badge" style={{ borderColor: "var(--accent)", color: "var(--accent2)" }}>선택됨</span>}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setCompareGroupId(group.id); }}
                      style={{
                        padding: "5px 10px", fontSize: 11, fontWeight: 600,
                        background: "transparent",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-md)", cursor: "pointer",
                        color: "var(--text-secondary)",
                      }}
                    >비교</button>
                    <span style={{ color: "var(--text2)", fontSize: 18 }}>{isExpanded ? "▲" : "▼"}</span>
                  </div>
                  {isExpanded && (
                    <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
                      {[...entries].sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0)).map((photo) => (
                        <div key={photo.id} onClick={() => setGroupSelected(group.id, photo.id)} style={{ cursor: "pointer" }}>
                          <PhotoCard photo={photo} compact
                            onDoubleClick={handlePhotoClick}
                            onContextMenu={handleContextMenu}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom export bar */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "var(--bg2)",
        borderTop: "1px solid var(--border)", padding: "12px 24px",
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <UserAddress withComma style={{ fontWeight: 700, fontSize: 16 }} />
          {(() => {
            const heroIds = heroConfig.selectedPersonIds;
            const heroNames = heroIds
              .map((id) => personClusters.get(id)?.displayName)
              .filter(Boolean) as string[];
            return heroNames.length > 0 ? (
              <span style={{ fontWeight: 700, fontSize: 16 }}>
                〈{heroNames.join(", ")}〉 중심 셀렉.{" "}
              </span>
            ) : null;
          })()}
          <span style={{ fontWeight: 700, fontSize: 16 }}>{selectedPhotos.length}</span>
          <span style={{ color: "var(--text2)", fontSize: 14 }}>장 선택됨</span>
          {paymentEnabled && !isPaid && selectedPhotos.length > freeZipLimit && (
            <span style={{ marginLeft: 10, fontSize: 12, color: "#f59e0b" }}>
              무료 {freeZipLimit}장 초과 — 결제 후 전체 다운로드 가능
            </span>
          )}
          {exported && <span style={{ marginLeft: 12, color: "var(--high)", fontSize: 13 }}>
            ✓ {tExport("done")} ({tExport("savedAs", { count: selectedPhotos.length })})
          </span>}
          {isFreeBeta() && (
            <span style={{
              marginLeft: exported ? 12 : 0, marginTop: 2,
              fontSize: 11, color: "var(--text-tertiary)",
              fontFamily: "var(--font-sans)", fontStyle: "normal",
              display: "block",
            }}>
              {FREE_BETA_COPY.helperLine}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {cachedZip && (
            <button
              className="btn-secondary"
              style={{ fontSize: 12, padding: "8px 14px" }}
              onClick={() => {
                track({ name: "zip_redownload", params: { size_mb: parseFloat((cachedZip.size / 1024 / 1024).toFixed(1)) } });
                const url = URL.createObjectURL(cachedZip.blob);
                const a = document.createElement("a");
                a.href = url; a.download = cachedZip.filename; a.click();
                URL.revokeObjectURL(url);
              }}
            >
              방금 만든 ZIP 다시 받기 — {(cachedZip.size / 1024 / 1024).toFixed(1)}MB
            </button>
          )}
          <button className="btn-secondary" style={{ fontSize: 13, padding: "8px 16px" }} onClick={handleCopyFileList}>
            {copied ? tExport("copied") : tExport("fileList")}
          </button>
          <button className="btn-primary" style={{ fontSize: 14, padding: "10px 24px" }}
            disabled={selectedPhotos.length === 0 || exporting} onClick={handleExport}>
            {exporting
              ? (zipPercent > 0 ? `ZIP 만드는 중... ${zipPercent}%` : tExport("downloading"))
              : isFreeBeta()
                ? FREE_BETA_COPY.downloadButton
                : `ZIP 다운로드 (${selectedPhotos.length}장)`}
          </button>
        </div>
      </div>

      {/* Payment gate modal */}
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
      {compareGroupId && (() => {
        const grp = groups.find((g) => g.id === compareGroupId);
        return grp ? (
          <GroupCompareModal
            group={grp}
            photos={photos}
            onSwap={(gid, pid) => setGroupSelected(gid, pid)}
            onClose={() => setCompareGroupId(null)}
          />
        ) : null;
      })()}

      {/* Photo detail modal — 사진 우선 화면이라 항상 다크 보조 (DESIGN_DIRECTION v2.2 §4-3) */}
      {modalPhoto && (
        <div data-theme="dark" style={{ color: "var(--text-primary)" }}>
          <PhotoDetailModal
            photo={modalPhoto}
            allPhotos={displayedPhotos}
            groupBestPhoto={getGroupBest(modalPhoto.id)}
            onClose={() => setModalPhotoId(null)}
            onNavigate={(id) => setModalPhotoId(id)}
            onToggleSelect={(id) => togglePhotoSelected(id)}
            onJumpToGroupBest={() => {
              const best = getGroupBest(modalPhoto.id);
              if (best) setModalPhotoId(best.id);
            }}
          />
        </div>
      )}

      {/* ── 플로팅 배너 (AI 판단이 아쉬우신가요?) ── */}
      {bannerVisible && !bannerDismissed && !preferenceSelected && (
        <div style={{
          position: "fixed", bottom: 76, right: 20, zIndex: 1500,
          background: "var(--bg2)", border: "1px solid var(--border)",
          borderLeft: "4px solid var(--accent)",
          borderRadius: "var(--radius-lg)",
          padding: "14px 18px", maxWidth: 300,
          animation: "slideInBanner 0.4s ease",
        }}>
          <button
            onClick={() => { setBannerVisible(false); dismissBanner(); }}
            style={{
              position: "absolute", top: 8, right: 10,
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text2)", fontSize: 16, lineHeight: 1,
            }}
          >✕</button>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
            AI 판단이 아쉬우신가요?
          </div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 12, lineHeight: 1.5 }}>
            사진 20장에 의견을 주시면<br />내 취향으로 다시 뽑아드려요 (약 3~5분)
          </div>
          <button
            onClick={handleOpenFeedback}
            style={{
              width: "100%", padding: "9px 0", borderRadius: 8,
              background: "linear-gradient(135deg, var(--accent), var(--accent2))",
              color: "white", border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 700,
            }}
          >
            내 취향으로 다시 뽑기 →
          </button>
        </div>
      )}

      {/* 배너 닫은 후에도 접근 가능한 작은 버튼 */}
      {(bannerDismissed || !bannerVisible) && !preferenceSelected && (
        <button
          onClick={handleOpenFeedback}
          style={{
            position: "fixed", bottom: 76, right: 20, zIndex: 1500,
            width: 46, height: 46, borderRadius: "50%",
            background: "linear-gradient(135deg, var(--accent), var(--accent2))",
            color: "white", border: "1px solid var(--border-subtle)", cursor: "pointer",
            fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center",
          }}
          title="내 취향으로 다시 뽑기"
        >↺</button>
      )}

      {/* ── 재추출 로딩 오버레이 ── */}
      {reextracting && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 3000,
          background: "rgba(10,10,18,0.82)",
          backdropFilter: "blur(6px)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 24,
        }}>
          <div style={{ position: "relative", width: 72, height: 72 }}>
            <div style={{
              position: "absolute", inset: 0, borderRadius: "50%",
              border: "4px solid rgba(10, 10, 11,0.2)",
            }} />
            <div style={{
              position: "absolute", inset: 0, borderRadius: "50%",
              border: "4px solid transparent",
              borderTopColor: "var(--accent)",
              animation: "spinReextract 0.9s linear infinite",
            }} />
            <div style={{
              position: "absolute", inset: 10, borderRadius: "50%",
              border: "3px solid transparent",
              borderTopColor: "var(--accent2)",
              animation: "spinReextract 1.4s linear infinite reverse",
            }} />
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
              선택 기준 적용 중...
            </div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)" }}>
              가중치·필터 조건으로 사진을 재선별하고 있어요
            </div>
          </div>
        </div>
      )}

      {/* ── 재추출 완료 토스트 ── */}
      {reextractDoneCount !== null && (
        <div style={{
          position: "fixed", top: 24, left: "50%", transform: "translateX(-50%)",
          zIndex: 3000,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text-primary)", borderRadius: "var(--radius-lg)",
          padding: "12px 28px",
          fontSize: 15, fontWeight: 700,
          animation: "toastIn 0.3s ease",
          whiteSpace: "nowrap",
        }}>
          ✓ {reextractDoneCount}장 재선별 완료
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && ctxPhoto && (
        <div ref={ctxRef} style={{
          position: "fixed", top: ctxMenu.y, left: ctxMenu.x, zIndex: 2000,
          background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
          minWidth: 180, overflow: "hidden",
        }}>
          <button
            onClick={() => { togglePhotoSelected(ctxMenu.photoId); setCtxMenu(null); }}
            style={{
              width: "100%", padding: "10px 14px", textAlign: "left", background: "none",
              border: "none", cursor: "pointer", fontSize: 13,
              color: ctxPhoto.isSelected ? "#ef4444" : "var(--accent2)",
              fontWeight: 600, display: "flex", alignItems: "center", gap: 8,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(10, 10, 11,0.12)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            {ctxPhoto.isSelected ? "✕  선택 제외" : "✓  선택에 포함"}
          </button>
          <button
            onClick={() => { setModalPhotoId(ctxMenu.photoId); setCtxMenu(null); }}
            style={{
              width: "100%", padding: "10px 14px", textAlign: "left", background: "none",
              border: "none", cursor: "pointer", fontSize: 13, color: "var(--text)",
              display: "flex", alignItems: "center", gap: 8,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(10, 10, 11,0.12)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            자세히 보기
          </button>
        </div>
      )}
      <style>{`
        @keyframes slideInBanner {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes spinReextract {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(-50%); }
          to   { opacity: 1; transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
