/**
 * concurrency.ts — Promise 동시성 컨트롤러 (의존성 0)
 *
 * 사용:
 *   const results = await runWithConcurrency(items, async (it, i) => {
 *     return await downloadDriveFile(it, token);
 *   }, 8, (done, total) => onProgress(done, total));
 *
 * - allSettled 패턴: 일부 실패해도 전체 진행 계속
 * - 진행률 콜백 단조 증가 보장
 */

export interface RunResult<T, R> {
  ok: { item: T; index: number; value: R }[];
  err: { item: T; index: number; error: unknown }[];
}

export async function runWithConcurrency<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency = 8,
  onProgress?: (done: number, total: number) => void,
): Promise<RunResult<T, R>> {
  const ok: RunResult<T, R>["ok"] = [];
  const err: RunResult<T, R>["err"] = [];
  let nextIndex = 0;
  let done = 0;

  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      try {
        const value = await fn(items[i], i);
        ok.push({ item: items[i], index: i, value });
      } catch (error) {
        err.push({ item: items[i], index: i, error });
      } finally {
        done++;
        onProgress?.(done, items.length);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);

  // 결과를 원래 순서로 정렬
  ok.sort((a, b) => a.index - b.index);
  err.sort((a, b) => a.index - b.index);
  return { ok, err };
}
