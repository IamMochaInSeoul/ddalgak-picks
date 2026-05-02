#!/bin/bash
# scripts/download-face-models.sh
# face-api.js FaceRecognitionNet 모델 가중치 다운로드
# 실행: bash scripts/download-face-models.sh

set -e

DEST="public/models/face-api"
BASE="https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights"

echo "=== face-api.js 모델 다운로드 ==="
mkdir -p "$DEST"

# FaceRecognitionNet (128-dim embeddings) — ~6.2MB
FILES=(
  "face_recognition_model-weights_manifest.json"
  "face_recognition_model-shard1"
)

for f in "${FILES[@]}"; do
  echo -n "  $f ... "
  curl -sf -o "${DEST}/${f}" "${BASE}/${f}" && echo "✓" || echo "✗ FAILED"
done

echo ""
echo "=== 완료 ==="
ls -lh "$DEST"
