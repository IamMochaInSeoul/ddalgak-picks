/**
 * FolderUpload.tsx — Flow B
 * 여러 폴더를 드롭/반복 선택 → 폴더별 FolderSession 생성 후 분석 시작
 *
 * 폴더 등록 경로:
 *   A. 드래그앤드롭 → onDrop → processFolderEntries (여러 폴더 한번에)
 *   B. 버튼 클릭 → webkitdirectory 피커 → onFolderInputChange (한 번에 폴더 1개, 반복 가능)
 *
 * 주의:
 *   - webkitdirectory 피커는 한 번에 폴더 1개만 선택 가능 (브라우저 제약)
 *   - <input>에 accept 속성을 쓰면 webkitdirectory와 충돌해 files가 비어버림 → 제거
 *   - 같은 폴더 재선택 시 onChange가 발화하지 않는 Chrome 버그 → inputKey로 매번 remount
 */
import { useCallback, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { inferEventTag, EVENT_TAG_LABELS, ALL_EVENT_TAGS } from "../lib/eventTagger";
import { getRecommendedCount } from "../lib/recommendedCount";
import type { EventTag, FolderSession } from "../lib/types";
import LangToggle from "./LangToggle";
import type { AppState } from "../lib/types";
import { PrimaryButton, SecondaryButton } from "./ui";
import {
  getGoogleAccessToken,
  openDrivePicker,
  listDriveFolder,
  downloadDriveThumbnail,
  downloadDriveOriginal,
  isDriveAvailable,
  type DriveFileItem,
} from "../lib/googleDrive";
import { showToast } from "./Toast";

const IMAGE_EXT = /\.(jpe?g|png|heic|heif|webp|avif|tiff?|bmp|gif)$/i;

// ── FileSystemEntry 유틸 ────────────────────────────────────────────────────

async function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const all: FileSystemEntry[] = [];
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
    if (batch.length === 0) break;
    all.push(...batch);
  }
  return all;
}

async function collectImageFiles(entry: FileSystemEntry): Promise<File[]> {
  const files: File[] = [];
  async function recurse(e: FileSystemEntry) {
    if (e.isFile) {
      try {
        const f = await new Promise<File>((res, rej) => (e as FileSystemFileEntry).file(res, rej));
        if (IMAGE_EXT.test(f.name)) files.push(f);
      } catch { /* skip unreadable files */ }
    } else if (e.isDirectory) {
      const entries = await readAllEntries((e as FileSystemDirectoryEntry).createReader());
      await Promise.all(entries.map(recurse));
    }
  }
  await recurse(entry);
  return files;
}

