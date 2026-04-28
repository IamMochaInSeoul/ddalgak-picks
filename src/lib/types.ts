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
  | "NO_SUBJECT";

export type ConfidenceGrade = "HIGH" | "MEDIUM" | "LOW";

export interface PhotoEntry {
  id: string;
  file: File;
  hash: bigint;
  groupId: string;
  score: PhotoScore | PetScore | null;
  deductions: DeductionCode[];
  confidence: ConfidenceGrade;
  thumbnail: string;    // blob URL, 400px max
  isSelected: boolean;
  faceDetected: boolean;
}

export interface PhotoGroup {
  id: string;
  photoIds: string[];
  selectedId: string | null;
  confidence: ConfidenceGrade;
}

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
  sharpness: 0.55,    // 눈 감음 감지 부정확으로 선명도 중심으로 상향
  eyeEstimate: 0.15,  // 밝기 추정 기반이라 신뢰도 낮음 → 하향
  position: 0.30,     // 피사체 중앙 배치 중요도 상향
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

/** 씬 다양성 선별에 사용되는 그룹별 점수 항목 */
export interface GroupScoreEntry {
  groupId: string;
  sceneId: string;
  photoId: string;
  score: number;
}

// ─── Flow B 타입 ───────────────────────────────────────────────────────────
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

export interface FolderSession {
  id: string;
  folderName: string;
  eventTag: EventTag;
  files: File[];
  status: "pending" | "analyzing" | "done" | "error";
  progress: number;     // 0~1
  stage: string;        // 분석 단계 텍스트
  photos: Map<string, PhotoEntry>;
  groups: PhotoGroup[];
  targetCount: number;
  errorMessage?: string;
}

// ─── AppState ──────────────────────────────────────────────────────────────
export interface AppState {
  step: "landing" | "typeSelect" | "upload" | "analysis" | "gallery" | "album"
      | "studioSelect" | "folderUpload" | "folderGallery";
  // flow:
  //   A = 사진만 셀렉 (개인용)
  //   B = 스튜디오 폴더 셀렉 + 앨범 배치 (셀렉용 폴더 있음)
  //   C = 스튜디오 폴더 셀렉 + ZIP만 (폴더 없음)
  flow: "A" | "B" | "C" | null;
  photoType: PhotoType | null;
  photos: Map<string, PhotoEntry>;
  groups: PhotoGroup[];
  targetCount: number;
  maxPerGroup: number;          // 유사 구도/포즈 최대 허용 장수 (default 2)
  weights: AnalysisWeights;
  petWeights: PetWeights;
  filters: Filters;
  reextractCount: number;
  analysisProgress: number;
  analysisStage: string;
  locale: "ko" | "en";

  // 취향 재추출 시스템
  groupScoresWithScene: GroupScoreEntry[];  // 분석 결과 보존 (재추출에 재활용)
  feedbackMode: boolean;                    // 피드백 수집 화면 표시 여부
  feedbackSamples: string[];               // 평가 대상 photoId 목록 (씬별 샘플링)
  feedbackEntries: Map<string, boolean>;   // photoId → true(좋아요) / false(싫어요)
  preferenceWeights: AnalysisWeights | null;  // 피드백 반영 후 조정된 가중치
  preferenceSelected: Set<string> | null;     // 취향 기반 재추출 결과 photoId 집합
  bannerDismissed: boolean;               // 플로팅 배너 닫기 여부

  // Flow B — 폴더 묶음 셀렉
  folderSessions: FolderSession[];

  // 세션 지속성
  filesDetached: boolean;                 // 새로고침 후 File 객체가 없는 상태
}
