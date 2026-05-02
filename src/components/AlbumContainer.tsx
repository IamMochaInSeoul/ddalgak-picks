import { useState, useRef, useCallback } from "react";
import { useStore } from "../lib/store";
import { laplacianVariance, sharpnessScore } from "../lib/laplacian";
import type { AlbumSlot, AlbumSource, AlbumPhoto } from "../lib/albumTypes";
import {
  getGoogleAccessToken as getDriveToken,
  openDrivePicker as drivePicker,
  listDriveFolder,
  downloadDriveThumbnail,
  downloadDriveOriginal,
  isDriveAvailable,
  type DriveFileItem,
} from "../lib/googleDrive";

// ─────────────────────────────────────────────────────────────────────────────
// 유틸: 썸네일 생성
// ─────────────────────────────────────────────────────────────────────────────
async function generateThumbnail(file: File, size = 300): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ratio = Math.min(size / img.width, size / img.height);
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.75));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(); };
    img.src = url;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 유틸: 선명도 채점
// ─────────────────────────────────────────────────────────────────────────────
async function computeSharpness(file: File): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = 200;
      const c = document.createElement("canvas");
      c.width = c.height = s;
      c.getContext("2d")!.drawImage(img, 0, 0, s, s);
      const data = c.getContext("2d")!.getImageData(0, 0, s, s);
      URL.revokeObjectURL(url);
      resolve(sharpnessScore(laplacianVariance(data)));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
    img.src = url;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 유틸: 드래그앤드롭 — FileSystemDirectoryEntry에서 파일 재귀 읽기
// ─────────────────────────────────────────────────────────────────────────────
async function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const all: FileSystemEntry[] = [];
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((res, rej) =>
      reader.readEntries(res, rej)
    );
    if (batch.length === 0) break;
    all.push(...batch);
  }
  return all;
}

async function readDirEntryFiles(dir: FileSystemDirectoryEntry): Promise<File[]> {
  const files: File[] = [];
  async function recurse(d: FileSystemDirectoryEntry) {
    const entries = await readAllEntries(d.createReader());
    await Promise.all(entries.map(async (entry) => {
      if (entry.isFile) {
        const f = await new Promise<File>((res, rej) =>
          (entry as FileSystemFileEntry).file(res, rej)
        );
        if (/\.(jpg|jpeg|png|heic|heif|webp|avif|tiff?)$/i.test(f.name)) files.push(f);
      } else if (entry.isDirectory) {
        await recurse(entry as FileSystemDirectoryEntry);
      }
    }));
  }
  await recurse(dir);
  return files;
}

// Drive 유틸은 src/lib/googleDrive.ts 공용 모듈로 이동됨

