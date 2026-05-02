
import type {
  PhotoEntry,
  PhotoGroup,
  PhotoType,
  AnalysisWeights,
  PetWeights,
  Filters,
  ConfidenceGrade,
  FaceFeature,
  PersonCluster,
  Landmark,
} from "./types";
import { laplacianVariance, sharpnessScore } from "./laplacian";
import { pHash, groupByHash, clusterScenes } from "./phash";
import {
  calcPortraitScore,
  calcPortraitDeductions,
  calcPetScore,
  calcPetDeductions,
  calcGroupConfidence,
  selectTopPhotosWithSceneDiversity,
} from "./scorer";
import {
  computeEARBoth,
  computeMAR,
  computeCheekRise,
  computeMouthCornerAngle,
  computeGaze,
  classifyEye,
} from "./eye";
import { computeFaceEmbedding } from "./faceEmbedding";
import { clusterPersons } from "./personClustering";

const THUMB_SIZE = 400;
const MEDIAPIPE_VERSION = "0.10.34";
const MEDIAPIPE_CDN =
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;

let faceLandmarker: unknown = null;
let faceDetector: unknown = null;   // BlazeFace — 보조 감지 모델

// BlazeFace: FaceLandmarker보다 아이 얼굴·다양한 각도에 강함 (모자 착용 등)
async function loadFaceDetector() {
  if (faceDetector) return faceDetector;
  try {
    const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_CDN);
    for (const delegate of ["GPU", "CPU"] as const) {
      try {
        faceDetector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
            delegate,
          },
          runningMode: "IMAGE",
          minDetectionConfidence: 0.15,
          minSuppressionThreshold: 0.3,
        });
        return faceDetector;
      } catch { /* try next delegate */ }
    }
  } catch { /* FaceDetector 불가 — 계속 진행 */ }
  return null;
}

async function loadFaceLandmarker() {
  if (faceLandmarker) return faceLandmarker;

  const { FaceLandmarker, FilesetResolver } = await import(
    "@mediapipe/tasks-vision"
  );

  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_CDN);

  const delegates: Array<"GPU" | "CPU"> = ["GPU", "CPU"];
  const errors: string[] = [];

  for (const delegate of delegates) {
    try {
      faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate,
        },
        outputFaceBlendshapes: true,
        runningMode: "IMAGE",
        numFaces: 10,
        // 감지 민감도를 높여서 스튜디오 사진 (측면, 강한 조명 등)도 감지
        minFaceDetectionConfidence: 0.2,
        minFacePresenceConfidence: 0.2,
        minTrackingConfidence: 0.2,
      });

      return faceLandmarker;
    } catch (error) {
      errors.push(`${delegate}: ${normalizeError(error)}`);
    }
  }

  throw new Error(
    `Face Landmarker load failed (${errors.join(" | ") || "unknown"})`
  );
}

function normalizeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;

  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== "{}") return serialized;
  } catch {
    // Ignore serialization issues and fall back to a generic message.
  }

  return "Unknown error";
}

/** Serialize any error to a user-readable string, including non-Error objects */
export function serializeError(error: unknown): string {
  if (error instanceof Error) {
    const parts = [`[${error.name}] ${error.message}`];
    if (error.stack) parts.push(error.stack.split("\n").slice(1, 4).join(" | "));
    return parts.join("\n");
  }
  if (typeof error === "string" && error.trim()) return error;
  try {
    const s = JSON.stringify(error);
    if (s && s !== "{}") return s;
  } catch {
    // ignore
  }
  return `[비표준 오류] ${String(error)}`;
}

function buildFallbackPortraitScore(sharpness: number) {
  return {
    eyeOpen: 0.5,
    sharpness,
    expression: 0.5,
    facing: 0.5,
    total: Math.min(sharpness * 0.7 + 0.15, 1),
  };
}

function createThumbnail(bitmap: ImageBitmap): string {
  const scale = Math.min(THUMB_SIZE / bitmap.width, THUMB_SIZE / bitmap.height, 1);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.8);
}

