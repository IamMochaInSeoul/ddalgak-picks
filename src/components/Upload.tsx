import { useRef, useState, useCallback } from "react";
import { useT } from "../lib/i18n";
import { useStore } from "../lib/store";
import LangToggle from "./LangToggle";
import UserAddress from "./UserAddress";
import { PrimaryButton, SecondaryButton } from "./ui";
import {
  isDriveAvailable,
  getGoogleAccessToken,
  openDrivePicker,
  listDriveFolder,
  downloadDriveThumbnail,
  downloadDriveOriginal,
} from "../lib/googleDrive";

// ─────────────────────────────────────────────────────────────────────────────
// 폴더 재귀 읽기 유틸 (FileSystemEntry API)
// ─────────────────────────────────────────────────────────────────────────────
const IMAGE_EXT = /\.(jpe?g|png|heic|heif|webp|avif|tiff?)$/i;

async function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const all: FileSystemEntry[] = [];
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
    if (batch.length === 0) break;
    all.push(...batch);
  }
  return all;
}

async function readEntryFiles(entry: FileSystemEntry): Promise<File[]> {
  const files: File[] = [];
  async function recurse(e: FileSystemEntry) {
    if (e.isFile) {
      try {
        const f = await new Promise<File>((res, rej) => (e as FileSystemFileEntry).file(res, rej));
        if (IMAGE_EXT.test(f.name)) files.push(f);
      } catch { /* skip */ }
    } else if (e.isDirectory) {
      const entries = await readAllEntries((e as FileSystemDirectoryEntry).createReader());
      await Promise.all(entries.map(recurse));
    }
  }
  await recurse(entry);
  return files;
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload 컴포넌트
// ─────────────────────────────────────────────────────────────────────────────
export default function Upload() {
  const t = useT("upload");
  const tCommon = useT("common");
  const targetCount = useStore((s) => s.targetCount);
  const setTargetCount = useStore((s) => s.setTargetCount);
  const maxPerGroup = useStore((s) => s.maxPerGroup);
  const setMaxPerGroup = useStore((s) => s.setMaxPerGroup);
  const setStep           = useStore((s) => s.setStep);
  const addDriveQueueItem    = useStore((s) => s.addDriveQueueItem);
  const updateDriveQueueItem = useStore((s) => s.updateDriveQueueItem);
  const removeDriveQueueItem = useStore((s) => s.removeDriveQueueItem);
  const globalDriveToken     = useStore((s) => s.driveToken);
  const setDriveToken        = useStore((s) => s.setDriveToken);

  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [loadingFolder, setLoadingFolder] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0 });
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveProgress, setDriveProgress] = useState({ current: 0, total: 0, label: "" });
  const driveTokenRef = useRef<string | null>(globalDriveToken);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // 파일 배열 수신 (공통 처리)
  const handleFiles = useCallback((incoming: File[]) => {
    const arr = incoming.filter((f) => IMAGE_EXT.test(f.name));
    setFiles(arr);
  }, []);

  // ── 파일 input onChange ──
  const onFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    handleFiles(Array.from(e.target.files));
    e.target.value = "";
  }, [handleFiles]);

  // ── 드래그앤드롭: 파일 + 폴더 모두 처리 ──
  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);

    const items = Array.from(e.dataTransfer.items);
    if (items.length === 0) return;

    // FileSystemEntry API 지원 여부 확인
    const firstEntry = items[0]?.webkitGetAsEntry?.();
    if (!firstEntry) {
      // 폴백: dataTransfer.files 직접 사용
      if (e.dataTransfer.files) handleFiles(Array.from(e.dataTransfer.files));
      return;
    }

    setLoadingFolder(true);
    setLoadingProgress({ current: 0, total: items.length });

    try {
      const allFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.();
        if (!entry) continue;
        const entryFiles = await readEntryFiles(entry);
        allFiles.push(...entryFiles);
        setLoadingProgress({ current: i + 1, total: items.length });
      }
      handleFiles(allFiles);
    } catch (err) {
      console.error("[Upload] 폴더 읽기 실패:", err);
    } finally {
      setLoadingFolder(false);
      setLoadingProgress({ current: 0, total: 0 });
    }
  }, [handleFiles]);

  // ── Google Drive 가져오기 (§16 단계화: 썸네일 우선, driveQueue로 전역 배너 연동) ──
  const handleDriveImport = useCallback(async () => {
    setDriveLoading(true);
    const qid = `drive-a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      // §16 LOW — 전역 토큰 캐시 재사용
      let token = driveTokenRef.current;
      if (!token) {
        token = await getGoogleAccessToken();
        driveTokenRef.current = token;
        setDriveToken(token);
      }
      const picked = await openDrivePicker(token);
      let items: Awaited<ReturnType<typeof listDriveFolder>> = [];
      let label = "Google Drive";

      if (picked.type === "folder") {
        label = picked.name ?? "Google Drive";
        setDriveProgress({ current: 0, total: 0, label: `${label} 파일 목록 조회 중...` });
        items = await listDriveFolder(picked.id, token);
      } else if (picked.type === "files") {
        items = picked.items;
      }
      if (items.length === 0) return;

      // §16 MEDIUM — driveQueue 등록 → DriveDownloadBanner가 Flow A에서도 표시됨
      addDriveQueueItem({ id: qid, folderName: label, status: "downloading", current: 0, total: items.length });
      setDriveProgress({ current: 0, total: items.length, label });

      const downloaded: File[] = [];
      for (let i = 0; i < items.length; i++) {
        try {
          // §16 HIGH — 썸네일(800px) 우선, 미처리 파일은 원본 폴백
          const thumb = await downloadDriveThumbnail(items[i], token);
          downloaded.push(thumb ?? await downloadDriveOriginal(items[i], token));
        } catch { /* skip failed file */ }
        setDriveProgress({ current: i + 1, total: items.length, label });
        updateDriveQueueItem(qid, { current: i + 1 });
      }
      updateDriveQueueItem(qid, { status: "done" });
      setTimeout(() => removeDriveQueueItem(qid), 3000);
      handleFiles(downloaded);
    } catch (err) {
      updateDriveQueueItem(qid, { status: "error", errorMsg: err instanceof Error ? err.message : "오류" });
      console.error("[Upload] Drive import failed:", err);
    } finally {
      setDriveLoading(false);
      setDriveProgress({ current: 0, total: 0, label: "" });
    }
  }, [handleFiles, addDriveQueueItem, updateDriveQueueItem, removeDriveQueueItem, setDriveToken]);

  // ── 분석 시작 ──
  const startAnalysis = () => {
    if (files.length === 0) return;
    (window as unknown as Record<string, unknown>).__ddalgak_files = files;
    setStep("analysis");
  };

  const isReady = files.length > 0 && targetCount >= 1 && !loadingFolder && !driveLoading;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "24px", background: "var(--bg)" }}>

      {/* 헤더 */}
      <div style={{ position: "fixed", top: import.meta.env.VITE_FEATURE_PAYMENT !== "true" ? 28 : 0, left: 0, right: 0, display: "flex",
        justifyContent: "space-between", alignItems: "center", padding: "16px 24px",
        borderBottom: "1px solid var(--border)", background: "var(--bg)", zIndex: 100 }}>
        <SecondaryButton style={{ padding: "0 14px", height: 34, fontSize: 13 }}
          onClick={() => setStep("typeSelect")}>← {t("back")}</SecondaryButton>
        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--accent2)" }}>딸깍픽스</span>
        <LangToggle />
      </div>

      <div style={{ width: "100%", maxWidth: 600 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, textAlign: "center", marginBottom: 8 }}>
          <UserAddress withComma style={{ color: "var(--accent)" }} />
          {t("title")}
        </h2>
        <p style={{ textAlign: "center", color: "var(--text2)", marginBottom: 32, fontSize: 14 }}>{t("subtitle")}</p>

        {/* ── 드래그앤드롭 영역 ── */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !loadingFolder && fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? "var(--accent)" : "var(--border)"}`,
            borderRadius: "var(--radius-lg)", padding: "40px 24px", textAlign: "center",
            cursor: loadingFolder ? "wait" : "pointer",
            background: dragging ? "rgba(45,67,86,0.08)" : "var(--bg2)",
            transition: "all 0.15s", marginBottom: 16,
          }}
        >
          {loadingFolder ? (
            <>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
              <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: "var(--accent2)" }}>
                폴더 읽는 중...
              </p>
              {loadingProgress.total > 1 && (
                <p style={{ fontSize: 13, color: "var(--text2)" }}>
                  {loadingProgress.current} / {loadingProgress.total} 항목 처리 중
                </p>
              )}
            </>
          ) : (
            <>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📂</div>
              <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                {files.length > 0
                  ? t("selected", { count: files.length })
                  : t("dragDrop")}
              </p>
              <p style={{ fontSize: 13, color: "var(--text2)" }}>{t("orClick")}</p>
            </>
          )}
        </div>

        {/* ── 업로드 버튼 ── */}
        <div style={{ display: "flex", gap: 10, marginBottom: isDriveAvailable() ? 10 : 24, flexWrap: "wrap" }}>
          <button
            className="btn-secondary"
            style={{ flex: 1, fontSize: 14, padding: "10px 0", minWidth: 120 }}
            disabled={loadingFolder || driveLoading}
            onClick={() => fileInputRef.current?.click()}
          >
            🖼 사진 파일 선택
          </button>
          <button
            className="btn-secondary"
            style={{ flex: 1, fontSize: 14, padding: "10px 0", minWidth: 120 }}
            disabled={loadingFolder || driveLoading}
            onClick={() => folderInputRef.current?.click()}
          >
            폴더째 선택
          </button>
        </div>

        {/* ── Google Drive 버튼 ── */}
        {isDriveAvailable() && (
          <button
            className="btn-secondary"
            style={{
              width: "100%", fontSize: 14, padding: "11px 0", marginBottom: 24,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
            disabled={loadingFolder || driveLoading}
            onClick={handleDriveImport}
          >
            <svg width="18" height="18" viewBox="0 0 87.3 78" fill="none">
              <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L29.4 48H0c0 1.55.4 3.1 1.2 4.5L6.6 66.85z" fill="#0066DA"/>
              <path d="M43.65 25L29.4 0c-1.35.8-2.5 1.9-3.3 3.3L1.2 43.5C.4 44.9 0 46.45 0 48h29.4l14.25-23z" fill="#00AC47"/>
              <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H57.9l6.2 11.9 9.45 11.9z" fill="#EA4335"/>
              <path d="M43.65 25L57.9 48h29.4c0-1.55-.4-3.1-1.2-4.5L61.55 3.3c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25z" fill="#00832D"/>
              <path d="M57.9 48H29.4L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2L57.9 48z" fill="#2684FC"/>
              <path d="M73.4 24L58.25 3.3c-.8-1.4-1.95-2.5-3.3-3.3H32.35c-1.35.8-2.5 1.9-3.3 3.3L43.65 25l13.95-1 15.8 0z" fill="#FFBA00"/>
            </svg>
            {driveLoading
              ? `Drive 가져오는 중... (${driveProgress.current}/${driveProgress.total || "?"})`
              : "Google Drive에서 가져오기"}
          </button>
        )}

        {/* 숨긴 input들 */}
        <input ref={fileInputRef} type="file" multiple
          accept="image/jpeg,image/png,image/heic,image/heif,image/webp,image/avif,image/tiff"
          style={{ display: "none" }}
          onChange={onFileInputChange} />
        <input ref={folderInputRef} type="file" multiple
          // @ts-ignore
          webkitdirectory=""
          accept="image/jpeg,image/png,image/heic,image/heif,image/webp,image/avif,image/tiff"
          style={{ display: "none" }}
          onChange={onFileInputChange} />

        {/* ── 원하는 사진 수 ── */}
        <div className="card" style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 12 }}>{t("targetCount")}</label>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {[10, 20, 30, 50, 100].map((n) => (
              <button key={n} onClick={() => setTargetCount(n)}
                style={{ padding: "8px 16px", borderRadius: 8,
                  border: `2px solid ${targetCount === n ? "var(--accent)" : "var(--border)"}`,
                  background: targetCount === n ? "rgba(45,67,86,0.15)" : "transparent",
                  color: targetCount === n ? "var(--accent2)" : "var(--text2)",
                  fontWeight: 600, cursor: "pointer", fontSize: 14 }}>{n}</button>
            ))}
            <input type="number" min={1} max={3000} value={targetCount}
              onChange={(e) => setTargetCount(Number(e.target.value))}
              style={{ padding: "8px 12px", borderRadius: 8, border: "2px solid var(--border)",
                background: "var(--bg3)", color: "var(--text)", fontSize: 14, width: 80 }} />
          </div>
        </div>

        {/* ── 유사 사진 최대 허용 ── */}
        <div className="card" style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 4 }}>
            유사한 구도·포즈 최대 허용 장수
          </label>
          <p style={{ fontSize: 12, color: "var(--text2)", marginBottom: 12 }}>
            비슷한 사진이 많을 때 몇 장까지 선별할지 결정합니다 (기본값 2장 권장)
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[
              { label: "1장", value: 1 },
              { label: "2장", value: 2 },
              { label: "3장", value: 3 },
              { label: "5장", value: 5 },
              { label: "무제한", value: 9999 },
            ].map(({ label, value }) => (
              <button key={value} onClick={() => setMaxPerGroup(value)}
                style={{ padding: "8px 14px", borderRadius: 8,
                  border: `2px solid ${maxPerGroup === value ? "var(--accent)" : "var(--border)"}`,
                  background: maxPerGroup === value ? "rgba(45,67,86,0.15)" : "transparent",
                  color: maxPerGroup === value ? "var(--accent2)" : "var(--text2)",
                  fontWeight: 600, cursor: "pointer", fontSize: 14 }}>{label}</button>
            ))}
          </div>
        </div>

        {/* ── 선택 요약 + 예상 시간 ── */}
        {files.length > 0 && (
          <div style={{ padding: "12px 16px", borderRadius: 8, background: "rgba(45,67,86,0.1)",
            border: "1px solid rgba(45,67,86,0.3)", marginBottom: 16, fontSize: 13, color: "var(--accent2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <span>
                📸 {files.length}장 선택 · 목표: {targetCount}장 · 유사사진 최대: {maxPerGroup >= 9999 ? "무제한" : `${maxPerGroup}장`}
              </span>
              <button
                onClick={() => setFiles([])}
                style={{ background: "none", border: "none", cursor: "pointer",
                  color: "var(--text2)", fontSize: 12, padding: "2px 6px" }}>
                ✕ 초기화
              </button>
            </div>
            <div style={{ fontSize: 12, color: "var(--text2)" }}>
              ⏱ 약 {Math.max(1, Math.round(files.length * 0.8 / 60))}분 안에 셀렉이 끝나요
            </div>
          </div>
        )}

        {/* ── 분석 시작 버튼 ── */}
        <PrimaryButton
          fullWidth
          disabled={!isReady}
          loading={loadingFolder}
          onClick={startAnalysis}
          style={{ fontSize: 16 }}
        >
          {loadingFolder
            ? "폴더 읽는 중..."
            : files.length === 0
              ? "사진을 먼저 선택해주세요"
              : t("analyze")}
        </PrimaryButton>

        {files.length === 0 && !loadingFolder && (
          <p style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: "var(--text2)" }}>
            {tCommon("loading")}
          </p>
        )}
      </div>
    </div>
  );
}
