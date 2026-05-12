/**
 * zipManager.ts — 24시간 ZIP 캐시 (IndexedDB)
 *
 * - 'ddalgak-zip-cache' 스토어에 sessionId 키로 ZIP Blob 저장
 * - 24h TTL 초과 시 자동 삭제
 * - 쿼터 초과 등은 무시 (인메모리 폴백)
 * - AppShell mount 시 clearExpiredZips fire-and-forget
 */

const DB_NAME = "ddalgak-zip-cache";
const STORE   = "zips";
const TTL_MS  = 24 * 60 * 60 * 1000;

export interface CachedZip {
  sessionId: string;
  blob: Blob;
  filename: string;
  size: number;
  createdAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "sessionId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function saveZip(
  sessionId: string,
  blob: Blob,
  filename: string,
): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({
        sessionId, blob, filename,
        size: blob.size,
        createdAt: Date.now(),
      } as CachedZip);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => resolve(); // 쿼터 초과 등 무시
    });
  } catch (e) {
    console.warn("[zipManager] saveZip failed:", e);
  }
}

export async function loadZip(sessionId: string): Promise<CachedZip | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx  = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(sessionId);
      req.onsuccess = () => {
        const data = req.result as CachedZip | undefined;
        if (!data) return resolve(null);
        if (Date.now() - data.createdAt > TTL_MS) {
          clearZip(sessionId).catch(() => {});
          return resolve(null);
        }
        resolve(data);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function clearZip(sessionId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(sessionId);
  } catch {
    // 무시
  }
}

export async function clearExpiredZips(): Promise<void> {
  try {
    const db  = await openDB();
    const tx  = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      const data = cursor.value as CachedZip;
      if (Date.now() - data.createdAt > TTL_MS) cursor.delete();
      cursor.continue();
    };
  } catch {
    // 무시
  }
}
