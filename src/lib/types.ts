// ─── 기존 v0.2.x 타입 (변경 금지) ────────────────────────────────────────────

export type PhotoType = "portrait" | "pet" | "mixed";

export interface PhotoScore {
  eyeOpen: number;      // 0~1, MediaPipe blendshapes
  sharpness: number;    // 0~1, Laplacian variance
  expression: number;   // 0~1, smile score
  facing: number;       // 0~1, yaw/pitch normalization
  total: number;        // weighted sum
}

export interface PetScore {
  sharpness: number;    // 0~1
  eyeEstimate: number;  // 0~1, eye region brightness/sharpness
  position: number;     // 0~1, subject centering
  total: number;
}

export type DeductionCode =
  | "EYE_CLOSED"
  | "BLUR"
  | "SIDE_FACE"
  | "EYE_REGION_DARK"
  | "LOW_CONFIDENCE"
  | "NO_SUBJECT"
  /** 웃을 때 찡그린 눈 — 감점 없음, 정보 목적 */
  | "EYE_SQUINT_SMILE"
  /** 얼굴 선명 + 배경 흐림 (아웃포커싱) — 감점 없음 */
  | "BLUR_AESTHETIC_BOKEH"
  /** 저조도 노이즈 — 경미한 감점 */
  | "BLUR_NOISE";

export type ConfidenceGrade = "HIGH" | "MEDIUM" | "LOW";

export interface AnalysisWeights {
  eyeOpen: number;
  sharpness: number;
  expression: number;
  facing: number;
}

export interface PetWeights {
  sharpness: number;
  eyeEstimate: number;
  position: number;
}

export const DEFAULT_WEIGHTS: AnalysisWeights = {
  eyeOpen: 0.35,
  sharpness: 0.30,
  expression: 0.20,
  facing: 0.15,
};

export const DEFAULT_PET_WEIGHTS: PetWeights = {
  sharpness: 0.55,
  eyeEstimate: 0.15,
  position: 0.30,
};

export interface Filters {
  excludeEyeClosed: boolean;
  excludeBlur: boolean;
  frontOnly: boolean;
  excludeLowConf: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  excludeEyeClosed: false,
  excludeBlur: false,
  frontOnly: false,
  excludeLowConf: false,
};

export interface GroupScoreEntry {
  groupId: string;
  sceneId: string;
  photoId: string;
  score: number;
}

// ─── v3.0 신규 기본 타입 ──────────────────────────────────────────────────────

export interface BBox {
  x: number; y: number; w: number; h: number;  // 0~1 정규화
}

export interface Landmark {
  x: number; y: number; z?: number;
}

// TECH_SPEC §2.5
export type ExclusionReason =
  | { kind: "eye_closed";          severity: "high" | "low" }
  | { kind: "blurry";              severity: "high" | "low"; subkind: "motion" | "noise" | "out_of_focus" }
  | { kind: "duplicate";           groupId: string; reason: "burst" | "scene" }
  | { kind: "low_face_confidence" }
  | { kind: "off_center";          reason: "subject_too_small" | "subject_cut_off" }
  | { kind: "hero_absent";         mode: "AND" | "OR" }
  | { kind: "user_excluded" };

// TECH_SPEC §2.4 — 얼굴 분석 단위
export interface FaceFeature {
  bbox: BBox;
  landmarks?: Landmark[];

  // 핵심 측정값
  earLeft: number;          // Eye Aspect Ratio 좌
  earRight: number;         // Eye Aspect Ratio 우
  marInner: number;         // Mouth Aspect Ratio
  cheekRise: number;        // 뺨 융기 정도 (0~1)
  mouthCornerAngle: number; // 입꼬리 각도 (도)
  yaw: number;
  pitch: number;
  roll: number;

  // 파생 신호 (§3)
  isGenuineEyeClose: boolean;
  isLaughingSquint: boolean;
  isFacingCamera: boolean;
  faceConfidence: number;   // 0~1

