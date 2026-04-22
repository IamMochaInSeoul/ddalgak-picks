/**
 * Laplacian variance — measures image sharpness.
 * Higher = sharper. Blurry images have low variance.
 */
export function laplacianVariance(
  imageData: ImageData,
  x = 0,
  y = 0,
  w?: number,
  h?: number
): number {
  const width = w ?? imageData.width;
  const height = h ?? imageData.height;
  const data = imageData.data;
  const imgW = imageData.width;

  // Laplacian kernel: [0,1,0, 1,-4,1, 0,1,0]
  const values: number[] = [];

  for (let row = y + 1; row < y + height - 1; row++) {
    for (let col = x + 1; col < x + width - 1; col++) {
      const idx = (row * imgW + col) * 4;
      const center =
        0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

      const top = (() => {
        const i = ((row - 1) * imgW + col) * 4;
        return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      })();
      const bottom = (() => {
        const i = ((row + 1) * imgW + col) * 4;
        return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      })();
      const left = (() => {
        const i = (row * imgW + (col - 1)) * 4;
        return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      })();
      const right = (() => {
        const i = (row * imgW + (col + 1)) * 4;
        return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      })();

      values.push(top + bottom + left + right - 4 * center);
    }
  }

  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return variance;
}

/** Normalize laplacian variance to [0, 1] */
export function sharpnessScore(variance: number, maxVar = 500): number {
  return Math.min(variance / maxVar, 1);
}
