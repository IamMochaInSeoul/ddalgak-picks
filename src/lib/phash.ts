/**
 * Perceptual hash (pHash) using DCT.
 * Returns a 64-bit hash as BigInt.
 */

function createDCT(size: number): number[][] {
  const dct: number[][] = [];
  for (let u = 0; u < size; u++) {
    dct[u] = [];
    for (let x = 0; x < size; x++) {
      dct[u][x] =
        (u === 0 ? 1 / Math.sqrt(size) : Math.sqrt(2 / size)) *
        Math.cos(((2 * x + 1) * u * Math.PI) / (2 * size));
    }
  }
  return dct;
}

const HASH_SIZE = 8;
const DCT_SIZE = 32;
const dctMatrix = createDCT(DCT_SIZE);

/**
 * Get ImageData from an ImageBitmap at DCT_SIZE x DCT_SIZE.
 * Tries OffscreenCanvas first, falls back to regular <canvas>.
 */
function getResizedImageData(imageBitmap: ImageBitmap): ImageData {
  // Try OffscreenCanvas (available in most modern browsers)
  try {
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(DCT_SIZE, DCT_SIZE);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(imageBitmap, 0, 0, DCT_SIZE, DCT_SIZE);
        return ctx.getImageData(0, 0, DCT_SIZE, DCT_SIZE);
      }
    }
  } catch {
    // Fall through to regular canvas
  }

  // Fallback: regular <canvas> element
  const canvas = document.createElement("canvas");
  canvas.width = DCT_SIZE;
  canvas.height = DCT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(imageBitmap, 0, 0, DCT_SIZE, DCT_SIZE);
  return ctx.getImageData(0, 0, DCT_SIZE, DCT_SIZE);
}

export async function pHash(
  imageBitmap: ImageBitmap
): Promise<bigint> {
  const imageData = getResizedImageData(imageBitmap);

  // Convert to grayscale matrix
  const gray: number[][] = [];
  for (let y = 0; y < DCT_SIZE; y++) {
    gray[y] = [];
    for (let x = 0; x < DCT_SIZE; x++) {
      const idx = (y * DCT_SIZE + x) * 4;
      gray[y][x] =
        0.299 * imageData.data[idx] +
        0.587 * imageData.data[idx + 1] +
        0.114 * imageData.data[idx + 2];
    }
  }

  // 2D DCT
  const dct2: number[][] = Array.from({ length: DCT_SIZE }, () =>
    new Array(DCT_SIZE).fill(0)
  );
  for (let u = 0; u < DCT_SIZE; u++) {
    for (let v = 0; v < DCT_SIZE; v++) {
      let sum = 0;
      for (let x = 0; x < DCT_SIZE; x++) {
        for (let y = 0; y < DCT_SIZE; y++) {
          sum += dctMatrix[u][x] * dctMatrix[v][y] * gray[y][x];
        }
      }
      dct2[u][v] = sum;
    }
  }

  // Top-left HASH_SIZE x HASH_SIZE (low frequencies)
  const top: number[] = [];
  for (let u = 0; u < HASH_SIZE; u++) {
    for (let v = 0; v < HASH_SIZE; v++) {
      top.push(dct2[u][v]);
    }
  }

  // Skip DC component (index 0) for mean calculation
  const ac = top.slice(1);
  const mean = ac.reduce((a, b) => a + b, 0) / ac.length;

  // Build hash: bit = 1 if above mean
  let hash = 0n;
  for (let i = 0; i < 64; i++) {
    if (top[i] > mean) hash |= 1n << BigInt(i);
  }
  return hash;
}

/** Hamming distance between two pHashes */
export function hammingDistance(a: bigint, b: bigint): number {
  let diff = a ^ b;
  let count = 0;
  while (diff > 0n) {
    count += Number(diff & 1n);
    diff >>= 1n;
  }
  return count;
}

/** Group photos by pHash similarity (hamming distance <= threshold) */
export function groupByHash(
  photos: { id: string; hash: bigint }[],
  threshold = 10
): string[][] {
  const groups: string[][] = [];
  const assigned = new Set<string>();

  for (const photo of photos) {
    if (assigned.has(photo.id)) continue;

    const group: string[] = [photo.id];
    assigned.add(photo.id);

    for (const other of photos) {
      if (assigned.has(other.id)) continue;
      if (hammingDistance(photo.hash, other.hash) <= threshold) {
        group.push(other.id);
        assigned.add(other.id);
      }
    }
    groups.push(group);
  }

  return groups;
}

/**
 * 씬(Scene) 클러스터링: 연사 그룹들을 더 넓은 임계값으로 묶어
 * 같은 의상/배경 세트를 하나의 "씬"으로 분류한다.
 *
 * @param groupHashes  연사 그룹별 대표 hash (groupId → hash)
 * @param threshold    씬 클러스터 임계값 (기본 22 — 같은 의상/배경)
 * @returns            groupId → sceneId 매핑
 */
export function clusterScenes(
  groupHashes: { groupId: string; hash: bigint }[],
  threshold = 22
): Map<string, string> {
  const result = new Map<string, string>();      // groupId → sceneId
  const sceneCentroids: { sceneId: string; hash: bigint }[] = [];

  for (const g of groupHashes) {
    // 기존 씬 중 가장 가까운 것 탐색
    let bestScene: string | null = null;
    let bestDist = threshold + 1;

    for (const s of sceneCentroids) {
      const d = hammingDistance(g.hash, s.hash);
      if (d <= threshold && d < bestDist) {
        bestDist = d;
        bestScene = s.sceneId;
      }
    }

    if (bestScene) {
      result.set(g.groupId, bestScene);
    } else {
      // 새 씬 생성
      const sceneId = `scene_${sceneCentroids.length}`;
      sceneCentroids.push({ sceneId, hash: g.hash });
      result.set(g.groupId, sceneId);
    }
  }

  return result;
}