  // v3.0 신규 — 인물 클러스터링 / 응시 (§3.7~3.8)
  embedding?: Float32Array;          // 128~512 dim, L2 정규화
  personId?: string;                 // PersonCluster.id
  irisOffset?: { x: number; y: number };
  isLookingAtCamera?: boolean;
  gazeConfidence?: number;
}

// TECH_SPEC §2.4-bis — 인물 클러스터
export interface PersonCluster {
  id: string;                          // "p1", "p2", ...
  displayName?: string;                // 사용자 입력 이름
  centroid: Float32Array;              // 클러스터 중심 임베딩
  faceCount: number;
  photoIds: string[];
  representativePhotoId: string;
  representativeFaceBbox: BBox;
  isHero: boolean;
  heroSelectionOrder?: number;
  estimatedAge?: "infant" | "child" | "adult" | "unknown";
}

export type HeroMode = "OR" | "AND";

export interface HeroConfig {
  selectedPersonIds: string[];
  mode: HeroMode;
  guaranteeNonHeroCount: number;       // 주인공 미등장 컷 보장 장수 (폴더당, 기본 5)
}

// TECH_SPEC §2.6 — 분석 단계
export type AnalysisStage =
  | "idle"
  | "thumbnailing"
  | "phashing"
  | "burst_grouping"
  | "scene_clustering"
  | "face_detecting"
  | "person_clustering"
  | "awaiting_hero_pick"
  | "scoring"
  | "selecting"
  | "done";

export interface StorySnapshot {
  stage: AnalysisStage;
  message: string;
  count: number;
  timestamp: number;
}

// TECH_SPEC §2.8 — 결제
export interface PaymentSession {
  id: string;
  email: string;
  productCode: "single" | "package";
  amount: number;                      // KRW (4900 | 15000)
  status: "pending" | "paid" | "failed" | "refunded";
  pgProvider: "kakaopay" | "tosspay" | "card";
  pgGateway: "portone";
  pgMode: "sandbox" | "live";
  pgTransactionId?: string;
  createdAt: number;
  paidAt?: number;
  expiresAt: number;                   // single: +24h / package: +90d
  downloadQuota: number;               // single: 1 / package: Infinity
  downloadCount: number;
  reextractionCount: number;
  appliedToSessionIds: string[];
  adFreeEnabled: boolean;
}

export interface ClientPaymentState {
  isPaid: boolean;
  paymentSessionId?: string;
  receiptEmail?: string;
  receiptUrl?: string;
}

export interface AdImpression {
  slotId: string;
  shownAt: number;
  screen: string;
}

// ─── Flow B 타입 (기존 계승 + v3 확장) ────────────────────────────────────────

export type EventTag =
  | "maternity"
  | "newborn"
  | "50days"
  | "100days"
  | "first_birthday"
  | "wedding"
  | "family"
  | "pet_profile"
  | "travel"
  | "other";

export interface PhotoEntry {
  // ── 기존 v0.2.x 필드 (변경 금지) ──
  id: string;
  file: File;
  hash: bigint;
  groupId: string;
  score: PhotoScore | PetScore | null;
  deductions: DeductionCode[];
  confidence: ConfidenceGrade;
  thumbnail: string;           // blob URL, 400px max
  isSelected: boolean;
  faceDetected: boolean;

  // ── v3.0 신규 — 얼굴 / 인물 분석 ──
  faces?: FaceFeature[];
  presentPersonIds?: string[];
  primaryPersonId?: string;
  primaryPersonBbox?: BBox | null;       // v3.0 — 가장 큰 인물의 bbox
  isLookingAtCamera?: boolean;           // v3.0 — 주인공 응시 여부
  heroMatchKind?: "all" | "any" | "none" | "non_hero_guaranteed";
  heroBonus?: number;
  exclusionReasons?: ExclusionReason[];
  userOverride?: "none" | "force_in" | "force_out";
  finalScore?: number;

  // ── v3.0 신규 — 화질 분석 ──
  phash?: string;
  sceneId?: string;
  globalSharpness?: number;
  faceSharpness?: number;
  noiseScore?: number;
  outfitSig?: string;
  shotAt?: number;
  cameraId?: string;

