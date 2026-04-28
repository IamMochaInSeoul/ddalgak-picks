const WATERMARK_TEXT = "딸깍픽스 ddalgak-picks.vercel.app";
const OPACITY = 0.28;
const FONT_RATIO = 0.045; // relative to image width

export async function applyWatermark(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;

  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const fontSize = Math.max(16, Math.round(width * FONT_RATIO));
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.globalAlpha = OPACITY;

  // shadow for readability on both light/dark backgrounds
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 6;
  ctx.fillStyle = "#ffffff";

  // 대각선으로 3회 반복 배치
  const positions = [
    { x: width * 0.25, y: height * 0.35 },
    { x: width * 0.5,  y: height * 0.6  },
    { x: width * 0.75, y: height * 0.8  },
  ];

  ctx.save();
  for (const { x, y } of positions) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-Math.PI / 8);
    ctx.fillText(WATERMARK_TEXT, 0, 0);
    ctx.restore();
  }
  ctx.restore();

  // JPEG로 출력 (원본이 PNG면 품질 손실 있음 — 무료 티어 의도적 제한)
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.88 });
}