export async function analyzePhotos(
  files: File[],
  photoType: PhotoType,
  targetCount: number,
  weights: AnalysisWeights,
  petWeights: PetWeights,
  _filters: Filters,
  onProgress: (current: number, total: number, stage: string) => void,
  maxPerGroup = 2
): Promise<{
  photos: Map<string, PhotoEntry>;
  groups: PhotoGroup[];
  groupScoresWithScene: { groupId: string; sceneId: string; photoId: string; score: number }[];
  personClusters: Map<string, PersonCluster>;
}> {
  const total = files.length;
  const photosMap = new Map<string, PhotoEntry>();
  const hashEntries: { id: string; hash: bigint }[] = [];

  // ── Stage 1: Load & hash ─────────────────────────────────────────────────
  let faceLandmarkerInstance: unknown = null;
  let faceDetectorInstance: unknown = null;
  if (photoType !== "pet") {
    onProgress(0, total, "loadingModel");
    // 두 모델 병렬 로드 — FaceLandmarker(정밀) + BlazeFace(강건, 아이/모자 등에 강함)
    const [lmResult, fdResult] = await Promise.allSettled([
      loadFaceLandmarker(),
      loadFaceDetector(),
    ]);
    faceLandmarkerInstance = lmResult.status === "fulfilled" ? lmResult.value : null;
    faceDetectorInstance   = fdResult.status  === "fulfilled" ? fdResult.value  : null;
    if (!faceLandmarkerInstance) {
      console.warn("[ddalgak-picks] FaceLandmarker unavailable, sharpness-only mode.");
    }
  }

  onProgress(0, total, "grouping");

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const id = `photo_${i}_${file.name}`;

    onProgress(i, total, "grouping");

    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      continue;
    }

    // pHash wrapped in try-catch — if canvas/OffscreenCanvas fails,
    // assign a unique random hash so the photo still gets processed individually.
    let hash: bigint;
    try {
      hash = await pHash(bitmap);
    } catch (hashErr) {
      console.warn("[ddalgak-picks] pHash failed for", file.name, hashErr);
      // Use file index as a unique "hash" — ensures no false grouping
      hash = BigInt(i) << 32n | BigInt(Math.floor(Math.random() * 0xffffffff));
    }
    hashEntries.push({ id, hash });

    let thumbnail: string;
    try {
      thumbnail = createThumbnail(bitmap);
    } catch {
      thumbnail = "";
    }
    bitmap.close();

    photosMap.set(id, {
      id,
      file,
      hash,
      groupId: "",
      score: null,
      deductions: [],
      confidence: "LOW",
      thumbnail,
      isSelected: false,
      faceDetected: false,
    });
  }

  // ── Stage 2: Group by hash ───────────────────────────────────────────────
  onProgress(0, total, "grouping");
  const rawGroups = groupByHash(hashEntries, 10);
  const groupIds = rawGroups.map((_, i) => `group_${i}`);

  for (let gi = 0; gi < rawGroups.length; gi++) {
    for (const photoId of rawGroups[gi]) {
      const p = photosMap.get(photoId);
      if (p) p.groupId = groupIds[gi];
    }
  }

  // ── Stage 3: Score each photo ────────────────────────────────────────────
  onProgress(0, total, "scoring");

  const groupScores: { groupId: string; photoId: string; score: number }[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const id = `photo_${i}_${file.name}`;
    const entry = photosMap.get(id);
    if (!entry) continue;

    onProgress(i, total, "scoring");

    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      continue;
    }

    // Draw to canvas for pixel access
    // 1200px: 더 작은 얼굴(단체사진 등)도 감지 가능
    const canvas = document.createElement("canvas");
    const maxDim = 1200;
    const scale = Math.min(maxDim / bitmap.width, maxDim / bitmap.height, 1);
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      continue;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    // 전체 이미지 선명도 (페트 / 얼굴 미감지 폴백용)
    const fullImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const lapVarFull = laplacianVariance(fullImageData);
    const sharpFull = sharpnessScore(lapVarFull);

    // 얼굴 미감지 시 중앙 60% 영역 선명도 (배경 제거)
    const cx = Math.floor(canvas.width * 0.2);
    const cy = Math.floor(canvas.height * 0.15);
    const cw2 = Math.floor(canvas.width * 0.6);
    const ch2 = Math.floor(canvas.height * 0.7);
    const centerImageData = ctx.getImageData(cx, cy, cw2, ch2);
    const lapVarCenter = laplacianVariance(centerImageData);
    const sharpCenter = sharpnessScore(lapVarCenter);

    if (photoType === "pet") {
      // Pet: use sharpness + eye-region heuristic + centering
      const cw = canvas.width;
      const ch = canvas.height;
      // Assume subject fills most of frame (no detection), center region
      const eyeRegionData = ctx.getImageData(
        Math.floor(cw * 0.2),
        Math.floor(ch * 0.1),
        Math.floor(cw * 0.6),
        Math.floor(ch * 0.35)
      );
      const eyeLap = laplacianVariance(eyeRegionData);
      const eyeSharp = sharpnessScore(eyeLap, 300);

      // Brightness of eye region
      let brightness = 0;
      for (let p = 0; p < eyeRegionData.data.length; p += 4) {
        brightness +=
          0.299 * eyeRegionData.data[p] +
          0.587 * eyeRegionData.data[p + 1] +
          0.114 * eyeRegionData.data[p + 2];
      }
      brightness /= eyeRegionData.data.length / 4 / 255;
      const eyeScore = eyeSharp * 0.6 + brightness * 0.4;

      const petScore = calcPetScore(
        sharpFull,
        eyeScore,
        { x: cw / 2, y: ch / 2 },
        { w: cw, h: ch },
        petWeights
      );
      entry.score = petScore;
      entry.deductions = calcPetDeductions(petScore);
      entry.faceDetected = true;
      groupScores.push({ groupId: entry.groupId, photoId: id, score: petScore.total });
    } else {
      // Portrait: use MediaPipe
      if (!faceLandmarkerInstance) {
        entry.faceDetected = false;
        entry.score = buildFallbackPortraitScore(sharpCenter);
        entry.deductions = sharpCenter < 0.3 ? ["BLUR", "LOW_CONFIDENCE"] : ["LOW_CONFIDENCE"];
        groupScores.push({ groupId: entry.groupId, photoId: id, score: entry.score.total });
        continue;
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lm = faceLandmarkerInstance as any;

        /**
         * 얼굴 감지 헬퍼: 특정 영역을 원본 canvas 크기로 확대(스케일업)해서 detect
         * ─ 이전 구현의 버그: 잘라낸 크기 그대로 전달 → 얼굴 크기 불변
         * ─ 수정: 잘라낸 영역을 canvas 전체 크기로 확대 → 얼굴이 몇 배로 커짐
         */
        const tryRegion = (sx: number, sy: number, sw: number, sh: number) => {
          const zc = document.createElement("canvas");
          zc.width = canvas.width;
          zc.height = canvas.height;
          const zctx = zc.getContext("2d");
          if (!zctx) return null;
          zctx.imageSmoothingEnabled = true;
          zctx.imageSmoothingQuality = "high";
          // 잘라낸 영역(sx,sy,sw,sh)을 전체 캔버스(width×height)로 확대
          zctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
          const r = lm.detect(zc);
          return (r.faceBlendshapes ?? []).length > 0 ? r : null;
        };

        // 시도 1: 전체 이미지 (표준)
        let result = lm.detect(canvas);
        let faces = result.faceBlendshapes ?? [];

        // 시도 2: 상단 50% → 원본 크기로 확대 (얼굴 2× 커짐)
        if (faces.length === 0) {
          const r2 = tryRegion(0, 0, canvas.width, Math.floor(canvas.height * 0.50));
          if (r2) { result = r2; faces = r2.faceBlendshapes ?? []; }
        }

        // 시도 3: 상단-중앙 30% → 원본 크기로 확대 (얼굴 3.3× 커짐)
        // 전신샷에서 얼굴이 10% 차지해도 이 단계에서 33%로 확대됨
        if (faces.length === 0) {
          const sx = Math.floor(canvas.width * 0.10);
          const sw = Math.floor(canvas.width * 0.80);
          const sh = Math.floor(canvas.height * 0.30);
          const r3 = tryRegion(sx, 0, sw, sh);
          if (r3) { result = r3; faces = r3.faceBlendshapes ?? []; }
        }

        // 시도 4: 상단 20% → 원본 크기로 확대 (얼굴 5× 커짐, 최후 시도)
        if (faces.length === 0) {
          const sh = Math.floor(canvas.height * 0.20);
          const r4 = tryRegion(0, 0, canvas.width, sh);
          if (r4) { result = r4; faces = r4.faceBlendshapes ?? []; }
        }

        // 시도 5: FaceLandmarker 전부 실패 → BlazeFace FaceDetector로 최종 확인
        // BlazeFace는 아이 얼굴, 모자 착용, 측면 포즈에 FaceLandmarker보다 강건함
        let blazeFaceDetected = false;
        if (faces.length === 0 && faceDetectorInstance) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fd = faceDetectorInstance as any;
            // 전체 이미지 시도
            let fdResult = fd.detect(canvas);
            if ((fdResult.detections ?? []).length === 0) {
              // 상단 50% 확대 시도 (얼굴 크기 2× 증가)
              const zc = document.createElement("canvas");
              zc.width = canvas.width;
              zc.height = canvas.height;
              const zctx = zc.getContext("2d");
              if (zctx) {
                zctx.drawImage(canvas, 0, 0, canvas.width, Math.floor(canvas.height * 0.5), 0, 0, canvas.width, canvas.height);
                fdResult = fd.detect(zc);
              }
            }
            blazeFaceDetected = (fdResult.detections ?? []).length > 0;
          } catch {
            blazeFaceDetected = false;
          }
        }

        if (faces.length === 0 && !blazeFaceDetected) {
          entry.faceDetected = false;
          entry.score = buildFallbackPortraitScore(sharpCenter);
          entry.deductions = ["NO_SUBJECT", ...(sharpCenter < 0.3 ? ["BLUR" as const] : [])];
          groupScores.push({ groupId: entry.groupId, photoId: id, score: entry.score.total });
        } else if (faces.length === 0 && blazeFaceDetected) {
          entry.faceDetected = true;
          entry.score = buildFallbackPortraitScore(sharpCenter);
          entry.deductions = sharpCenter < 0.3 ? ["BLUR" as const] : [];
          groupScores.push({ groupId: entry.groupId, photoId: id, score: entry.score.total });
        } else {
          entry.faceDetected = true;

          // 얼굴 영역 선명도 계산 (보케 배경은 제외, 실제 피사체만 측정)
          let sharpFace = sharpCenter; // 기본값: 중앙 영역
          try {
            const allLandmarks = result.faceLandmarks ?? [];
            if (allLandmarks.length > 0) {
              // 모든 얼굴의 랜드마크를 합쳐서 전체 얼굴 영역 bbox 계산
              let minX = 1, maxX = 0, minY = 1, maxY = 0;
              for (const lmSet of allLandmarks) {
                for (const pt of lmSet) {
                  if (pt.x < minX) minX = pt.x;
                  if (pt.x > maxX) maxX = pt.x;
                  if (pt.y < minY) minY = pt.y;
                  if (pt.y > maxY) maxY = pt.y;
                }
              }
              // 20% 여백 확장 후 canvas 픽셀 좌표로 변환
              const margin = 0.20;
              const bx = Math.max(0, Math.floor((minX - margin * (maxX - minX)) * canvas.width));
              const by = Math.max(0, Math.floor((minY - margin * (maxY - minY)) * canvas.height));
              const bw = Math.min(canvas.width - bx, Math.ceil((maxX - minX) * (1 + 2 * margin) * canvas.width));
              const bh = Math.min(canvas.height - by, Math.ceil((maxY - minY) * (1 + 2 * margin) * canvas.height));
              if (bw > 10 && bh > 10) {
                const faceRegionData = ctx.getImageData(bx, by, bw, bh);
                sharpFace = sharpnessScore(laplacianVariance(faceRegionData));
              }
            }
          } catch { /* 실패 시 sharpCenter 유지 */ }

          // 복수 얼굴: 가장 낮은 점수(가장 나쁜 컷 기준)로 평가
          let worstScore = 1;
          let worstBlendshapes: Record<string, number> = {};
          let headYaw = 0;
          let headPitch = 0;
          const faceFeaturesList: FaceFeature[] = [];

          for (let fi = 0; fi < faces.length; fi++) {
            const bs: Record<string, number> = {};
            for (const cat of faces[fi].categories) {
              bs[cat.categoryName] = cat.score;
            }
            const face_landmarks = result.faceLandmarks?.[fi];
            let yaw = 0;
            let pitch = 0;
            if (face_landmarks) {
              const noseTip = face_landmarks[4];
              const leftEye = face_landmarks[33];
              const rightEye = face_landmarks[263];
              if (noseTip && leftEye && rightEye) {
                const eyeMidX = (leftEye.x + rightEye.x) / 2;
                yaw = (noseTip.x - eyeMidX) * 90;
                pitch = (noseTip.y - (leftEye.y + rightEye.y) / 2) * 60;
              }
            }
            // 얼굴 영역 선명도 사용
            const faceScore = calcPortraitScore(bs, yaw, pitch, sharpFace, weights);
            if (faceScore.total < worstScore) {
              worstScore = faceScore.total;
              worstBlendshapes = bs;
              headYaw = yaw;
              headPitch = pitch;
            }

            // §3 — FaceFeature 빌드 (embedding + clustering 소스)
            if (face_landmarks && face_landmarks.length >= 468) {
              const lm = face_landmarks as unknown as Landmark[];
              const { earLeft, earRight } = computeEARBoth(lm);
              const marInner = computeMAR(lm);
              const cheekRise = computeCheekRise(lm);
              const mouthCornerAngle = computeMouthCornerAngle(lm);
              const eyeClass = classifyEye({ earLeft, earRight, marInner, cheekRise, mouthCornerAngle });

              // bbox from landmark min/max
              let minX = 1, maxX = 0, minY = 1, maxY = 0;
              for (const pt of lm) {
                if (pt.x < minX) minX = pt.x;
                if (pt.x > maxX) maxX = pt.x;
                if (pt.y < minY) minY = pt.y;
                if (pt.y > maxY) maxY = pt.y;
              }

              // roll from eye corners (right=33, left=263)
              const rEye = lm[33], lEye = lm[263];
              const roll = (rEye && lEye)
                ? Math.atan2(rEye.y - lEye.y, lEye.x - rEye.x) * (180 / Math.PI)
                : 0;

              const gaze = computeGaze(lm);

              faceFeaturesList.push({
                bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
                earLeft, earRight,
                marInner,
                cheekRise,
                mouthCornerAngle,
                yaw, pitch, roll,
                isGenuineEyeClose: eyeClass.isGenuineEyeClose,
                isLaughingSquint: eyeClass.isLaughingSquint,
                isFacingCamera: Math.abs(yaw) < 30 && Math.abs(pitch) < 25,
                faceConfidence: Math.max(0.3, faceScore.facing),
                embedding: computeFaceEmbedding(lm),
                irisOffset: gaze.irisOffset,
                isLookingAtCamera: gaze.isLookingAtCamera,
                gazeConfidence: gaze.gazeConfidence,
              });
            }
          }

          if (faceFeaturesList.length > 0) entry.faces = faceFeaturesList;

          const finalScore = calcPortraitScore(worstBlendshapes, headYaw, headPitch, sharpFace, weights);
          entry.score = finalScore;
          entry.faceSharpness   = sharpFace;
          entry.globalSharpness = sharpCenter;

          // F4: pass face-feature extras for refined deductions
          const primaryFace = faceFeaturesList[0];
          entry.deductions = calcPortraitDeductions(finalScore, 0.8, {
            isLaughingSquint:  primaryFace?.isLaughingSquint,
            isGenuineEyeClose: primaryFace?.isGenuineEyeClose,
            faceSharpness:     sharpFace,
            globalSharpness:   sharpCenter,
          });
          groupScores.push({ groupId: entry.groupId, photoId: id, score: finalScore.total });
        }
      } catch {
        entry.faceDetected = false;
        entry.score = buildFallbackPortraitScore(sharpCenter);
        entry.deductions = sharpCenter < 0.3 ? ["BLUR", "LOW_CONFIDENCE"] : ["LOW_CONFIDENCE"];
        groupScores.push({ groupId: entry.groupId, photoId: id, score: entry.score.total });
      }
    }
  }

  // ── Stage 3.5: 그룹 단위 얼굴 감지 전파 ────────────────────────────────────
  // 같은 그룹(연사/유사컷) 내에 얼굴이 한 장이라도 감지됐다면,
  // 나머지 "NO_SUBJECT" 사진들도 인물이 있는 사진으로 처리.
  // (아이가 고개를 숙인 컷도, 같은 연사에 정면 컷이 있다면 인물 사진으로 인정)
  for (let gi = 0; gi < rawGroups.length; gi++) {
    const groupPhotoIds = rawGroups[gi];

    // 이 그룹에 얼굴이 감지된 사진이 하나라도 있는지 확인
    const detectedFaces = groupPhotoIds
      .map((pid) => photosMap.get(pid))
      .filter((e) => e?.faceDetected && e.score);

    if (detectedFaces.length === 0) continue; // 그룹 전체 미감지 → 건드리지 않음

    // 감지된 사진들의 평균 눈뜸·표정·정면도 점수 계산
    const avgEyeOpen = detectedFaces.reduce((s, e) => s + (("eyeOpen" in e!.score!) ? e!.score!.eyeOpen : 0.5), 0) / detectedFaces.length;
    const avgExpression = detectedFaces.reduce((s, e) => s + (("expression" in e!.score!) ? e!.score!.expression : 0.5), 0) / detectedFaces.length;
    const avgFacing = detectedFaces.reduce((s, e) => s + (("facing" in e!.score!) ? e!.score!.facing : 0.5), 0) / detectedFaces.length;

    for (const photoId of groupPhotoIds) {
      const entry = photosMap.get(photoId);
      if (!entry || entry.faceDetected) continue;
      if (!entry.deductions.includes("NO_SUBJECT")) continue;

      // 같은 연사 그룹에 인물이 확인됨 → NO_SUBJECT 제거하고 그룹 평균 점수 적용
      entry.faceDetected = true;
      entry.deductions = entry.deductions.filter((d) => d !== "NO_SUBJECT");

      // 선명도는 본인 것 유지, 얼굴 관련 점수는 그룹 평균 사용
      const sharpness = ("sharpness" in entry.score!) ? entry.score!.sharpness : 0.5;
      entry.score = {
        eyeOpen: avgEyeOpen,
        sharpness,
        expression: avgExpression,
        facing: avgFacing,
        total: Math.min(
          avgEyeOpen * weights.eyeOpen +
          sharpness * weights.sharpness +
          avgExpression * weights.expression +
          avgFacing * weights.facing,
          1
        ),
      };

      // groupScores에서도 해당 사진 점수 업데이트
      const gsIdx = groupScores.findIndex((g) => g.photoId === photoId);
      if (gsIdx !== -1) groupScores[gsIdx].score = entry.score.total;
    }
  }

  // ── Stage 3.7: 인물 클러스터링 ───────────────────────────────────────────────
  onProgress(total, total, "person_clustering");
  const personClusters = clusterPersons(photosMap);

  // personId를 각 PhotoEntry에 역주입
  for (const [personId, cluster] of personClusters) {
    for (const photoId of cluster.photoIds) {
      const e = photosMap.get(photoId);
      if (!e) continue;
      if (!e.presentPersonIds) e.presentPersonIds = [];
      if (!e.presentPersonIds.includes(personId)) e.presentPersonIds.push(personId);
      // 대표 사진에 primaryPersonId 설정
      if (!e.primaryPersonId && photoId === cluster.representativePhotoId) {
        e.primaryPersonId = personId;
      }
    }
  }

  // ── Stage 4: 씬 클러스터링 → 씬 다양성 선별 ──────────────────────────────
  onProgress(total, total, "selecting");

  // 4-a: 연사 그룹별 대표 hash 선정 (첫 번째 사진)
  const groupRepHashes: { groupId: string; hash: bigint }[] = rawGroups.map((photoIds, i) => {
    const gid = groupIds[i];
    const firstEntry = photosMap.get(photoIds[0]);
    return { groupId: gid, hash: firstEntry?.hash ?? 0n };
  });

  // 4-b: 씬 클러스터링 (Hamming ≤ 22 → 같은 의상/배경)
  const groupToScene = clusterScenes(groupRepHashes, 22);

  // 4-c: groupScores에 sceneId 부착
  const groupScoresWithScene = groupScores.map((g) => ({
    ...g,
    sceneId: groupToScene.get(g.groupId) ?? "scene_0",
  }));

  // 4-d: 씬 다양성 보장 선별
  const selectedPhotoIds = selectTopPhotosWithSceneDiversity(
    groupScoresWithScene,
    targetCount,
    maxPerGroup
  );

  // 4-e: 연사 그룹 객체 생성
  const groups: PhotoGroup[] = rawGroups.map((photoIds, i) => {
    const gid = groupIds[i];
    const gScores = groupScores
      .filter((g) => g.groupId === gid)
      .map((g) => g.score);

    return {
      id: gid,
      photoIds,
      selectedId: null,
      confidence: calcGroupConfidence(gScores) as ConfidenceGrade,
    };
  });

  // 4-f: isSelected 반영
  for (const [, entry] of photosMap) {
    entry.isSelected = selectedPhotoIds.has(entry.id);
  }

  for (const group of groups) {
    const sel = group.photoIds.find((pid) => selectedPhotoIds.has(pid));
    group.selectedId = sel ?? null;
  }

  return { photos: photosMap, groups, groupScoresWithScene, personClusters };
}
