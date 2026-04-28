#!/usr/bin/env node
/**
 * bench:person — 인물 클러스터링 정확도 측정
 * 게이트: 동일인 매칭률 ≥ 90%, 다른 인물 분리율 ≥ 95%
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const DIR = "data/benchmark/person_clustering";
const labelsPath = resolve(DIR, "labels.json");
const resultsPath = resolve(DIR, "results.json");

if (!existsSync(labelsPath)) {
  console.error(`[bench:person] labels.json 없음: ${labelsPath}`); process.exit(1);
}
const { photos: labels, _gates: gates } = JSON.parse(readFileSync(labelsPath, "utf8"));
if (Object.keys(labels).length === 0) {
  console.warn("[bench:person] 라벨 데이터 없음. 사진 추가 후 재실행하세요."); process.exit(0);
}
if (!existsSync(resultsPath)) {
  console.log("[bench:person] results.json 없음 — npm run bench:person:collect 실행 필요"); process.exit(0);
}

const results = JSON.parse(readFileSync(resultsPath, "utf8"));

// ── 동일인 쌍 / 다른 인물 쌍 생성 ──────────────────────────────────────
const photoIds = Object.keys(labels);
let samePairs = 0, samePairsCorrect = 0;
let diffPairs = 0, diffPairsCorrect = 0;

for (let i = 0; i < photoIds.length; i++) {
  for (let j = i + 1; j < photoIds.length; j++) {
    const aId = photoIds[i], bId = photoIds[j];
    const aTrue = labels[aId]?.personId, bTrue = labels[bId]?.personId;
    const aPred = results[aId]?.primaryPersonId, bPred = results[bId]?.primaryPersonId;

    if (!aTrue || !bTrue || !aPred || !bPred) continue;

    if (aTrue === bTrue) {
      samePairs++;
      if (aPred === bPred) samePairsCorrect++;
    } else {
      diffPairs++;
      if (aPred !== bPred) diffPairsCorrect++;
    }
  }
}

const sameMatchRate = samePairsCorrect / samePairs || 0;
const diffSepRate   = diffPairsCorrect / diffPairs || 0;

console.log("┌─────────────────────────────────────┐");
console.log("│      인물 클러스터링 벤치마크 결과    │");
console.log("├─────────────────────────────────────┤");
console.log(`│ 동일인 매칭률  : ${(sameMatchRate * 100).toFixed(1).padStart(5)}%  게이트: ≥${(gates.samePersonMatchRate * 100).toFixed(0)}%  ${sameMatchRate >= gates.samePersonMatchRate ? "✅" : "❌"}`);
console.log(`│ 다른 인물 분리율: ${(diffSepRate * 100).toFixed(1).padStart(5)}%  게이트: ≥${(gates.differentPersonSeparationRate * 100).toFixed(0)}%  ${diffSepRate >= gates.differentPersonSeparationRate ? "✅" : "❌"}`);
console.log(`│ 동일인 쌍: ${samePairs} / 다른 인물 쌍: ${diffPairs}`);
console.log("└─────────────────────────────────────┘");

const passed = sameMatchRate >= gates.samePersonMatchRate && diffSepRate >= gates.differentPersonSeparationRate;
if (!passed) { console.error("\n❌ 게이트 통과 실패"); process.exit(1); }
console.log("\n✅ 모든 게이트 통과");
