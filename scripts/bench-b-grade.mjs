#!/usr/bin/env node
/**
 * bench:b-grade — B급 사진 리콜 정확도 측정
 *
 * 사용법: npm run bench:b-grade [-- --dir data/benchmark/b_grade_recall]
 *
 * 전제: data/benchmark/b_grade_recall/labels.json 에 라벨이 있어야 함.
 * 사진 파일들은 각 서브폴더(maternity, newborn, 100days, first_birthday, family)에 위치.
 *
 * 출력: precision, recall, F1, FPR, 사유별 정밀도
 * 게이트: recall ≥ 92%, FPR ≤ 8%, F1 ≥ 0.85
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const DIR = process.argv.includes("--dir")
  ? process.argv[process.argv.indexOf("--dir") + 1]
  : "data/benchmark/b_grade_recall";

const labelsPath = resolve(DIR, "labels.json");
if (!existsSync(labelsPath)) {
  console.error(`[bench:b-grade] labels.json 없음: ${labelsPath}`);
  console.error("  → data/benchmark/b_grade_recall/labels.json 을 먼저 작성하세요.");
  process.exit(1);
}

const { photos: labels, _gates: gates } = JSON.parse(readFileSync(labelsPath, "utf8"));
const photoIds = Object.keys(labels);

if (photoIds.length === 0) {
  console.warn("[bench:b-grade] 라벨 데이터가 비어있습니다. 사진을 추가한 후 다시 실행하세요.");
  console.log("  디렉터리 구조:\n  data/benchmark/b_grade_recall/\n    ├── maternity/  (사진 파일)\n    ├── labels.json");
  process.exit(0);
}

// ── 분석 엔진 로드 (Vite 번들이 아닌 Node용 직접 실행) ─────────────────
// 실제 분석은 브라우저 MediaPipe를 사용하므로, 여기선 puppeteer/headless 방식으로 실행하거나
// 별도 Node 포트를 사용. 현재는 통계 계산 프레임워크만 제공.
console.log(`[bench:b-grade] ${photoIds.length}장 로드됨`);
console.log("  ⚠️  실제 분석 실행은 puppeteer 헤드리스 브라우저 환경이 필요합니다.");
console.log("  현재는 기존 results.json이 있는 경우에만 통계 계산합니다.\n");

const resultsPath = resolve(DIR, "results.json");
if (!existsSync(resultsPath)) {
  console.log("  results.json 없음 — 분석 결과 파일을 생성하세요:");
  console.log("  npm run bench:b-grade:collect  (puppeteer 실행, 별도 설치 필요)");
  process.exit(0);
}

const results = JSON.parse(readFileSync(resultsPath, "utf8"));

// ── 통계 계산 ──────────────────────────────────────────────────────────
let tp = 0, fp = 0, tn = 0, fn = 0;
const reasonStats = {};

for (const [photoId, label] of Object.entries(labels)) {
  const predicted = results[photoId];
  if (!predicted) continue;

  const actualB = label.grade === "B";
  const predictedB = !predicted.isSelected; // isSelected=false → B급으로 분류

  if (actualB && predictedB) { tp++; }
  else if (!actualB && predictedB) {
    fp++;
    // FP 사유 집계
    for (const r of (predicted.deductions ?? [])) {
      reasonStats[r] = (reasonStats[r] ?? { fp: 0, tp: 0 });
      reasonStats[r].fp++;
    }
  }
  else if (actualB && !predictedB) { fn++; }
  else { tn++; }

  if (actualB && predictedB) {
    for (const r of (label.reasons ?? [])) {
      reasonStats[r] = (reasonStats[r] ?? { fp: 0, tp: 0 });
      reasonStats[r].tp++;
    }
  }
}

const precision = tp / (tp + fp) || 0;
const recall    = tp / (tp + fn) || 0;
const f1        = 2 * precision * recall / (precision + recall) || 0;
const fpr       = fp / (fp + tn) || 0;

console.log("┌─────────────────────────────────────┐");
console.log("│     B급 사진 리콜 벤치마크 결과      │");
console.log("├─────────────────────────────────────┤");
console.log(`│ Precision : ${(precision * 100).toFixed(1).padStart(5)}%  (TP=${tp}, FP=${fp})`);
console.log(`│ Recall    : ${(recall * 100).toFixed(1).padStart(5)}%  게이트: ≥${(gates.recall * 100).toFixed(0)}%  ${recall >= gates.recall ? "✅" : "❌"}`);
console.log(`│ F1        : ${f1.toFixed(3).padStart(6)}   게이트: ≥${gates.f1}  ${f1 >= gates.f1 ? "✅" : "❌"}`);
console.log(`│ FPR       : ${(fpr * 100).toFixed(1).padStart(5)}%  게이트: ≤${(gates.fpr * 100).toFixed(0)}%  ${fpr <= gates.fpr ? "✅" : "❌"}`);
console.log("│");
console.log("│ 사유별 정밀도:");
for (const [reason, counts] of Object.entries(reasonStats)) {
  const p = counts.tp / (counts.tp + counts.fp) || 0;
  console.log(`│   ${reason.padEnd(20)} ${(p * 100).toFixed(1)}%`);
}
console.log("└─────────────────────────────────────┘");

const passed = recall >= gates.recall && fpr <= gates.fpr && f1 >= gates.f1;
if (!passed) {
  console.error("\n❌ 게이트 통과 실패 — 알고리즘 조정이 필요합니다.");
  process.exit(1);
}
console.log("\n✅ 모든 게이트 통과");
