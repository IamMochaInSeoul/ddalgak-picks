/**
 * sceneChange.ts
 * F5 -- 씬(Scene) 변화 감지
 * 색상 히스토그램 거리로 의상·배경 변화를 판별.
 */

const BINS = 16; // per channel, 16^3 = 4096 total buckets

/** Build an RGB histogram (normalized) from ImageData */
export function buildHistogram(imageData: ImageData): Float32Array {
  const hist = new Float32Array(BINS * BINS * BINS);
  const { data, width, height } = imageData;
  const total = width * height;

  for (let i = 0; i < data.length; i += 4) {
    const r = Math.floor((data[i]     / 256) * BINS);
    const g = Math.floor((data[i + 1] / 256) * BINS);
    const b = Math.floor((data[i + 2] / 256) * BINS);
    const idx = r * BINS * BINS + g * BINS + b;
    hist[idx]++;
  }

  // Normalize
  for (let i = 0; i < hist.length; i++) {
    hist[i] /= total;
  }

  return hist;
}

/**
 * Chi-squared histogram distance.
 * Returns a value in [0, Infinity); typically < 0.1 for same scene,
 * > 0.3 for clear scene change (outfit/background change).
 */
export function histogramDistance(a: Float32Array, b: Float32Array): number {
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const sum = a[i] + b[i];
    if (sum > 0) {
      const diff = a[i] - b[i];
      dist += (diff * diff) / sum;
    }
  }
  return dist * 0.5;
}

/**
 * Returns true when the two histograms differ enough to indicate
 * a scene change (different outfit or background).
 *
 * Threshold 0.25: conservative — flags clear costume/scene changes.
 */
export function isSceneChange(a: Float32Array, b: Float32Array, threshold = 0.25): boolean {
  return histogramDistance(a, b) > threshold;
}

/**
 * Assign scene IDs to an ordered list of photos by comparing adjacent histograms.
 * Photos with no histogram get the previous photo's scene ID.
 */
export function assignSceneIds(
  photos: Array<{ id: string; histogram?: Float32Array }>
): Map<string, string> {
  const result = new Map<string, string>();
  let currentScene = 0;
  let prevHist: Float32Array | null = null;

  for (const photo of photos) {
    if (!photo.histogram) {
      result.set(photo.id, `scene-${currentScene}`);
      continue;
    }
    if (prevHist && isSceneChange(prevHist, photo.histogram)) {
      currentScene++;
    }
    result.set(photo.id, `scene-${currentScene}`);
    prevHist = photo.histogram;
  }

  return result;
}