  // ── v3.0 신규 — 파일명 가림 (F19, §7.6) ──
  // UI에는 displayName만 표시. file.name(원본)은 ZIP 결제 시에만 사용.
  displayName?: string;        // 예: "DDP-만삭-001"

  // ── v3.0 신규 — Google Drive 출처 (§16.3, source가 google_drive일 때만) ──
  driveFileId?: string;
  driveThumbnailUrl?: string;
  driveOriginalUrl?: string;
  isOriginalDownloaded?: boolean;
  originalBlob?: Blob;
}

export interface PhotoGroup {
  id: string;
  photoIds: string[];
  selectedId: string | null;
  confidence: ConfidenceGrade;
}

export interface FolderSession {
  // ── 기존 v0.2.x 필드 (변경 금지) ──
  id: string;
  folderName: string;
  eventTag: EventTag;
  files: File[];
  status: "pending" | "analyzing" | "done" | "error";
  progress: number;            // 0~1
  stage: string;
  photos: Map<string, PhotoEntry>;
  groups: PhotoGroup[];
  targetCount: number;
  errorMessage?: string;

  // ── v3.0 신규 ──
  source: "local" | "google_drive";   // Drive 연동 여부 (§16.3)
  driveFolderId?: string;
  driveFolderPath?: string;            // 사용자에게 표시할 경로
  // §16 단계화 다운로드: listDriveFolder 응답 보존 → 분석 후 PhotoEntry에 주입
  driveItems?: Array<{
    id: string;
    name: string;
    thumbnailLink?: string;
    hasThumbnail?: boolean;
    size?: string;
  }>;
  recommendedCount?: number;
  outfitChangePoints?: string[];
  storyTelling?: StorySnapshot[];
}

// ─── Drive 다운로드 큐 ────────────────────────────────────────────────────────

export interface DriveQueueItem {
  id: string;
  folderName: string;
  status: "downloading" | "done" | "error";
  current: number;
  total: number;
  errorMsg?: string;
}

// ─── AppState ──────────────────────────────────────────────────────────────────

// TECH_SPEC §2.9 — v3.0에 신규 step 추가
export type AppStep =
  | "landing"
  | "typeSelect"
  | "upload"
  | "analysis"
  | "gallery"
  | "album"
  | "studioSelect"
  | "folderUpload"
  | "folderGallery"
  | "personSelect"       // v3.0 신규 — 인물 선택 화면
  | "paywall"            // v3.0 신규
  | "paymentResult";     // v3.0 신규

export interface AppState {
  // ── 기존 v0.2.x 필드 (변경 금지) ──
  step: AppStep;
  flow: "A" | "B" | "C" | null;
  photoType: PhotoType | null;
  photos: Map<string, PhotoEntry>;
  groups: PhotoGroup[];
  targetCount: number;
  maxPerGroup: number;
  weights: AnalysisWeights;
  petWeights: PetWeights;
  filters: Filters;
  reextractCount: number;
  analysisProgress: number;
  analysisStage: string;
  locale: "ko" | "en";
  groupScoresWithScene: GroupScoreEntry[];
  feedbackMode: boolean;
  feedbackSamples: string[];
  feedbackEntries: Map<string, boolean>;
  preferenceWeights: AnalysisWeights | null;
  preferenceSelected: Set<string> | null;
  bannerDismissed: boolean;
  folderSessions: FolderSession[];
  driveQueue: DriveQueueItem[];
  filesDetached: boolean;

  // ── v3.0 신규 — 결제 / 광고 ──
  payment: ClientPaymentState;
  watermarkEnabled: boolean;   // 무료=true / 유료=false
  freeZipLimit: number;        // 기본 50장
  adImpressions: AdImpression[];

  // ── v3.0 신규 — 인물 클러스터링 ──
  personClusters: Map<string, PersonCluster>;
  heroConfig: HeroConfig;

  // §16 — Drive 토큰 전역 캐시 (화면 이동 후에도 재동의 없이 재사용)
  driveToken: string | null;
}
