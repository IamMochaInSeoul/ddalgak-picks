/**
 * FolderUpload.tsx — Flow B
 * 여러 폴더를 한번에 드롭/선택 → 폴더별 FolderSession 생성 후 분석 시작
 */
import { useCallback, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { inferEventTag, EVENT_TAG_LABELS, ALL_EVENT_TAGS } from "../lib/eventTagger";
import type { EventTag, FolderSession } from "../lib/types";
import LangToggle from "./LangToggle";
import type { AppState } from "../lib/types";

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
      } catch { /* skip */ }
    } else if (e.isDirectory) {
      const entries = await readAllEntries((e as FileSystemDirectoryEntry).createReader());
      await Promise.all(entries.map(recurse));
    }
  }
  await recurse(entry);
  return files;
}

// ── 컴포넌트 ──────────────────────────────────────────────────────────────
export default function FolderUpload() {
  const setStep = useStore((s) => s.setStep) as (step: AppState["step"]) => void;
  const folderSessions = useStore((s) => s.folderSessions);
  const setFolderSessions = useStore((s) => s.setFolderSessions);
  const addFolderSession = useStore((s) => s.addFolderSession);
  const updateFolderSession = useStore((s) => s.updateFolderSession);
  const removeFolderSession = useStore((s) => s.removeFolderSession);
  const setFolderSessionEventTag = useStore((s) => s.setFolderSessionEventTag);
  const setFolderSessionTargetCount = useStore((s) => s.setFolderSessionTargetCount);
  const globalTargetCount = useStore((s) => s.targetCount);
  const maxPerGroup = useStore((s) => s.maxPerGroup);
  const setMaxPerGroup = useStore((s) => s.setMaxPerGroup);

  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const folderInputRef = useRef<HTMLInputElement>(null);

  // ── 폴더 처리 ────────────────────────────────────────────────────────────
  const processFolderEntries = useCallback(async (entries: FileSystemEntry[]) => {
    setLoading(true);
    setErrorMsg(null);
    let addedCount = 0;
    try {
      const dirEntries = entries.filter((e) => e.isDirectory);
      const fileEntries = entries.filter((e) => e.isFile);

      if (dirEntries.length > 0) {
        for (const entry of dirEntries) {
          let files: File[] = [];
          try {
            files = await collectImageFiles(entry);
          } catch {
            continue;
          }
          if (files.length === 0) continue;
          const session: FolderSession = {
            id: `fs-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            folderName: entry.name,
            eventTag: inferEventTag(entry.name),
            files,
            status: "pending",
            progress: 0,
            stage: "",
            photos: new Map(),
            groups: [],
            targetCount: globalTargetCount,
          };
          addFolderSession(session);
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
          const session: FolderSession = {
            id: `fs-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            folderName: "드롭된 사진",
            eventTag: "other",
            files,
            status: "pending",
            progress: 0,
            stage: "",
            photos: new Map(),
            groups: [],
            targetCount: globalTargetCount,
          };
          addFolderSession(session);
        } else {
          setErrorMsg("드롭한 파일 중 이미지가 없어요. JPG/PNG/HEIC 파일을 드롭해주세요.");
        }
      }
    } finally {
      setLoading(false);
    }
  }, [addFolderSession, globalTargetCount]);

  // ── 드래그앤드롭 ─────────────────────────────────────────────────────────
  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const items = Array.from(e.dataTransfer.items);
    if (items.length === 0) return;
    const entries = items
      .map((item) => item.webkitGetAsEntry?.())
      .filter((entry): entry is FileSystemEntry => !!entry);
    if (entries.length === 0) return;
    await processFolderEntries(entries);
  }, [processFolderEntries]);

  // ── 폴더 input onChange ──────────────────────────────────────────────────
  const onFolderInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputFiles = e.target.files;
    if (!inputFiles || inputFiles.length === 0) return;
    setErrorMsg(null);
    const arr = Array.from(inputFiles).filter((f) => IMAGE_EXT.test(f.name));
    if (arr.length === 0) {
      setErrorMsg("선택한 폴더에서 이미지를 찾지 못했어요. JPG/PNG/HEIC 파일이 있는 폴더인지 확인해주세요.");
      e.target.value = "";
      return;
    }

    // webkitRelativePath를 이용해 폴더별로 그룹핑
    const byFolder = new Map<string, File[]>();
    for (const f of arr) {
      const parts = f.webkitRelativePath.split("/");
      const folderName = parts.length > 1 ? parts[0] : "선택된 사진";
      if (!byFolder.has(folderName)) byFolder.set(folderName, []);
      byFolder.get(folderName)!.push(f);
    }

    for (const [folderName, files] of byFolder) {
      const session: FolderSession = {
        id: `fs-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        folderName,
        eventTag: inferEventTag(folderName),
        files,
        status: "pending",
        progress: 0,
        stage: "",
        photos: new Map(),
        groups: [],
        targetCount: globalTargetCount,
      };
      addFolderSession(session);
    }
    e.target.value = "";
  }, [addFolderSession, globalTargetCount]);

  // ── 분석 시작 ─────────────────────────────────────────────────────────────
  const startAnalysis = () => {
    if (folderSessions.length === 0) return;
    setStep("folderGallery");
  };

  const totalPhotos = folderSessions.reduce((acc, s) => acc + s.files.length, 0);
  const isReady = folderSessions.length > 0 && !loading;

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
        <button className="btn-secondary" style={{ padding: "6px 14px", fontSize: 13 }}
          onClick={() => setStep("landing")}>
          ← 뒤로
        </button>
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
            transition: "all 0.15s", marginBottom: 16,
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
              <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
                폴더를 여러 개 한꺼번에 드롭하세요
              </p>
              <p style={{ fontSize: 13, color: "var(--text2)" }}>
                각 폴더가 촬영 세션으로 구분됩니다 · 클릭해서 선택도 가능해요
              </p>
            </>
          )}
        </div>

        {/* 에러 메시지 */}
        {errorMsg && (
          <div style={{
            background: "rgba(255,80,80,0.12)", border: "1.5px solid rgba(255,80,80,0.4)",
            borderRadius: 10, padding: "10px 16px", marginBottom: 12,
            fontSize: 13, color: "#ff5050",
          }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {/* 폴더 선택 버튼 */}
        <button
          className="btn-secondary"
          style={{ width: "100%", fontSize: 14, padding: "11px 0", marginBottom: 24 }}
          disabled={loading}
          onClick={() => folderInputRef.current?.click()}
        >
          📁 폴더 선택하기
        </button>
        <input ref={folderInputRef} type="file" multiple
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
                  {/* 폴더명 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      📁 {session.folderName}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>
                      {session.files.length.toLocaleString()}장
                    </div>
                  </div>

                  {/* 삭제 버튼 */}
                  <button
                    onClick={() => removeFolderSession(session.id)}
                    style={{ background: "none", border: "none", cursor: "pointer",
                      color: "var(--text2)", fontSize: 18, padding: "4px 6px", lineHeight: 1 }}
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
                          onClick={() => {
                            setFolderSessionEventTag(session.id, tag);
                            setEditingTag(null);
                          }}
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
                      <span style={{ fontSize: 12, color: "var(--text2)" }}>목표</span>
                      {[10, 20, 30, 50].map((n) => (
                        <button key={n}
                          onClick={() => setFolderSessionTargetCount(session.id, n)}
                          style={{
                            padding: "4px 8px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
                            border: `1.5px solid ${session.targetCount === n ? "var(--accent)" : "var(--border)"}`,
                            background: session.targetCount === n ? "rgba(108,99,255,0.15)" : "transparent",
                            color: session.targetCount === n ? "var(--accent2)" : "var(--text2)",
                          }}>
                          {n}
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
        <button
          className="btn-primary"
          style={{ width: "100%", fontSize: 16, padding: "14px", opacity: isReady ? 1 : 0.5 }}
          disabled={!isReady}
          onClick={startAnalysis}
        >
          {loading ? "폴더 읽는 중..." : folderSessions.length === 0
            ? "폴더를 먼저 추가해주세요"
            : `🚀 ${folderSessions.length}개 폴더 분석 시작 (총 ${totalPhotos.toLocaleString()}장)`}
        </button>
      </div>
    </div>
  );
}
