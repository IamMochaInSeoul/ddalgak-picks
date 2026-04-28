#!/usr/bin/env node
/**
 * bench:gaze — 시선 추정 정확도 측정
 * 게이트: accuracy ≥ 80%
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const DIR = "data/benchmark/gaze";
const labelsPath = resolve(DIR, "labels.json");
const resultsPath = resolve(DIR, "results.json");

if (!existsSync(labelsPath)) {
  console.error(`[bench:gaze] labels.json 없음`); process.exit(1);
}
const { photos: labels, _gates: gates } = JSON.parse(readFileSync(labelsPath, "utf8"));
if (Object.keys(labels).length === 0) {
  console.warn("[bench:gaze] 라벨 데이터 없음."); process.exit(0);
}
if (!existsSync(resultsPath)) {
  console.log("[bench:gaze] results.json 없음"); process.exit(0);
}

const results = JSON.parse(readFileSync(resultsPath, "utf8"));
let correct = 0, total = 0;

for (const [id, label] of Object.entries(labels)) {
  const pred = results[id];
  if (!pred) continue;
  total++;
  if (pred.isLookingAtCamera === label.lookingAtCamera) correct++;
}

const accuracy = correct / total || 0;
console.log("┌─────────────────────────────────────┐");
console.log("│       시선 추정 벤치마크 결과         │");
console.log("├─────────────────────────────────────┤");
console.log(`│ Accuracy: ${(accuracy * 100).toFixed(1).padStart(5)}%  게이트: ≥${(gates.accuracy * 100).toFixed(0)}%  ${accuracy >= gates.accuracy ? "✅" : "❌"}`);
console.log(`│ 총 ${total}장 (정답 ${correct}장)`);
console.log("└─────────────────────────────────────┘");

if (accuracy < gates.accuracy) { console.error("\n❌ 게이트 통과 실패"); process.exit(1); }
console.log("\n✅ 모든 게이트 통과");
