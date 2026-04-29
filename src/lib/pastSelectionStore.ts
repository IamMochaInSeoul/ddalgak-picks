/**
 * pastSelectionStore.ts
 * 과거 세션에서 선별한 사진의 pHash 지문만 IndexedDB에 저장한다.
 *
 * 보안 원칙 (SECURITY.md §5):
 * - 원본 사진 픽셀·파일 내용 일절 저장하지 않음
 * - 저장값: pHash(bigint→string), 파일명, 세션ID, 저장 시각
 * - IndexedDB는 same-origin이므로 외부 접근 불가
 */

const DB_NAME = "ddalgak-dedupe";
const STORE_NAME = "past-hashes";
const DB_VERSION = 1;

export interface PastHashRecord {
  /** bigint를 직렬화한 10진수 문자열 */
  hash: string;
  filename: string;
  sessionId: string;
  savedAt: number;
}

// ── DB 열기 ────────────────────────────────────────────────────────────────
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { autoIncrement: true });
        store.createIndex("hash", "hash", { unique: false });
        store.createIndex("savedAt", "savedAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── 선별 결과 저장 ──────────────────────────────────────────────────────────
/**
 * @param entries  hash(bigint) + filename 쌍의 배열
 * @param sessionId  현재 세션 식별자 (folderSession.id 등)
 */
export async function savePastSelections(
  entries: Array<{ hash: bigint; filename: string }>,
  sessionId: string
): Promise<void> {
  if (entries.length === 0) return;
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const savedAt = Date.now();
  for (const e of entries) {
    const record: PastHashRecord = {
      hash: e.hash.toString(10),
      filename: e.filename,
      sessionId,
      savedAt,
    };
    store.add(record);
  }
  await new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}

// ── 과거 지문 전체 조회 ────────────────────────────────────────────────────
export async function loadPastHashes(): Promise<PastHashRecord[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const req = store.getAll();
  const records = await new Promise<PastHashRecord[]>((res, rej) => {
    req.onsuccess = () => res(req.result as PastHashRecord[]);
    req.onerror = () => rej(req.error);
  });
  db.close();
  return records;
}

// ── 오래된 지문 정리 (기본 30일) ──────────────────────────────────────────
export async function clearOldHashes(maxAgeDays = 30): Promise<void> {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const index = store.index("savedAt");
  // IDBKeyRange: savedAt < cutoff
  const range = IDBKeyRange.upperBound(cutoff, false);
  const req = index.openKeyCursor(range);
  req.onsuccess = () => {
    const cursor = req.result;
    if (cursor) {
      store.delete(cursor.primaryKey);
      cursor.continue();
    }
  };
  await new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}
