/**
 * sessionPersist.ts
 * IndexedDB 기반 세션 저장/복구
 * - 선택된 사진의 썸네일(dataURL) + 메타데이터만 저장 (File 객체는 저장 불가)
 * - 24시간 TTL
 * - DB: ddalgak-session-v1
 */

const DB_NAME = "ddalgak-session-v1";
const DB_VERSION = 1;
const STORE_NAME = "session";
const SESSION_KEY = "current";
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface PersistedPhoto {
  id: string;
  filename: string;
  thumbnail: string; // dataURL
  score: number;
  deductions: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  isSelected: boolean;
}

export interface PersistedSession {
  savedAt: number;
  photoType: string;
  targetCount: number;
  locale: string;
  totalCount: number;
  selectedCount: number;
  selectedPhotos: PersistedPhoto[]; // 선택된 사진만 저장
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSession(session: PersistedSession): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(session, SESSION_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    // IndexedDB가 없거나 private mode면 무시
    console.warn("[sessionPersist] save failed:", e);
  }
}

export async function loadSession(): Promise<PersistedSession | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(SESSION_KEY);
      req.onsuccess = () => {
        const data = req.result as PersistedSession | undefined;
        if (!data) { resolve(null); return; }
        // TTL 체크
        if (Date.now() - data.savedAt > TTL_MS) {
          resolve(null);
          clearSession().catch(() => {});
          return;
        }
        resolve(data);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("[sessionPersist] load failed:", e);
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(SESSION_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve(); // 실패해도 무시
    });
  } catch {
    // 무시
  }
}
