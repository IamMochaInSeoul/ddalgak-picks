/**
 * opfsStore.ts — Origin Private File System 기반 사진 Blob 영속화
 *
 * - 사진 원본 100% 브라우저 내(OPFS), 외부 서버 전송 0
 * - 30일 TTL 자동 정리 (savedAt 메타로 판정)
 * - 폴더 세션 단위로 저장: ddalgak-folders/<sessionId>/<filename>
 * - 메타: ddalgak-folders/<sessionId>/_meta.json
 *
 * Browser support: Safari 15.2+, Chrome 86+, Firefox 111+, Edge 86+ (대부분 데스크톱)
 * 미지원 환경: 자동 폴백(no-op) — 함수가 throw 안 함
 */

const ROOT_DIR = "ddalgak-folders";
const META_FILE = "_meta.json";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;   // 30일

export interface OpfsSessionMeta {
  sessionId: string;
  folderName: string;
  source: "local" | "google_drive";
  eventTag: string;
  savedAt: number;
  fileNames: string[];   // OPFS 안 파일명 목록 (filename collision 방지: index 접두사)
  totalBytes: number;
}

function isSupported(): boolean {
  return typeof navigator !== "undefined"
      && "storage" in navigator
      && typeof navigator.storage.getDirectory === "function";
}

async function getRoot(): Promise<FileSystemDirectoryHandle | null> {
  if (!isSupported()) return null;
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(ROOT_DIR, { create: true });
  } catch (e) {
    console.warn("[opfsStore] getRoot failed:", e);
    return null;
  }
}

/**
 * 폴더 세션 저장 — 사진 Blob들을 OPFS에 일괄 기록
 * @param sessionId  unique id (FolderSession.id)
 * @param folderName 사용자 표시명
 * @param source     "local" | "google_drive"
 * @param eventTag   EventTag string
 * @param files      File[] (Blob 포함)
 */
export async function saveFolderSession(
  sessionId: string,
  folderName: string,
  source: "local" | "google_drive",
  eventTag: string,
  files: File[],
): Promise<boolean> {
  const root = await getRoot();
  if (!root) return false;

  try {
    const sessionDir = await root.getDirectoryHandle(sessionId, { create: true });

    const fileNames: string[] = [];
    let totalBytes = 0;

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      // collision 방지: index 접두사. 원래 이름은 메타로 보존
      const safeName = `${String(i).padStart(5, "0")}_${f.name.replace(/[^\w.-]/g, "_")}`;
      const fileHandle = await sessionDir.getFileHandle(safeName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(f);
      await writable.close();
      fileNames.push(safeName);
      totalBytes += f.size;
    }

    const meta: OpfsSessionMeta = {
      sessionId,
      folderName,
      source,
      eventTag,
      savedAt: Date.now(),
      fileNames,
      totalBytes,
    };
    const metaHandle = await sessionDir.getFileHandle(META_FILE, { create: true });
    const metaWritable = await metaHandle.createWritable();
    await metaWritable.write(new Blob([JSON.stringify(meta)], { type: "application/json" }));
    await metaWritable.close();

    return true;
  } catch (e) {
    console.warn("[opfsStore] saveFolderSession failed:", e);
    return false;
  }
}

/** 폴더 세션 복원 — 메타 + Blob들을 File[]로 재구성 */
export async function loadFolderSession(
  sessionId: string,
): Promise<{ meta: OpfsSessionMeta; files: File[] } | null> {
  const root = await getRoot();
  if (!root) return null;

  try {
    const sessionDir = await root.getDirectoryHandle(sessionId, { create: false });
    const metaHandle = await sessionDir.getFileHandle(META_FILE, { create: false });
    const metaFile = await metaHandle.getFile();
    const meta: OpfsSessionMeta = JSON.parse(await metaFile.text());

    // TTL 체크
    if (Date.now() - meta.savedAt > TTL_MS) {
      await deleteFolderSession(sessionId);
      return null;
    }

    const files: File[] = [];
    for (const safeName of meta.fileNames) {
      try {
        const fh = await sessionDir.getFileHandle(safeName, { create: false });
        const f = await fh.getFile();
        // 원래 이름 복원 (index_ 접두사 제거)
        const originalName = safeName.replace(/^\d{5}_/, "");
        files.push(new File([f], originalName, { type: f.type, lastModified: f.lastModified }));
      } catch (e) {
        console.warn(`[opfsStore] missing file ${safeName}:`, e);
      }
    }
    return { meta, files };
  } catch (e) {
    console.warn("[opfsStore] loadFolderSession failed:", e);
    return null;
  }
}

/** 모든 폴더 세션 메타 목록 (복원 후보 노출용) */
export async function listFolderSessions(): Promise<OpfsSessionMeta[]> {
  const root = await getRoot();
  if (!root) return [];

  const result: OpfsSessionMeta[] = [];
  try {
    // @ts-expect-error — values() iterator는 표준이지만 TS 타입에 미반영
    for await (const entry of root.values()) {
      if (entry.kind !== "directory") continue;
      try {
        const metaHandle = await entry.getFileHandle(META_FILE, { create: false });
        const metaFile = await metaHandle.getFile();
        const meta: OpfsSessionMeta = JSON.parse(await metaFile.text());
        if (Date.now() - meta.savedAt <= TTL_MS) result.push(meta);
      } catch {
        // 메타 없거나 깨짐 → 스킵
      }
    }
  } catch (e) {
    console.warn("[opfsStore] listFolderSessions failed:", e);
  }
  return result.sort((a, b) => b.savedAt - a.savedAt);
}

/** 특정 세션 삭제 */
export async function deleteFolderSession(sessionId: string): Promise<void> {
  const root = await getRoot();
  if (!root) return;
  try {
    await root.removeEntry(sessionId, { recursive: true });
  } catch (e) {
    console.warn("[opfsStore] deleteFolderSession failed:", e);
  }
}

/** 만료된 세션 일괄 정리 (시작 시 1회 호출 권장) */
export async function clearExpiredSessions(): Promise<number> {
  const root = await getRoot();
  if (!root) return 0;
  let deleted = 0;
  try {
    // @ts-expect-error
    for await (const entry of root.values()) {
      if (entry.kind !== "directory") continue;
      try {
        const metaHandle = await entry.getFileHandle(META_FILE, { create: false });
        const metaFile = await metaHandle.getFile();
        const meta: OpfsSessionMeta = JSON.parse(await metaFile.text());
        if (Date.now() - meta.savedAt > TTL_MS) {
          await root.removeEntry(entry.name, { recursive: true });
          deleted++;
        }
      } catch {
        // 깨진 디렉토리는 그냥 둠 (조심스럽게)
      }
    }
  } catch (e) {
    console.warn("[opfsStore] clearExpiredSessions failed:", e);
  }
  return deleted;
}

/** 사용 중인 OPFS 용량 추정 (배너 표시용) */
export async function getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!isSupported() || typeof navigator.storage.estimate !== "function") return null;
  try {
    const est = await navigator.storage.estimate();
    return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
  } catch {
    return null;
  }
}