function makeSession(
  folderName: string,
  files: File[],
  eventTag: EventTag,
  targetCount: number,
  source: "local" | "google_drive" = "local",
  driveMeta?: { folderId?: string; items?: DriveFileItem[] },
): FolderSession {
  return {
    id: `fs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    folderName,
    eventTag,
    files,
    status: "pending",
    progress: 0,
    stage: "",
    photos: new Map(),
    groups: [],
    targetCount,
    source,
    driveFolderId: driveMeta?.folderId,
    driveItems: driveMeta?.items,
  };
}

// ── 컴포넌트 ──────────────────────────────────────────────────────────────

export default function FolderUpload() {
  const setStep             = useStore((s) => s.setStep) as (step: AppState["step"]) => void;
  const folderSessions      = useStore((s) => s.folderSessions);
  const setFolderSessions   = useStore((s) => s.setFolderSessions);
  const addFolderSession    = useStore((s) => s.addFolderSession);
  const removeFolderSession = useStore((s) => s.removeFolderSession);
  const setFolderSessionEventTag    = useStore((s) => s.setFolderSessionEventTag);
  const setFolderSessionTargetCount = useStore((s) => s.setFolderSessionTargetCount);
  const globalTargetCount   = useStore((s) => s.targetCount);
  const maxPerGroup         = useStore((s) => s.maxPerGroup);
  const setMaxPerGroup      = useStore((s) => s.setMaxPerGroup);
  const driveQueue            = useStore((s) => s.driveQueue);
  const addDriveQueueItem     = useStore((s) => s.addDriveQueueItem);
  const updateDriveQueueItem  = useStore((s) => s.updateDriveQueueItem);
  const removeDriveQueueItem  = useStore((s) => s.removeDriveQueueItem);
  const globalDriveToken      = useStore((s) => s.driveToken);
  const setDriveToken         = useStore((s) => s.setDriveToken);

  // §16 LOW — 토큰 ref: 동일 컴포넌트 내 재사용 (전역 토큰과 동기화)
  const driveTokenRef = useRef<string | null>(globalDriveToken);

  const [dragging, setDragging]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);
  const [inputKey, setInputKey]   = useState(0);

  const folderInputRef = useRef<HTMLInputElement>(null);

  // ── 드래그앤드롭 경로 ───────────────────────────────────────────────────

  const processFolderEntries = useCallback(async (entries: FileSystemEntry[]) => {
    setLoading(true);
    setErrorMsg(null);

    const dirEntries  = entries.filter((e) => e.isDirectory);
    const fileEntries = entries.filter((e) => e.isFile);
    let addedCount = 0;

    try {
      if (dirEntries.length > 0) {
        for (const entry of dirEntries) {
          let files: File[] = [];
          try {
            files = await collectImageFiles(entry);
          } catch {
            continue; // 읽기 실패한 폴더는 건너뜀
          }
          if (files.length === 0) continue;
          { const tag = inferEventTag(entry.name); addFolderSession(makeSession(entry.name, files, tag, getRecommendedCount(tag), "local")); }
          addedCount++;
        }
        if (addedCount === 0) {
          setErrorMsg("드롭한 폴더에서 이미지를 찾지 못했어요. JPG/PNG/HEIC 파일이 있는 폴더인지 확인해주세요.");
        }
      } else if (fileEntries.length > 0) {
        const files: File[] = [];
        for (const entry of fileEntries) {
          try {
            const f = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
            if (IMAGE_EXT.test(f.name)) files.push(f);
          } catch { /* skip */ }
        }
        if (files.length > 0) {
          addFolderSession(makeSession("드롭된 사진", files, "other", getRecommendedCount("other"), "local"));
        } else {
          setErrorMsg("드롭한 파일 중 이미지가 없어요. JPG/PNG/HEIC 파일을 드롭해주세요.");
        }
      }
    } finally {
      setLoading(false);
    }
  }, [addFolderSession, globalTargetCount]);

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const entries = Array.from(e.dataTransfer.items)
      .map((item) => item.webkitGetAsEntry?.())
      .filter((entry): entry is FileSystemEntry => !!entry);
    if (entries.length > 0) await processFolderEntries(entries);
  }, [processFolderEntries]);

  // ── 버튼 클릭 경로 ──────────────────────────────────────────────────────
  // webkitdirectory 피커는 폴더 1개만 선택 가능. 여러 폴더 추가 = 버튼 반복 클릭.
  // inputKey 증가로 <input>을 remount → 삭제 후 같은 폴더 재선택도 정상 작동.

  const onFolderInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputFiles = e.target.files;
    // remount 예약: 이후 어떤 결과든 다음 클릭은 항상 새 input에서 시작
    setInputKey((k) => k + 1);

    if (!inputFiles || inputFiles.length === 0) return;
    setErrorMsg(null);

    const arr = Array.from(inputFiles).filter((f) => IMAGE_EXT.test(f.name));
    if (arr.length === 0) {
      setErrorMsg("선택한 폴더에서 이미지를 찾지 못했어요. JPG/PNG/HEIC 파일이 있는 폴더인지 확인해주세요.");
      return;
    }

    // webkitRelativePath = "폴더명/파일명" 구조로 폴더별 그룹핑
    const byFolder = new Map<string, File[]>();
    for (const f of arr) {
      const parts = f.webkitRelativePath.split("/");
      const folderName = parts.length > 1 ? parts[0] : "선택된 사진";
      if (!byFolder.has(folderName)) byFolder.set(folderName, []);
      byFolder.get(folderName)!.push(f);
    }

    for (const [folderName, files] of byFolder) {
      { const tag = inferEventTag(folderName); addFolderSession(makeSession(folderName, files, tag, getRecommendedCount(tag), "local")); }
    }
  }, [addFolderSession, globalTargetCount]);

  // ── Google Drive 경로 (백그라운드 다운로드, §16 단계화) ─────────────────────
  // 피커 선택 즉시 driveQueue 등록 → fire-and-forget으로 썸네일(800px) 다운로드.
  // 원본 다운로드는 분석 후 ZIP 확정 시점까지 지연. (§16 핵심 전략)
  const handleDriveImport = useCallback(async () => {
    setErrorMsg(null);
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    try {
      // §16 LOW — 전역 캐시 토큰 재사용, 없으면 새로 발급
      let token = driveTokenRef.current;
      if (!token) {
        token = await getGoogleAccessToken();
        driveTokenRef.current = token;
        setDriveToken(token);
      }
      const picked = await openDrivePicker(token);

      const qid = `drive-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      if (picked.type === "folder") {
        addDriveQueueItem({ id: qid, folderName: picked.name, status: "downloading", current: 0, total: 0 });

        (async () => {
          try {
            const items = await listDriveFolder(picked.id, token!);
            if (items.length === 0) {
              updateDriveQueueItem(qid, { status: "error", errorMsg: "이미지를 찾지 못했어요" });
              return;
            }
            updateDriveQueueItem(qid, { total: items.length });

            // §16 HIGH — 썸네일(800px) 우선, Drive 미처리 파일은 원본 폴백
            const files: File[] = [];
            const usedItems: typeof items = [];
            let thumbCount = 0;
            const origSavedBytes = items.reduce((s, it) => s + parseInt(it.size ?? "0", 10), 0);

            for (let i = 0; i < items.length; i++) {
              const item = items[i];
              const thumb = await downloadDriveThumbnail(item, token!);
              if (thumb) {
                files.push(thumb);
                thumbCount++;
              } else {
                // Drive 썸네일 미처리(HEIC 등) → 원본 폴백
                files.push(await downloadDriveOriginal(item, token!));
              }
              usedItems.push(item);
              updateDriveQueueItem(qid, { current: i + 1 });
            }

            const tag = inferEventTag(picked.name);
            addFolderSession(makeSession(
              picked.name, files, tag, getRecommendedCount(tag),
              "google_drive",
              { folderId: picked.id, items: usedItems },
            ));
            updateDriveQueueItem(qid, { status: "done" });

            // §16 — 절감량 표시
            const savedMB = (origSavedBytes / 1024 / 1024).toFixed(1);
            showToast(
              thumbCount > 0
                ? `${picked.name} — 썸네일 ${thumbCount}장 분석 준비 완료 (원본 ${savedMB}MB 절약)`
                : `${picked.name} — ${files.length}장 가져왔어요!`,
              "✅",
            );

            if ("Notification" in window && Notification.permission === "granted") {
              new Notification("딸깍픽스 — Drive 준비 완료 ✅", {
                body: `${picked.name} · ${files.length}장. 분석을 시작해보세요!`,
                icon: "/favicon.ico",
              });
            }
            setTimeout(() => removeDriveQueueItem(qid), 4000);
          } catch (err) {
            const msg = err instanceof Error ? err.message : "알 수 없는 오류";
            updateDriveQueueItem(qid, { status: "error", errorMsg: msg });
          }
        })();

      } else {
        // 개별 파일 선택: Picker 응답에 thumbnailLink 없으므로 원본 다운로드
        const items = picked.items ?? [];
        if (items.length === 0) { setErrorMsg("선택한 파일이 없어요."); return; }

        addDriveQueueItem({ id: qid, folderName: "Drive 사진", status: "downloading", current: 0, total: items.length });

        (async () => {
          try {
            const files: File[] = [];
            for (let i = 0; i < items.length; i++) {
              files.push(await downloadDriveOriginal(items[i], token!));
              updateDriveQueueItem(qid, { current: i + 1 });
            }
            addFolderSession(makeSession(
              "Drive 사진", files, "other", getRecommendedCount("other"),
              "google_drive",
              { items },
            ));
            updateDriveQueueItem(qid, { status: "done" });
            showToast(`${files.length}장 가져왔어요!`, "✅");
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification("딸깍픽스 — Drive 준비 완료 ✅", {
                body: `Drive 사진 ${files.length}장 준비됐어요.`,
                icon: "/favicon.ico",
              });
            }
            setTimeout(() => removeDriveQueueItem(qid), 4000);
          } catch (err) {
            const msg = err instanceof Error ? err.message : "알 수 없는 오류";
            updateDriveQueueItem(qid, { status: "error", errorMsg: msg });
          }
        })();
      }
    } catch (err) {
      if (err instanceof Error && err.message !== "cancelled") {
        setErrorMsg(`Drive 연동 오류: ${err.message}`);
      }
    }
  }, [addFolderSession, globalTargetCount, addDriveQueueItem, updateDriveQueueItem, removeDriveQueueItem, setDriveToken]);

  // ── 분석 시작 ────────────────────────────────────────────────────────────

  const startAnalysis = () => {
    if (folderSessions.length === 0) return;
    setStep("folderGallery");
  };

  const totalPhotos = folderSessions.reduce((acc, s) => acc + s.files.length, 0);
  const driveDownloading = driveQueue.some((e) => e.status === "downloading");
  const isReady = folderSessions.length > 0 && !loading && !driveDownloading;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "0 0 60px" }}>

      {/* ── 헤더 ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 100,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "14px 24px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg)",
      }}>
        <SecondaryButton style={{ padding: "0 14px", height: 34, fontSize: 13 }}
          onClick={() => setStep("landing")}>
          ← 뒤로
        </SecondaryButton>
        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--accent2)" }}>📁 폴더 묶음 셀렉</span>
        <LangToggle />
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 0" }}>

        {/* ── 드롭존 ── */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !loading && folderInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? "var(--accent)" : "var(--border)"}`,
            borderRadius: 16, padding: "40px 24px", textAlign: "center",
            cursor: loading ? "wait" : "pointer",
            background: dragging ? "rgba(108,99,255,0.08)" : "var(--bg2)",
            transition: "all 0.15s", marginBottom: 12,
          }}
        >
          {loading ? (
            <>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
              <p style={{ fontSize: 15, fontWeight: 600, color: "var(--accent2)" }}>폴더 읽는 중...</p>
            </>
          ) : (
            <>
              <div style={{ fontSize: 48, marginBottom: 14 }}>📂</div>
              <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
                폴더를 여러 개 한꺼번에 드롭하세요
              </p>
              <p style={{ fontSize: 13, color: "var(--text2)" }}>
                드롭: 여러 폴더 동시에 · 버튼: 한 폴더씩 반복 추가
              </p>
            </>
          )}
        </div>

        {/* ── 에러 메시지 ── */}
        {errorMsg && (
          <div style={{
            background: "rgba(255,80,80,0.12)", border: "1.5px solid rgba(255,80,80,0.4)",
            borderRadius: 10, padding: "10px 16px", marginBottom: 12,
            fontSize: 13, color: "#ff5050",
          }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {/* ── 폴더 선택 버튼 ── */}
        <button
          className="btn-secondary"
          style={{ width: "100%", fontSize: 14, padding: "11px 0", marginBottom: isDriveAvailable() ? 10 : 24 }}
          disabled={loading}
          onClick={() => folderInputRef.current?.click()}
        >
          📁 폴더 선택하기 (한 폴더씩 반복 추가 가능)
        </button>

        {/* ── Google Drive 버튼 ── */}
        {isDriveAvailable() && (
          <button
            className="btn-secondary"
            style={{ width: "100%", fontSize: 14, padding: "11px 0", marginBottom: driveQueue.length > 0 ? 10 : 24,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            disabled={loading}
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
            Google Drive에서 가져오기
            {driveDownloading && (
              <span style={{ fontSize: 12, color: "var(--text2)", marginLeft: 4 }}>
                (다운로드 중...)
              </span>
            )}
          </button>
        )}

        {/* ── Drive 다운로드 큐 ── */}
        {driveQueue.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            {driveQueue.map((item) => (
              <div key={item.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 14px", marginBottom: 6, borderRadius: 10,
                background: item.status === "error"
                  ? "rgba(255,80,80,0.10)"
                  : item.status === "done"
                    ? "rgba(0,200,100,0.10)"
                    : "rgba(108,99,255,0.08)",
                border: `1px solid ${
                  item.status === "error" ? "rgba(255,80,80,0.3)"
                  : item.status === "done" ? "rgba(0,200,100,0.3)"
                  : "var(--border)"}`,
                fontSize: 13,
              }}>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.status === "downloading" ? "⬇" : item.status === "done" ? "✅" : "❌"}{" "}
                  {item.folderName}
                </span>
                {item.status === "downloading" && (
                  <span style={{ color: "var(--text2)", whiteSpace: "nowrap" }}>
                    {item.total > 0
                      ? `${item.current} / ${item.total}장`
                      : "목록 가져오는 중..."}
                  </span>
                )}
                {item.status === "error" && (
                  <span style={{ color: "#ff5050", fontSize: 12 }}>{item.errorMsg}</span>
                )}
                {item.status === "done" && (
                  <span style={{ color: "var(--text2)", fontSize: 12 }}>완료</span>
                )}
                {item.status === "error" && (
                  <button
                    onClick={() => removeDriveQueueItem(item.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text2)", fontSize: 16, padding: "0 2px" }}
                  >✕</button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* key 변경으로 remount → 같은 폴더 재선택도 onChange 발화 보장 */}
        {/* accept 속성 없음: webkitdirectory + accept 조합 시 브라우저가 files를 비워버림 */}
        <input
          key={inputKey}
          ref={folderInputRef}
          type="file"
          multiple
          // @ts-ignore
          webkitdirectory=""
          style={{ display: "none" }}
          onChange={onFolderInputChange}
        />

        {/* ── 유사 사진 최대 허용 ── */}
        <div className="card" style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
            유사한 구도 최대 허용
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {([1, 2, 3, 5, 9999] as const).map((v) => (
              <button key={v} onClick={() => setMaxPerGroup(v)}
                style={{
                  padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                  border: `2px solid ${maxPerGroup === v ? "var(--accent)" : "var(--border)"}`,
                  background: maxPerGroup === v ? "rgba(108,99,255,0.15)" : "transparent",
                  color: maxPerGroup === v ? "var(--accent2)" : "var(--text2)",
                }}>
                {v >= 9999 ? "무제한" : `${v}장`}
              </button>
            ))}
          </div>
        </div>

        {/* ── 추가된 폴더 목록 ── */}
        {folderSessions.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: "var(--text2)" }}>
              추가된 폴더 ({folderSessions.length}개 · 총 {totalPhotos.toLocaleString()}장)
            </div>

            {folderSessions.map((session) => (
              <div key={session.id} className="card" style={{ marginBottom: 10, padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      📁 {session.folderName}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>
                      {session.files.length.toLocaleString()}장
                    </div>
                  </div>

                  <button
                    onClick={() => removeFolderSession(session.id)}
                    style={{ background: "none", border: "none", cursor: "pointer",
                      color: "var(--text2)", fontSize: 18, padding: "4px 6px", lineHeight: 1 }}
                    aria-label="폴더 삭제"
                  >
                    ✕
                  </button>
                </div>

                {/* 이벤트 태그 */}
                {editingTag === session.id ? (
                  <div>
                    <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 6 }}>이벤트 종류 선택</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {ALL_EVENT_TAGS.map((tag) => (
                        <button key={tag}
                          onClick={() => { setFolderSessionEventTag(session.id, tag); setEditingTag(null); }}
                          style={{
                            padding: "5px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
                            border: `1.5px solid ${session.eventTag === tag ? "var(--accent)" : "var(--border)"}`,
                            background: session.eventTag === tag ? "rgba(108,99,255,0.15)" : "transparent",
                            color: session.eventTag === tag ? "var(--accent2)" : "var(--text2)",
                          }}>
                          {EVENT_TAG_LABELS[tag]}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button
                      onClick={() => setEditingTag(session.id)}
                      style={{
                        padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
                        border: "1.5px solid var(--accent)",
                        background: "rgba(108,99,255,0.12)",
                        color: "var(--accent2)",
                      }}
                    >
                      {EVENT_TAG_LABELS[session.eventTag]} ✎
                    </button>

                    {/* 목표 장수 */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
                      <span style={{ fontSize: 12, color: "var(--text2)" }}>
                        목표
                        <span style={{ marginLeft: 4, color: "var(--accent)", fontSize: 11 }}>
                          (추천 {getRecommendedCount(session.eventTag)}장)
                        </span>
                      </span>
                      {Array.from(new Set([getRecommendedCount(session.eventTag), 10, 20, 30, 50])).sort((a, b) => a - b).map((n) => (
                        <button key={n}
                          onClick={() => setFolderSessionTargetCount(session.id, n)}
                          style={{
                            padding: "4px 8px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
                            border: `1.5px solid ${session.targetCount === n ? "var(--accent)" : "var(--border)"}`,
                            background: session.targetCount === n ? "rgba(108,99,255,0.15)" : "transparent",
                            color: session.targetCount === n ? "var(--accent2)" : "var(--text2)",
                          }}>
                          {n}{n === getRecommendedCount(session.eventTag) ? " ★" : ""}
                        </button>
                      ))}
                      <input type="number" min={1} max={3000} value={session.targetCount}
                        onChange={(e) => setFolderSessionTargetCount(session.id, Number(e.target.value))}
                        style={{
                          width: 54, padding: "4px 6px", borderRadius: 6,
                          border: "1.5px solid var(--border)", background: "var(--bg3)",
                          color: "var(--text)", fontSize: 12,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── 전체 초기화 ── */}
        {folderSessions.length > 0 && (
          <button
            className="btn-secondary"
            style={{ width: "100%", fontSize: 13, padding: "9px 0", marginBottom: 14 }}
            onClick={() => setFolderSessions([])}
          >
            ✕ 전체 초기화
          </button>
        )}

        {/* ── 분석 시작 ── */}
        <PrimaryButton
          fullWidth
          disabled={!isReady}
          loading={loading || driveDownloading}
          onClick={startAnalysis}
          style={{ fontSize: 15 }}
        >
          {loading
            ? "폴더 읽는 중..."
            : driveDownloading
              ? "Drive 다운로드 중... (완료 후 분석 가능)"
              : folderSessions.length === 0
                ? "폴더를 먼저 추가해주세요"
                : `${folderSessions.length}개 폴더 분석 시작 — 총 ${totalPhotos.toLocaleString()}장`}
        </PrimaryButton>

      </div>
    </div>
  );
}