// ─────────────────────────────────────────────────────────────────────────────
// 스튜디오 템플릿 폴더 파싱
// ─────────────────────────────────────────────────────────────────────────────
function parseTemplate(files: File[]): { slots: AlbumSlot[]; rootName: string } {
  if (files.length === 0) return { slots: [], rootName: "앨범" };
  const rootName = ((files[0] as File & { webkitRelativePath?: string }).webkitRelativePath ?? "앨범/").split("/")[0];
  const level1Set = new Set<string>();
  const level2Map = new Map<string, Set<string>>();
  for (const file of files) {
    const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? "";
    const parts = relPath.split("/");
    if (parts.length < 2) continue;
    const l1 = parts[1];
    if (parts.length === 2) continue;
    level1Set.add(l1);
    if (parts.length >= 3) {
      const l2 = parts[2];
      if (!level2Map.has(l1)) level2Map.set(l1, new Set());
      level2Map.get(l1)!.add(l2);
    }
  }
  const slots: AlbumSlot[] = [];
  for (const l1 of level1Set) {
    if (l1.startsWith("☆") || l1.startsWith("#") || l1.startsWith("●")) continue;
    if (/\.(jpg|jpeg|png|txt|pdf|mov|mp4|heic|gif|webp)$/i.test(l1)) continue;
    const isFrame = l1.includes("액자");
    const l2Folders = level2Map.get(l1) ?? new Set<string>();
    if (isFrame) {
      const capMatch = l1.match(/-\s*(\d+)\s*(?:[\(\s]|$)/);
      const capacity = capMatch ? parseInt(capMatch[1]) : 1;
      slots.push({ id: crypto.randomUUID(), groupName: "액자", slotName: l1, folderPath: l1, capacity, assignedPhotoIds: [] });
    } else if (/앨범|album/i.test(l1)) {
      let spreads = [...l2Folders].filter((f) => /^\d+-\d+$/.test(f));
      if (spreads.length === 0) {
        const pageMatch = l1.match(/(\d+)\s*[Pp]/);
        if (pageMatch) {
          const count = parseInt(pageMatch[1]);
          for (let p = 1; p <= count; p += 2) spreads.push(`${p}-${p + 1}`);
        }
      }
      spreads.sort((a, b) => parseInt(a) - parseInt(b));
      for (const spread of spreads) {
        slots.push({ id: crypto.randomUUID(), groupName: l1, slotName: spread, folderPath: `${l1}/${spread}`, capacity: 3, assignedPhotoIds: [] });
      }
    } else {
      slots.push({ id: crypto.randomUUID(), groupName: l1, slotName: l1, folderPath: l1, capacity: 2, assignedPhotoIds: [] });
    }
  }
  slots.sort((a, b) => {
    if (a.groupName === "액자" && b.groupName !== "액자") return -1;
    if (a.groupName !== "액자" && b.groupName === "액자") return 1;
    const an = parseInt(a.slotName), bn = parseInt(b.slotName);
    if (!isNaN(an) && !isNaN(bn)) return an - bn;
    return a.slotName.localeCompare(b.slotName);
  });
  return { slots, rootName };
}

// ─────────────────────────────────────────────────────────────────────────────
// AI 자동 배치
// ─────────────────────────────────────────────────────────────────────────────
function autoAssign(slots: AlbumSlot[], sources: AlbumSource[]): AlbumSlot[] {
  const sorted = [...sources].sort((a, b) => a.orderIndex - b.orderIndex);
  const result = slots.map((s) => ({ ...s, assignedPhotoIds: [] as string[] }));
  const used = new Set<string>();
  const pick = (photos: AlbumPhoto[], n: number): string[] => {
    const avail = photos.filter((p) => !used.has(p.id)).sort((a, b) => b.sharpness - a.sharpness);
    const picked = avail.slice(0, n).map((p) => p.id);
    picked.forEach((id) => used.add(id));
    return picked;
  };
  const frameSlots = result.filter((s) => s.groupName === "액자");
  const albumSlots = result.filter((s) => s.groupName !== "액자");
  const allPhotos = sorted.flatMap((src) => src.photos);
  for (const slot of frameSlots) slot.assignedPhotoIds = pick(allPhotos, slot.capacity);
  if (albumSlots.length > 0 && sorted.length > 0) {
    const perSrc = albumSlots.length / sorted.length;
    for (let si = 0; si < sorted.length; si++) {
      const srcSlots = albumSlots.slice(Math.round(si * perSrc), Math.round((si + 1) * perSrc));
      for (const slot of srcSlots) slot.assignedPhotoIds = pick(sorted[si].photos, slot.capacity);
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// ZIP 다운로드
// ─────────────────────────────────────────────────────────────────────────────
async function downloadZip(slots: AlbumSlot[], allPhotos: Map<string, AlbumPhoto>, rootName: string) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const slot of slots) {
    if (slot.assignedPhotoIds.length === 0) continue;
    const folder = zip.folder(`${rootName}/${slot.folderPath}`)!;
    for (const pid of slot.assignedPhotoIds) {
      const p = allPhotos.get(pid);
      if (!p) continue;
      folder.file(p.file.name, await p.file.arrayBuffer());
    }
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${rootName}-셀렉완료.zip`;
  a.click();
}

// ─────────────────────────────────────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────────────────────────────────────
export default function AlbumContainer() {
  const setStep = useStore((s) => s.setStep);

  const [innerStep, setInnerStep] = useState<"setup" | "building">("setup");

  // 템플릿
  const [templateRootName, setTemplateRootName] = useState("앨범");
  const [slots, setSlots] = useState<AlbumSlot[]>([]);
  const [templateParsed, setTemplateParsed] = useState(false);
  const [parsingTemplate, setParsingTemplate] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // 촬영 세션
  const [sources, setSources] = useState<AlbumSource[]>([]);
  const [allPhotos, setAllPhotos] = useState<Map<string, AlbumPhoto>>(new Map());
  const [processingSource, setProcessingSource] = useState(false);
  const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0, label: "" });
  const [isDragOver, setIsDragOver] = useState(false);

  // Google Drive
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [driveLoading, setDriveLoading] = useState(false);
  const [showDriveSetup, setShowDriveSetup] = useState(false);
  const [driveProgress, setDriveProgress] = useState({ current: 0, total: 0, label: "" });

  // 빌더 UI 상태
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [autoAssigning, setAutoAssigning] = useState(false);

  // 수동 슬롯 추가 상태
  const [manualGroupName, setManualGroupName] = useState("");
  const [manualSlotName, setManualSlotName] = useState("");
  const [manualCapacity, setManualCapacity] = useState(3);
  const [manualPageCount, setManualPageCount] = useState(26);

  const templateInputRef = useRef<HTMLInputElement>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);

  // ─── 템플릿 폴더 업로드 (로딩 + 피드백) ───
  const handleTemplateFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setParsingTemplate(true);
    setParseError(null);
    setTemplateParsed(false);
    await new Promise((r) => setTimeout(r, 60)); // UI 업데이트 보장
    const arr = Array.from(files);
    const { slots: parsed, rootName } = parseTemplate(arr);
    setTemplateRootName(rootName);
    setSlots(parsed);
    setTemplateParsed(true);
    setParsingTemplate(false);
    if (parsed.length === 0) {
      setParseError("슬롯을 감지하지 못했습니다. 폴더 안에 하위 폴더가 있는지 확인해 주세요. 아래 직접 추가 메뉴를 이용하실 수도 있습니다.");
    }
  }, []);

  // ─── 소스 파일 핵심 처리 (파일 배열 + 폴더명으로 세션 생성) ───
  const processSourceFolder = useCallback(async (folderName: string, imageFiles: File[]) => {
    if (imageFiles.length === 0) return;
    const sourceId = crypto.randomUUID();
    setProcessingSource(true);
    setProcessingProgress({ current: 0, total: imageFiles.length, label: folderName });
    const photos: AlbumPhoto[] = [];
    for (let i = 0; i < imageFiles.length; i++) {
      try {
        const [thumbnail, sharp] = await Promise.all([
          generateThumbnail(imageFiles[i], 300),
          computeSharpness(imageFiles[i]),
        ]);
        photos.push({ id: crypto.randomUUID(), file: imageFiles[i], thumbnail, sharpness: sharp, sourceId });
      } catch { /* skip */ }
      setProcessingProgress((p) => ({ ...p, current: i + 1 }));
    }
    photos.sort((a, b) => b.sharpness - a.sharpness);
    const newSource: AlbumSource = { id: sourceId, name: folderName, orderIndex: 0, photos, folderName };
    setSources((prev) => {
      const updated = [...prev, { ...newSource, orderIndex: prev.length }];
      return updated;
    });
    setAllPhotos((prev) => {
      const next = new Map(prev);
      photos.forEach((p) => next.set(p.id, p));
      return next;
    });
    setProcessingSource(false);
    setActiveSourceId((prev) => prev ?? sourceId);
    return sourceId;
  }, []);

  // ─── 파일 input에서 소스 추가 ───
  const handleSourceFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files).filter((f) =>
      /\.(jpg|jpeg|png|heic|heif|webp|avif|tiff?)$/i.test(f.name)
    );
    if (arr.length === 0) return;
    const firstPath = (arr[0] as File & { webkitRelativePath?: string }).webkitRelativePath ?? arr[0].name;
    const parts = firstPath.split("/");
    const folderName = parts.length >= 2 ? parts[parts.length - 2] : "세션";
    await processSourceFolder(folderName, arr);
  }, [processSourceFolder]);

  // ─── 드래그앤드롭 여러 폴더/파일 동시 처리 ───
  const handleFolderDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const items = Array.from(e.dataTransfer.items);
    if (items.length === 0) return;

    const dirEntries: { name: string; entry: FileSystemDirectoryEntry }[] = [];
    const fileEntries: FileSystemFileEntry[] = [];

    for (const item of items) {
      const entry = item.webkitGetAsEntry?.();
      if (!entry) continue;
      if (entry.isDirectory) {
        dirEntries.push({ name: entry.name, entry: entry as FileSystemDirectoryEntry });
      } else if (entry.isFile) {
        fileEntries.push(entry as FileSystemFileEntry);
      }
    }

    if (dirEntries.length === 0 && fileEntries.length === 0) return;

    if (dirEntries.length > 0) {
      // 폴더 단위 처리: 각 폴더를 별도 세션으로
      for (const { name, entry } of dirEntries) {
        const files = await readDirEntryFiles(entry);
        if (files.length > 0) await processSourceFolder(name, files);
      }
    } else {
      // 폴백: 이미지 파일이 직접 드롭된 경우 → 단일 세션으로 처리
      const files: File[] = [];
      for (const fe of fileEntries) {
        try {
          const f = await new Promise<File>((res, rej) => fe.file(res, rej));
          if (/\.(jpg|jpeg|png|heic|heif|webp|avif|tiff?)$/i.test(f.name)) files.push(f);
        } catch { /* skip */ }
      }
      if (files.length > 0) await processSourceFolder("드롭된 사진", files);
    }
  }, [processSourceFolder]);

  // ─── Google Drive에서 가져오기 ───
  const handleGoogleDrive = useCallback(async () => {
    // §16 MEDIUM — 직접 env 체크 제거, isDriveAvailable() 사용
    if (!isDriveAvailable()) {
      setShowDriveSetup(true);
      return;
    }
    setDriveLoading(true);
    try {
      // 1) 토큰 발급 (이미 있으면 재사용)
      let token = driveToken;
      if (!token) {
        token = await getDriveToken();
        setDriveToken(token);
      }
      // 2) Google Picker 열기
      let picked: Awaited<ReturnType<typeof drivePicker>>;
      try {
        picked = await drivePicker(token);
      } catch {
        setDriveLoading(false);
        return; // 취소
      }
      // 3) 폴더 선택 → 파일 목록 조회
      let items: DriveFileItem[] = [];
      let folderName = "Google Drive";
      if (picked.type === "folder" && picked.id) {
        folderName = picked.name ?? "Google Drive";
        setDriveProgress({ current: 0, total: 0, label: `${folderName} 파일 목록 조회 중...` });
        items = await listDriveFolder(picked.id, token);
      } else if (picked.type === "files") {
        items = picked.items;
        folderName = "Google Drive";
      }
      if (items.length === 0) { setDriveLoading(false); return; }
      // 4) §16 HIGH — 썸네일(800px) 우선 다운로드, 미처리 파일은 원본 폴백
      setDriveProgress({ current: 0, total: items.length, label: folderName });
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        try {
          const thumb = await downloadDriveThumbnail(items[i], token);
          files.push(thumb ?? await downloadDriveOriginal(items[i], token));
        } catch { /* skip */ }
        setDriveProgress((p) => ({ ...p, current: i + 1 }));
      }
      // 5) 세션 생성
      await processSourceFolder(folderName, files);
    } catch (err) {
      console.error("[Google Drive]", err);
    } finally {
      setDriveLoading(false);
      setDriveProgress({ current: 0, total: 0, label: "" });
    }
  }, [driveToken, processSourceFolder]);

  // ─── 세션 관리 ───
  const renameSource = useCallback((id: string, name: string) => {
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
  }, []);
  const removeSource = useCallback((id: string) => {
    setSources((prev) => prev.filter((s) => s.id !== id));
    setAllPhotos((prev) => {
      const next = new Map(prev);
      for (const [pid, p] of next) { if (p.sourceId === id) next.delete(pid); }
      return next;
    });
  }, []);
  const moveSource = useCallback((id: string, dir: -1 | 1) => {
    setSources((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr.map((s, i) => ({ ...s, orderIndex: i }));
    });
  }, []);

  // ─── 사진 배치 ───
  const assignPhoto = useCallback((photoId: string) => {
    if (!activeSlotId) return;
    setSlots((prev) => prev.map((s) => {
      if (s.id !== activeSlotId) return s;
      if (s.assignedPhotoIds.includes(photoId)) return s;
      if (s.assignedPhotoIds.length >= s.capacity) {
        return { ...s, assignedPhotoIds: [...s.assignedPhotoIds.slice(1), photoId] };
      }
      return { ...s, assignedPhotoIds: [...s.assignedPhotoIds, photoId] };
    }));
  }, [activeSlotId]);

  const unassignPhoto = useCallback((slotId: string, photoId: string) => {
    setSlots((prev) => prev.map((s) =>
      s.id === slotId ? { ...s, assignedPhotoIds: s.assignedPhotoIds.filter((id) => id !== photoId) } : s
    ));
  }, []);

  // ─── AI 자동 배치 ───
  const handleAutoAssign = useCallback(async () => {
    setAutoAssigning(true);
    await new Promise((r) => setTimeout(r, 50));
    const result = autoAssign(slots, sources);
    setSlots(result);
    setAutoAssigning(false);
  }, [slots, sources]);

  // ─── 수동 슬롯 추가 ───
  const addAlbumSpreads = useCallback(() => {
    const groupName = manualGroupName || `앨범 ${manualPageCount}P`;
    const newSlots: AlbumSlot[] = [];
    for (let p = 1; p <= manualPageCount; p += 2) {
      newSlots.push({ id: crypto.randomUUID(), groupName, slotName: `${p}-${p + 1}`, folderPath: `${groupName}/${p}-${p + 1}`, capacity: manualCapacity, assignedPhotoIds: [] });
    }
    setSlots((prev) => [...prev, ...newSlots]);
  }, [manualGroupName, manualPageCount, manualCapacity]);

  const addSingleSlot = useCallback(() => {
    if (!manualSlotName) return;
    const groupName = manualGroupName || "액자";
    setSlots((prev) => [...prev, { id: crypto.randomUUID(), groupName, slotName: manualSlotName, folderPath: `${groupName}/${manualSlotName}`, capacity: 1, assignedPhotoIds: [] }]);
    setManualSlotName("");
  }, [manualGroupName, manualSlotName]);

  const clearSlots = () => { setSlots([]); setTemplateParsed(false); setParseError(null); };

  // ─── ZIP 다운로드 ───
  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try { await downloadZip(slots, allPhotos, templateRootName); }
    catch (e) { console.error(e); }
    finally { setDownloading(false); }
  }, [slots, allPhotos, templateRootName]);

  const totalAssigned = slots.reduce((acc, s) => acc + s.assignedPhotoIds.length, 0);
  const totalCapacity = slots.reduce((acc, s) => acc + s.capacity, 0);

  const slotGroups = Array.from(
    slots.reduce((map, s) => {
      if (!map.has(s.groupName)) map.set(s.groupName, []);
      map.get(s.groupName)!.push(s);
      return map;
    }, new Map<string, AlbumSlot[]>())
  );

  const currentSourcePhotos = activeSourceId
    ? (sources.find((s) => s.id === activeSourceId)?.photos ?? [])
    : sources.flatMap((s) => s.photos).sort((a, b) => b.sharpness - a.sharpness);

  const assignedSet = new Set(slots.flatMap((s) => s.assignedPhotoIds));

  // ══════════════════════════════════════════════════════════════════════════
  // SETUP PHASE
  // ══════════════════════════════════════════════════════════════════════════
  if (innerStep === "setup") {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "24px", maxWidth: 860, margin: "0 auto" }}>
        {/* 숨겨진 파일 입력 */}
        <input ref={templateInputRef} type="file" style={{ display: "none" }}
          // @ts-ignore
          webkitdirectory="" multiple
          onChange={(e) => { handleTemplateFiles(e.target.files); e.target.value = ""; }} />
        <input ref={sourceInputRef} type="file" style={{ display: "none" }}
          // @ts-ignore
          webkitdirectory="" multiple
          onChange={(e) => { handleSourceFiles(e.target.files); e.target.value = ""; }} />

        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
          <button className="btn-secondary" style={{ fontSize: 13, padding: "6px 14px" }}
            onClick={() => setStep("landing")}>← 처음으로</button>
          <span style={{ fontSize: 20, fontWeight: 800, color: "var(--accent2)" }}>📚 앨범 만들기</span>
        </div>

        {/* ── STEP 1: 스튜디오 양식 ── */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>1단계 · 스튜디오 양식 폴더</div>
              <div style={{ fontSize: 13, color: "var(--text2)" }}>
                스튜디오에서 받은 셀렉 폴더를 업로드하면 구조를 자동으로 읽어옵니다
              </div>
            </div>
            <button className="btn-primary" style={{ fontSize: 13, padding: "8px 16px" }}
              disabled={parsingTemplate}
              onClick={() => templateInputRef.current?.click()}>
              {parsingTemplate ? "⏳ 분석 중..." : "📂 폴더 업로드"}
            </button>
          </div>

          {/* 파싱 중 */}
          {parsingTemplate && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
              background: "rgba(108,99,255,0.08)", border: "1px solid rgba(108,99,255,0.25)", borderRadius: 10 }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%",
                border: "3px solid transparent", borderTopColor: "var(--accent)",
                animation: "spinReextract 0.9s linear infinite", flexShrink: 0 }} />
              <span style={{ fontSize: 14, color: "var(--accent2)", fontWeight: 600 }}>폴더 구조 분석 중...</span>
            </div>
          )}

          {/* 파싱 완료 — 성공 */}
          {templateParsed && slots.length > 0 && !parsingTemplate && (
            <div style={{ background: "rgba(34,197,94,0.08)", border: "1.5px solid rgba(34,197,94,0.4)",
              borderRadius: 12, padding: "16px 18px", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 22 }}>✅</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#16a34a" }}>폴더 인식 완료!</div>
                  <div style={{ fontSize: 12, color: "var(--text2)" }}>
                    "{templateRootName}" · 총 <strong>{slots.length}개</strong> 슬롯 감지됨
                  </div>
                </div>
                <button onClick={clearSlots}
                  style={{ marginLeft: "auto", fontSize: 12, color: "var(--text2)", background: "none",
                    border: "1px solid var(--border)", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
                  초기화
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {slotGroups.map(([groupName, groupSlots]) => (
                  <div key={groupName} style={{
                    background: "var(--bg)", border: "1px solid rgba(34,197,94,0.35)",
                    borderRadius: 8, padding: "8px 14px", fontSize: 13,
                  }}>
                    <span style={{ marginRight: 6 }}>{groupName === "액자" ? "🖼" : "📖"}</span>
                    <span style={{ fontWeight: 700 }}>{groupName}</span>
                    <span style={{ marginLeft: 8, color: "#16a34a", fontWeight: 700 }}>{groupSlots.length}개</span>
                    <span style={{ marginLeft: 4, color: "var(--text2)", fontSize: 12 }}>
                      (각 최대 {Math.max(...groupSlots.map(s => s.capacity))}장)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 파싱 완료 — 실패 */}
          {templateParsed && slots.length === 0 && !parsingTemplate && parseError && (
            <div style={{ background: "rgba(239,68,68,0.08)", border: "1.5px solid rgba(239,68,68,0.35)",
              borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 12 }}>
                <span style={{ fontSize: 20 }}>⚠️</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#ef4444", marginBottom: 4 }}>슬롯 감지 실패</div>
                  <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.6 }}>{parseError}</div>
                </div>
              </div>
              {/* Flow C 폴백 — 앨범 배치 포기하고 ZIP 셀렉으로 이동 */}
              <div style={{
                paddingTop: 10, borderTop: "1px solid rgba(239,68,68,0.2)",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              }}>
                <span style={{ fontSize: 12, color: "var(--text2)" }}>
                  템플릿 없이 선별 결과만 ZIP으로 받으시겠어요?
                </span>
                <button
                  className="btn-secondary"
                  style={{ fontSize: 13, padding: "7px 16px", whiteSpace: "nowrap", flexShrink: 0 }}
                  onClick={() => setStep("folderGallery")}
                >
                  ← ZIP 셀렉으로 돌아가기
                </button>
              </div>
            </div>
          )}

          {/* 직접 추가 */}
          <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "var(--text2)" }}>
              ✏️ 직접 추가 (폴더 업로드 없이도 가능)
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <label style={{ fontSize: 11, color: "var(--text2)", display: "block", marginBottom: 3 }}>그룹명 (선택)</label>
                <input value={manualGroupName} onChange={(e) => setManualGroupName(e.target.value)}
                  placeholder="예: 앨범 10X10 - 26P"
                  style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg2)", color: "var(--text)", fontSize: 13, width: 200 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--text2)", display: "block", marginBottom: 3 }}>총 페이지 수</label>
                <input type="number" value={manualPageCount} min={2} max={100} step={2}
                  onChange={(e) => setManualPageCount(parseInt(e.target.value) || 26)}
                  style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg2)", color: "var(--text)", fontSize: 13, width: 80 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--text2)", display: "block", marginBottom: 3 }}>장당 사진 수</label>
                <select value={manualCapacity} onChange={(e) => setManualCapacity(parseInt(e.target.value))}
                  style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg2)", color: "var(--text)", fontSize: 13 }}>
                  {[1,2,3,4].map((n) => <option key={n} value={n}>{n}장</option>)}
                </select>
              </div>
              <button className="btn-secondary" style={{ fontSize: 13, padding: "7px 14px" }} onClick={addAlbumSpreads}>
                📖 앨범 스프레드 추가
              </button>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <label style={{ fontSize: 11, color: "var(--text2)", display: "block", marginBottom: 3 }}>슬롯명 (액자 등)</label>
                <input value={manualSlotName} onChange={(e) => setManualSlotName(e.target.value)}
                  placeholder="예: 액자 미니 5구"
                  style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg2)", color: "var(--text)", fontSize: 13, width: 200 }} />
              </div>
              <button className="btn-secondary" style={{ fontSize: 13, padding: "7px 14px" }}
                onClick={addSingleSlot} disabled={!manualSlotName}>
                🖼 단일 슬롯 추가
              </button>
            </div>
          </div>
        </div>

        {/* ── STEP 2: 촬영 세션 ── */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>2단계 · 촬영 세션 추가</div>
              <div style={{ fontSize: 13, color: "var(--text2)" }}>
                만삭, 베이비본, 50일, 100일, 돌 등 각 촬영 폴더를 추가하세요
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {/* Google Drive 버튼 */}
              <button
                onClick={handleGoogleDrive}
                disabled={processingSource || driveLoading}
                style={{
                  fontSize: 13, padding: "8px 14px", borderRadius: 10, cursor: "pointer",
                  border: "1.5px solid var(--border)", background: "var(--bg2)",
                  color: "var(--text)", fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 6,
                  opacity: processingSource || driveLoading ? 0.5 : 1,
                }}
              >
                <img src="https://www.gstatic.com/images/branding/product/1x/drive_2020q4_32dp.png"
                  alt="" style={{ width: 16, height: 16 }} />
                {driveLoading
                  ? `다운로드 중 (${driveProgress.current}/${driveProgress.total})`
                  : "Google Drive"}
              </button>
              {/* 로컬 폴더 버튼 */}
              <button className="btn-primary" style={{ fontSize: 13, padding: "8px 16px" }}
                disabled={processingSource || driveLoading}
                onClick={() => sourceInputRef.current?.click()}>
                {processingSource
                  ? `분석 중... ${processingProgress.current}/${processingProgress.total} (${processingProgress.label})`
                  : "📁 폴더 추가"}
              </button>
            </div>
          </div>

          {/* 진행 중 배너 */}
          {(processingSource || driveLoading) && (
            <div style={{ marginBottom: 12, padding: "12px 16px",
              background: "rgba(108,99,255,0.08)", border: "1px solid rgba(108,99,255,0.25)",
              borderRadius: 10, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%",
                border: "3px solid transparent", borderTopColor: "var(--accent)",
                animation: "spinReextract 0.9s linear infinite", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--accent2)", marginBottom: 4 }}>
                  {driveLoading
                    ? (driveProgress.total > 0 ? `"${driveProgress.label}" 다운로드 중` : driveProgress.label || "Google Drive 연결 중")
                    : `"${processingProgress.label}" 사진 분석 중`}
                </div>
                {(processingSource || driveProgress.total > 0) && (
                  <div style={{ background: "var(--border)", borderRadius: 4, height: 6, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", background: "var(--accent)", borderRadius: 4,
                      width: `${((processingSource ? processingProgress.current : driveProgress.current) /
                               (processingSource ? processingProgress.total : driveProgress.total)) * 100}%`,
                      transition: "width 0.3s",
                    }} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 드래그앤드롭 존 */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleFolderDrop}
            style={{
              border: `2px dashed ${isDragOver ? "var(--accent)" : "var(--border)"}`,
              borderRadius: 12, padding: "20px",
              background: isDragOver ? "rgba(108,99,255,0.08)" : "transparent",
              textAlign: "center", marginBottom: 14, transition: "all 0.2s",
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 6 }}>📂</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: isDragOver ? "var(--accent2)" : "var(--text2)", marginBottom: 4 }}>
              {isDragOver ? "여기에 놓으세요!" : "폴더를 여기에 드래그하세요"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text2)" }}>
              여러 폴더를 한꺼번에 드래그하면 각각 별도 세션으로 추가됩니다
            </div>
          </div>

          {/* 세션 목록 */}
          {sources.length === 0 ? (
            <div style={{ textAlign: "center", padding: "12px 0", color: "var(--text2)", fontSize: 13 }}>
              아직 추가된 세션이 없습니다
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {sources.map((src, idx) => (
                <div key={src.id} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                  borderRadius: 10, background: "var(--bg2)", border: "1px solid var(--border)",
                }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <button onClick={() => moveSource(src.id, -1)} disabled={idx === 0}
                      style={{ background: "none", border: "none", cursor: idx === 0 ? "default" : "pointer",
                        opacity: idx === 0 ? 0.3 : 1, color: "var(--text2)", fontSize: 14, lineHeight: 1 }}>▲</button>
                    <button onClick={() => moveSource(src.id, 1)} disabled={idx === sources.length - 1}
                      style={{ background: "none", border: "none", cursor: idx === sources.length - 1 ? "default" : "pointer",
                        opacity: idx === sources.length - 1 ? 0.3 : 1, color: "var(--text2)", fontSize: 14, lineHeight: 1 }}>▼</button>
                  </div>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--bg3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, fontWeight: 700, color: "var(--accent2)" }}>{idx + 1}</div>
                  <input value={src.name} onChange={(e) => renameSource(src.id, e.target.value)}
                    style={{ flex: 1, padding: "5px 10px", borderRadius: 7, border: "1px solid var(--border)",
                      background: "transparent", color: "var(--text)", fontSize: 14, fontWeight: 600 }} />
                  <div style={{ display: "flex", gap: 6 }}>
                    {src.photos.slice(0, 2).map((p) => (
                      <img key={p.id} src={p.thumbnail} alt=""
                        style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 12, color: "var(--text2)" }}>{src.photos.length}장</span>
                  <button onClick={() => removeSource(src.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 18, padding: 4 }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 시작 버튼 ── */}
        <div style={{ textAlign: "right" }}>
          <button className="btn-primary"
            style={{ fontSize: 15, padding: "12px 32px", opacity: (slots.length > 0 && sources.length > 0) ? 1 : 0.4 }}
            disabled={slots.length === 0 || sources.length === 0}
            onClick={() => { setInnerStep("building"); setActiveSlotId(slots[0]?.id ?? null); }}>
            앨범 만들기 시작 →
          </button>
          {(slots.length === 0 || sources.length === 0) && (
            <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 6 }}>
              {slots.length === 0 ? "슬롯을 먼저 추가해주세요" : "촬영 세션을 하나 이상 추가해주세요"}
            </div>
          )}
        </div>

        {/* ── Google Drive 설정 모달 ── */}
        {showDriveSetup && (
          <div style={{ position: "fixed", inset: 0, zIndex: 5000, background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 16,
              padding: "28px 32px", maxWidth: 520, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
              <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>☁ Google Drive 연동 설정</div>
              <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 20, lineHeight: 1.7 }}>
                Google Drive 연동은 <strong>무료</strong>이지만, Google Cloud 계정에서 API 키를 발급해야 합니다.<br />
                아래 순서대로 진행해주세요. (약 10분 소요)
              </div>
              {[
                { n: 1, text: <>console.cloud.google.com 접속 → 새 프로젝트 만들기</> },
                { n: 2, text: <>"API 및 서비스" → "라이브러리" → <strong>Google Drive API</strong>, <strong>Google Picker API</strong> 두 개 모두 활성화</> },
                { n: 3, text: <>"사용자 인증 정보 만들기" → <strong>OAuth 2.0 클라이언트 ID</strong> 선택 → 유형: 웹 애플리케이션 → 승인된 JavaScript 출처에 <code style={{background:"var(--bg3)",padding:"2px 5px",borderRadius:4}}>https://ddalgak-picks.vercel.app</code> 추가</> },
                { n: 4, text: <>"사용자 인증 정보 만들기" → <strong>API 키</strong> 생성 → API 제한 → "Google Picker API" 선택</> },
                { n: 5, text: <>Vercel 대시보드 → 프로젝트 Settings → Environment Variables 에 두 개 추가:<br /><code style={{background:"var(--bg3)",padding:"2px 5px",borderRadius:4,display:"inline-block",marginTop:4}}>VITE_GOOGLE_CLIENT_ID</code> = OAuth 클라이언트 ID<br /><code style={{background:"var(--bg3)",padding:"2px 5px",borderRadius:4,display:"inline-block",marginTop:4}}>VITE_GOOGLE_API_KEY</code> = API 키</> },
                { n: 6, text: <>Vercel에서 <strong>Redeploy</strong> 후 다시 시도</> },
              ].map(({ n, text }) => (
                <div key={n} style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--accent)",
                    color: "#fff", fontSize: 12, fontWeight: 700, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</div>
                  <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.65 }}>{text}</div>
                </div>
              ))}
              <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
                <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer"
                  style={{ flex: 1, padding: "10px 0", textAlign: "center", borderRadius: 9,
                    background: "linear-gradient(135deg,var(--accent),var(--accent2))", color: "#fff",
                    textDecoration: "none", fontWeight: 700, fontSize: 14 }}>
                  Google Cloud Console 열기 →
                </a>
                <button onClick={() => setShowDriveSetup(false)}
                  style={{ padding: "10px 18px", borderRadius: 9, border: "1.5px solid var(--border)",
                    background: "transparent", color: "var(--text2)", cursor: "pointer", fontSize: 13 }}>
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}

        <style>{`
          @keyframes spinReextract {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BUILDING PHASE
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      {/* 헤더 */}
      <div style={{ position: "sticky", top: 0, zIndex: 100, background: "var(--bg)",
        borderBottom: "1px solid var(--border)", padding: "12px 20px",
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button className="btn-secondary" style={{ fontSize: 13, padding: "6px 12px" }}
          onClick={() => setInnerStep("setup")}>← 설정으로</button>
        <span style={{ fontWeight: 700, fontSize: 15, color: "var(--accent2)" }}>📚 앨범 빌더</span>
        <div style={{ fontSize: 12, color: "var(--text2)" }}>
          {totalAssigned} / {totalCapacity}장 배치됨 · {slots.filter(s => s.assignedPhotoIds.length > 0).length}/{slots.length}개 슬롯 채움
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn-secondary" style={{ fontSize: 13, padding: "7px 16px", opacity: autoAssigning ? 0.6 : 1 }}
          disabled={autoAssigning || sources.length === 0} onClick={handleAutoAssign}>
          {autoAssigning ? "배치 중..." : "AI 자동 배치"}
        </button>
        <button className="btn-primary" style={{ fontSize: 13, padding: "7px 20px", opacity: downloading ? 0.6 : 1 }}
          disabled={downloading || totalAssigned === 0} onClick={handleDownload}>
          {downloading ? "ZIP 생성 중..." : `ZIP 다운로드 (${totalAssigned}장)`}
        </button>
      </div>

      {/* 메인 레이아웃 */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* ── 왼쪽: 슬롯 패널 ── */}
        <div style={{ width: 360, minWidth: 280, flexShrink: 0, borderRight: "1px solid var(--border)",
          overflowY: "auto", padding: "16px 12px", background: "var(--bg2)" }}>
          <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 12, paddingLeft: 4 }}>
            슬롯을 클릭 → 오른쪽에서 사진 선택
          </div>
          {slotGroups.map(([groupName, groupSlots]) => (
            <div key={groupName} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent2)",
                textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, paddingLeft: 2 }}>
                {groupName === "액자" ? "🖼 액자" : "📖 " + groupName}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {groupSlots.map((slot) => {
                  const isActive = slot.id === activeSlotId;
                  const filled = slot.assignedPhotoIds.length;
                  const pct = filled / slot.capacity;
                  return (
                    <div key={slot.id} onClick={() => setActiveSlotId(slot.id)}
                      style={{ borderRadius: 10, padding: "10px 12px", cursor: "pointer",
                        border: `2px solid ${isActive ? "var(--accent)" : filled === slot.capacity ? "rgba(34,197,94,0.4)" : "var(--border)"}`,
                        background: isActive ? "rgba(108,99,255,0.12)" : "var(--bg)", transition: "border-color 0.15s" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: filled > 0 ? 8 : 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{slot.slotName}</span>
                        <span style={{ fontSize: 11, color: pct === 1 ? "#22c55e" : "var(--text2)" }}>{filled}/{slot.capacity}장</span>
                        <div style={{ display: "flex", gap: 3 }}>
                          {Array.from({ length: slot.capacity }).map((_, i) => (
                            <div key={i} style={{ width: 7, height: 7, borderRadius: "50%",
                              background: i < filled ? "var(--accent)" : "var(--border)" }} />
                          ))}
                        </div>
                      </div>
                      {filled > 0 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {slot.assignedPhotoIds.map((pid) => {
                            const photo = allPhotos.get(pid);
                            if (!photo) return null;
                            return (
                              <div key={pid} style={{ position: "relative" }}>
                                <img src={photo.thumbnail} alt=""
                                  style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }} />
                                <button onClick={(e) => { e.stopPropagation(); unassignPhoto(slot.id, pid); }}
                                  style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16,
                                    borderRadius: "50%", background: "#ef4444", color: "white", border: "none",
                                    cursor: "pointer", fontSize: 10, lineHeight: 1,
                                    display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* ── 오른쪽: 사진 패널 ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)",
            display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", background: "var(--bg)" }}>
            <button onClick={() => setActiveSourceId(null)}
              style={{ padding: "5px 14px", borderRadius: 7, fontSize: 12, cursor: "pointer",
                border: `1.5px solid ${activeSourceId === null ? "var(--accent)" : "var(--border)"}`,
                background: activeSourceId === null ? "rgba(108,99,255,0.15)" : "transparent",
                color: activeSourceId === null ? "var(--accent2)" : "var(--text2)", fontWeight: 600 }}>전체</button>
            {sources.map((src) => (
              <button key={src.id} onClick={() => setActiveSourceId(src.id)}
                style={{ padding: "5px 14px", borderRadius: 7, fontSize: 12, cursor: "pointer",
                  border: `1.5px solid ${activeSourceId === src.id ? "var(--accent)" : "var(--border)"}`,
                  background: activeSourceId === src.id ? "rgba(108,99,255,0.15)" : "transparent",
                  color: activeSourceId === src.id ? "var(--accent2)" : "var(--text2)", fontWeight: 600 }}>
                {src.name} ({src.photos.length})
              </button>
            ))}
            <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--text2)" }}>
              {activeSlotId
                ? `"${slots.find(s => s.id === activeSlotId)?.slotName}" 선택됨 — 사진 클릭 시 배치`
                : "← 왼쪽 슬롯을 클릭해 선택하세요"}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            {currentSourcePhotos.length === 0 ? (
              <div style={{ textAlign: "center", padding: 80, color: "var(--text2)" }}>사진이 없습니다</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
                {currentSourcePhotos.map((photo) => {
                  const isAssigned = assignedSet.has(photo.id);
                  const isActiveSlotPhoto = activeSlotId && slots.find(s => s.id === activeSlotId)?.assignedPhotoIds.includes(photo.id);
                  return (
                    <div key={photo.id} onClick={() => assignPhoto(photo.id)}
                      style={{ position: "relative", cursor: "pointer", borderRadius: 8, overflow: "hidden",
                        border: `2px solid ${isActiveSlotPhoto ? "var(--accent)" : isAssigned ? "rgba(34,197,94,0.6)" : "transparent"}`,
                        opacity: isAssigned && !isActiveSlotPhoto ? 0.55 : 1, transition: "opacity 0.15s, border-color 0.15s" }}>
                      <img src={photo.thumbnail} alt={photo.file.name}
                        style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} />
                      <div style={{ position: "absolute", bottom: 4, left: 4, background: "rgba(0,0,0,0.6)",
                        borderRadius: 4, padding: "2px 5px", fontSize: 10, color: "white", fontWeight: 600 }}>
                        {Math.round(photo.sharpness * 100)}점
                      </div>
                      {(isActiveSlotPhoto || (isAssigned && !isActiveSlotPhoto)) && (
                        <div style={{ position: "absolute", top: 4, right: 4,
                          background: isActiveSlotPhoto ? "var(--accent)" : "#22c55e", borderRadius: "50%",
                          width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, color: "white", fontWeight: 700 }}>✓</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI 자동배치 오버레이 */}
      {autoAssigning && (
        <div style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(10,10,18,0.82)",
          backdropFilter: "blur(6px)", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 20 }}>
          <div style={{ width: 60, height: 60, borderRadius: "50%",
            border: "4px solid transparent", borderTopColor: "var(--accent)",
            animation: "spinReextract 0.9s linear infinite" }} />
          <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>AI가 사진을 배치 중...</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>세션 순서 · 선명도 기준으로 자동 배분합니다</div>
        </div>
      )}
      <style>{`
        @keyframes spinReextract {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
