# 딸깍픽스 v3 — TECH_SPEC (Technical Specification)

> **버전:** v3.0-draft
> **작성일:** 2026-04-27
> **이 문서의 위치:** `PRD.md`가 "무엇을 왜"를 정의한다면, 본 문서는 **"어떻게 동작해야 하는가"**를 정의한다. 라이브러리/프레임워크 선택은 Claude Code에 위임하되, **본 문서에 명세된 동작·데이터 형태·임계값은 강제 사양**이다.
> **충돌 시 우선순위:** TECH_SPEC > PRD (구현 정밀도 우선)

---

## 목차

1. 시스템 아키텍처 개요
2. 핵심 데이터 모델
3. **B급 사진 정의 명세 (Filter Specification)** ← 본 문서의 심장
4. 분석 파이프라인
5. 폴더 단위 처리와 이벤트 태그
6. 사용자 가중치 / 취향 보정 모델
7. ZIP 출력 명세 (워터마크 합성 포함)
8. 결제 시스템 인터페이스
9. 광고 배너 노출 규칙
10. 워터마크 / 무료 장수 제한 명세
11. 보안 / 프라이버시
12. 에러 처리 / 엣지 케이스
13. 성능 목표
14. QA 체크리스트 (정확도 게이트 포함)
15. 배포 / 운영
16. Google Drive 폴더 연동 (PRD F23 구현)
17. UX 강제 사양 (PRD §6.B 구현 가이드)
18. 부록: 알고리즘 의사코드

---

## 1. 시스템 아키텍처 개요

### 1.1 컴포넌트 구분

```
┌─────────────────────────────────────────────────────────────┐
│                     클라이언트 (브라우저)                    │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   UI Layer  │  │  Analyzer    │  │  Local Storage    │  │
│  │   (View)    │  │  (Pipeline)  │  │  (IndexedDB)      │  │
│  └─────────────┘  └──────────────┘  └──────────────────┘  │
│         │                │                                  │
│         └────────┬───────┘                                  │
│                  │                                          │
│         ┌────────▼─────────┐                                │
│         │ State Management │                                │
│         └──────────────────┘                                │
│                                                             │
│   ⚠️ 원본 사진은 이 경계 밖으로 절대 나가지 않음            │
│      (결제·보정용 송신은 §11에 명시된 경우에만)             │
└─────────────────────────────────────────────────────────────┘
                       │
            ┌──────────▼──────────┐
            │   서버 (Backend)     │
            │  - 결제 PG 게이트    │
            │  - 광고 슬롯 서빙    │
            │  - 텔레메트리 수집   │
            │  - (P2) 보정 API    │
            └──────────────────────┘
```

### 1.2 핵심 원칙

- **셀렉은 100% 클라이언트 사이드** — 원본 픽셀 데이터는 서버로 가지 않음
- **서버는 결제·광고·텔레메트리·(P2) 보정만** 담당
- **세션 상태는 IndexedDB에 24시간 보존** — 새로고침/브라우저 종료 후 복구
- **분석은 폴더별 순차 처리** — MediaPipe 모델 메모리 충돌 방지
- **타입 강타입 강제** — `any` 사용 시 PR 자동 거부 (lint 룰)

### 1.3 기술 스택 권장사항 (Claude Code가 결정 가능)

| 영역 | v0.2.x 기존 | v3.0 권장 (변경 자유) |
|------|-------------|----------------------|
| 빌드 | Vite 5 | 유지 권장 |
| UI | React 18 + TypeScript | 유지 권장 |
| 상태 | Zustand 5 | 유지 권장 (개별 셀렉터 규칙 §13.2 준수) |
| 얼굴 감지 | MediaPipe tasks-vision@0.10.34 | 유지 권장 |
| 얼굴 임베딩 (인물 클러스터링) | 없음 | **신규 — face-api.js / TensorFlow.js + MobileFaceNet 또는 동급 (브라우저 내 실행, 128~512 dim 임베딩)** |
| 인물 클러스터링 | 없음 | 신규 — 코사인 유사도 + 적응형 임계값 (구현은 §3.7) |
| ZIP | JSZip | 유지 권장 |
| 결제 PG | 없음 | 신규: 카카오페이 / 토스페이 / 포트원 등 (PRD §11.5) |
| 백엔드 | 없음 | **신규: Supabase Edge Functions (확정 — 2026-04-27)** |
| DB | 없음 | **신규: Supabase Postgres (확정)** — 결제 이력·쿠폰·텔레메트리 통합 |
| Auth | 없음 | 신규: Supabase Auth (v3.2 회원 시스템 F13에 사용. MVP는 비회원 결제만) |
| Storage | 없음 | 신규: Supabase Storage (워터마크 이미지·face embedding 모델 가중치 호스팅) |
| 광고 | 없음 | 신규: Google AdSense (1차) |
| 모니터링 | 없음 | 신규: Sentry (프론트) + 자체 텔레메트리 |

### 1.4 환경 변수 (예상)

```
# 클라이언트 (VITE_ 프리픽스)
VITE_GOOGLE_CLIENT_ID=...        # 기존
VITE_GOOGLE_API_KEY=...          # 기존
VITE_API_BASE_URL=...            # 신규 — 백엔드 API
VITE_ADSENSE_CLIENT_ID=...       # 신규
VITE_SENTRY_DSN=...              # 신규
VITE_FEATURE_PAYMENT=true        # 신규 — 결제 기능 토글
VITE_FEATURE_PERSON_CLUSTERING=true  # 신규 — 인물 클러스터링 토글 (모델 로드 실패 시 자동 false)
VITE_FACE_EMBEDDING_MODEL_URL=...    # 신규 — face-api.js / TF.js 모델 가중치 호스팅 경로

# 클라이언트 (Supabase 공개 키)
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=...

# 서버 (Supabase Edge Function 환경변수)
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...        # 서버 전용, 클라이언트 노출 금지
PG_PORTONE_API_KEY=...                # 포트원 V2 API 키
PG_PORTONE_API_SECRET=...
PG_PORTONE_CHANNEL_KEY=...
PG_PORTONE_MODE=sandbox               # sandbox | live (사업자 등록 후 live)
JWT_SECRET=...
ADMIN_PASSWORD_HASH=...               # 어드민 페이지 접근용 (F21)
```

---

## 2. 핵심 데이터 모델

> **원칙:** 기존 v0.2.x 타입을 최대한 계승하되, 본 절에서 정의한 신규 필드는 **추가만** 한다 (기존 필드 의미 변경 금지).

### 2.1 Flow 정의

```ts
// 기존 v0.2.x 그대로 계승
type Flow = "A" | "B" | "C" | null;
// A = 사진만 셀렉 (개인용)
// B = 스튜디오 폴더 셀렉 + 앨범 배치
// C = 스튜디오 폴더 셀렉 + ZIP만
```

### 2.2 EventTag

```ts
// 기존 v0.2.x 계승. 신규 태그 추가 금지 (UX 폭발 방지)
type EventTag =
  | "maternity"       // 만삭
  | "newborn"         // 베이비본 / 신생아
  | "50days"          // 50일
  | "100days"         // 100일 (백일)
  | "first_birthday"  // 돌
  | "wedding"         // 웨딩
  | "family"          // 가족
  | "pet_profile"     // 반려동물
  | "travel"          // 여행
  | "other";          // 기타
```

### 2.3 PhotoEntry (강화)

```ts
interface PhotoEntry {
  id: string;                        // 폴더 내 unique
  file: File;                        // 원본 File 핸들
  fileName: string;
  thumbDataUrl?: string;             // 400px 썸네일

  // pHash
  phash: string;                     // 64bit hash, hex
  groupId?: string;                  // 연사 그룹 ID (Hamming ≤ 10)
  sceneId?: string;                  // 씬 클러스터 ID (Hamming ≤ 22)

  // 얼굴 분석 (사람 모드)
  faces: FaceFeature[];              // 0~N개

  // 화질 분석
  globalSharpness: number;           // 전체 Laplacian variance (참고용)
  faceSharpness?: number;            // 얼굴 영역만 Laplacian (인물 모드)
  noiseScore?: number;               // 저조도 노이즈 추정 (0~1, 1=노이즈 심함)

  // 종합 점수
  scores: {
    eyeOpen: number;       // 0~1, 눈 뜸 정도 (1 = 완전히 뜸)
    smileBalance: number;  // 0~1, 웃음 자연스러움 (눈감음 보정 핵심)
    sharpness: number;     // 0~1, 정규화된 선명도
    expression: number;    // 0~1, 표정 점수
    facing: number;        // 0~1, 정면도
    composition: number;   // 0~1, 구도 점수
  };

  // 감점 사유 (UI 표시용)
  exclusionReasons: ExclusionReason[];

  // 최종 결정
  finalScore: number;                // 0~100
  isSelected: boolean;               // 최종 선별 여부
  userOverride: "none" | "force_in" | "force_out";  // 사용자 수동 토글

  // 메타
  shotAt?: number;                   // EXIF DateTimeOriginal (epoch ms)
  cameraId?: string;                 // EXIF Make+Model 해시
  outfitSig?: string;                // 의상/배경 변화 감지용 (§3.4)
}
```

### 2.4 FaceFeature (확장)

```ts
interface FaceFeature {
  bbox: { x: number; y: number; w: number; h: number };  // 0~1 정규화
  landmarks?: Landmark[];            // MediaPipe FaceLandmarker 출력

  // 핵심 측정
  earLeft: number;                   // Eye Aspect Ratio 좌
  earRight: number;                  // Eye Aspect Ratio 우
  marInner: number;                  // Mouth Aspect Ratio (입 안쪽)
  cheekRise: number;                 // 뺨 융기 정도 (0~1)
  mouthCornerAngle: number;          // 입꼬리 각도 (도)
  yaw: number;                       // 좌우 회전 (도)
  pitch: number;                     // 상하 회전 (도)
  roll: number;                      // 기울기 (도)

  // 파생 신호 (§3 핵심)
  isGenuineEyeClose: boolean;        // 진짜 눈감음 (§3.1)
  isLaughingSquint: boolean;         // 웃어서 눈 감김 (§3.1)
  isFacingCamera: boolean;           // 정면 (yaw·pitch 기반)
  faceConfidence: number;            // 0~1

  // v3.0 신규 — 인물 클러스터링 / 응시
  embedding?: Float32Array;          // 128~512 dim, L2 정규화. 인물 클러스터링용 (§3.7)
  personId?: string;                 // 클러스터링 결과 PersonCluster.id
  irisOffset?: { x: number; y: number };  // 눈동자 오프셋 (응시 추정용, §3.8)
  isLookingAtCamera?: boolean;       // 카메라 응시 여부 (§3.8)
  gazeConfidence?: number;           // 0~1 응시 추정 신뢰도
}
```

### 2.4-bis PersonCluster (v3.0 신규)

```ts
interface PersonCluster {
  id: string;                        // "p1", "p2", ... (세션 내 unique)
  displayName?: string;              // 사용자 입력 ("지유", "엄마") — IndexedDB에 영속 가능
  centroid: Float32Array;            // 클러스터 중심 임베딩 (지속 갱신)
  faceCount: number;                 // 누적 매칭된 얼굴 수
  photoIds: string[];                // 등장 사진 ID 목록 (중복 제거)
  representativePhotoId: string;     // 대표 카드용: 정면도 + 선명도 최고 사진
  representativeFaceBbox: BBox;      // 대표 얼굴 위치
  isHero: boolean;                   // 사용자가 주인공으로 선택했는지
  heroSelectionOrder?: number;       // 다중 선택 시 순서 (0이 메인)
  estimatedAge?: "infant" | "child" | "adult" | "unknown";  // 휴리스틱 (§3.7.6)
}

type HeroMode = "OR" | "AND";        // 다중 주인공 매칭 모드 (디폴트 OR)

interface HeroConfig {
  selectedPersonIds: string[];       // 사용자가 체크한 인물
  mode: HeroMode;
  guaranteeNonHeroCount: number;     // 주인공 미등장 컷 보장 장수 (폴더당, 디폴트 5)
}
```

### 2.4-tris PhotoEntry 확장 (v3.0 신규 필드)

```ts
// PhotoEntry에 다음 필드 추가
interface PhotoEntry {
  // ... §2.3 기존 필드 모두 유지

  // v3.0 신규 — 인물 관련
  presentPersonIds: string[];        // 이 사진에 등장하는 PersonCluster.id 목록
  primaryPersonId?: string;          // 주피사체 인물 ID (§3.1.3)
  heroMatchKind?: "all" | "any" | "none" | "non_hero_guaranteed";
                                     // 주인공 등장 패턴 (§3.9)
  heroBonus: number;                 // 인물 가산점 (composition score 가산분, 0~25)

  // v3.0 신규 — 파일명 가림 (§7.6)
  displayName: string;               // 가명, 예: "DDP-만삭-001". UI에는 이것만 표시
  // 주의: file.name (원본 파일명)은 ZIP 생성 시에만 사용, UI에 절대 노출 금지
}
```

### 2.5 ExclusionReason

```ts
type ExclusionReason =
  | { kind: "eye_closed"; severity: "high" | "low" }
  | { kind: "blurry";     severity: "high" | "low"; subkind: "motion" | "noise" | "out_of_focus" }
  | { kind: "duplicate";  groupId: string; reason: "burst" | "scene" }
  | { kind: "low_face_confidence" }
  | { kind: "off_center"; reason: "subject_too_small" | "subject_cut_off" }
  | { kind: "hero_absent"; mode: "AND" | "OR" }
  | { kind: "user_excluded" };
```

### 2.6 FolderSession (강화)

```ts
interface FolderSession {
  // 기존 v0.2.x 계승
  id: string;
  folderName: string;
  eventTag: EventTag;
  files: File[];
  status: "pending" | "analyzing" | "done" | "error";
  progress: number;                  // 0~1
  stage: AnalysisStage;
  photos: Map<string, PhotoEntry>;
  groups: PhotoGroup[];
  targetCount: number;
  errorMessage?: string;

  // v3.0 신규
  recommendedCount?: number;         // 이벤트 태그 기반 추천 장수 (§5.2)
  outfitChangePoints: string[];      // 의상 변화 감지 시점 (PhotoEntry.id)
  storyTelling: StorySnapshot[];     // 분석 단계별 스냅샷 (UX 표시)
}

type AnalysisStage =
  | "idle"
  | "thumbnailing"
  | "phashing"
  | "burst_grouping"
  | "scene_clustering"
  | "face_detecting"
  | "person_clustering"      // v3.0 신규 — 얼굴 임베딩 추출 + 클러스터링
  | "awaiting_hero_pick"     // v3.0 신규 — 사용자 인물 선택 대기 (UI 블로킹)
  | "scoring"
  | "selecting"
  | "done";

interface StorySnapshot {
  stage: AnalysisStage;
  message: string;                   // "눈 감은 컷 17장 제외 중..."
  count: number;                     // 누적 처리/제외 수치
  timestamp: number;
}
```

### 2.7 PhotoGroup

```ts
interface PhotoGroup {
  id: string;                        // groupId
  kind: "burst" | "scene";
  photoIds: string[];
  bestPhotoId?: string;              // 그룹 내 최고점 사진
  outfitSig?: string;                // 의상 시그니처 (씬 그룹용)
  timeRange?: { from: number; to: number };
}
```

### 2.8 결제 / 사용자 모델 (v3.0 신규)

```ts
interface PaymentSession {
  id: string;                        // UUID
  email: string;                     // 비회원 결제: 이메일만 받음
  productCode: "single" | "package";
  amount: number;                    // KRW (single: 4900, package: 15000)
  status: "pending" | "paid" | "failed" | "refunded";
  pgProvider: "kakaopay" | "tosspay" | "card";  // 사용자가 선택한 수단
  pgGateway: "portone";                          // 항상 포트원 통합 (확정)
  pgMode: "sandbox" | "live";                    // 환경변수 기반
  pgTransactionId?: string;
  createdAt: number;                 // epoch ms
  paidAt?: number;
  expiresAt: number;                 // single: paidAt+24h / package: paidAt+90d
  // 다운로드 횟수 모델 (재추출은 무한)
  downloadQuota: number;             // single: 1 / package: Infinity
  downloadCount: number;             // 사용 다운로드 횟수
  reextractionCount: number;         // 재추출 횟수 (무제한, 텔레메트리용)
  appliedToSessionIds: string[];     // 적용된 분석 세션 ID
  adFreeEnabled: boolean;            // package: true / single: false (작게 유지)
}

interface ClientPaymentState {
  isPaid: boolean;                   // 현재 분석 세션이 결제 완료 상태인지
  paymentSessionId?: string;
  receiptEmail?: string;
  receiptUrl?: string;
}
```

### 2.9 AppState (확장)

```ts
interface AppState {
  // 기존 v0.2.x 계승
  step: AppStep;
  flow: Flow;
  folderSessions: FolderSession[];
  // ... (기존 다른 필드들 유지)

  // v3.0 신규
  payment: ClientPaymentState;
  watermarkEnabled: boolean;         // 무료=true / 유료=false
  freeZipLimit: number;              // 무료 ZIP 장수 제한 (default 50)
  adImpressions: AdImpression[];     // 광고 노출 기록
  userLocale: "ko" | "en";

  // v3.0 신규 — 인물 클러스터링
  personClusters: Map<string, PersonCluster>;  // 세션 내 모든 인물
  heroConfig: HeroConfig;            // 사용자 주인공 선택 결과
}

type AppStep =
  | "landing"
  | "typeSelect"
  | "upload"
  | "analysis"
  | "gallery"
  | "studioSelect"
  | "folderUpload"
  | "folderGallery"
  | "album"
  | "personSelect"        // v3.0 신규 — 인물 선택 화면
  | "paywall"             // v3.0 신규
  | "paymentResult";      // v3.0 신규
```

---

## 3. B급 사진 정의 명세 (Filter Specification)

> **이 절은 본 문서에서 가장 중요한 사양이다. 모든 알고리즘 결정은 이 절의 정의를 따라야 한다.**
> **사용자가 가장 자주 불만을 제기할 영역이므로, 보수적으로 판단(의심스러우면 살림)하는 것이 원칙이다.**

### 3.0 판정 철학

| 판정 | 정의 | 처리 |
|------|------|------|
| **명백한 B급 (HARD_OUT)** | 사용자가 100% "이건 빼야지"라고 결정할 사진 | 자동 제외, 갤러리 "제외됨" 탭에 사유와 함께 표시 |
| **의심스러운 사진 (SOFT_OUT)** | 사용자가 50:50으로 망설일 사진 | 점수 감점하되 자동 제외하지 않음. 다른 후보 대비 점수가 낮으면 자연 탈락 |
| **유사컷 그룹 비탑(NON_BEST)** | 그룹 내에서 베스트가 아닌 사진 | 자동 제외하되 사유는 "유사컷"으로 명시, 그룹 비교 모달에서 사용자가 다른 컷 선택 가능 |
| **A급 / S급** | 선별 후보 | 점수순 + 씬별 비례로 최종 선별 |

**오탐 비대칭(asymmetric error cost):** 좋은 컷을 잘못 빼는 비용 >> 나쁜 컷을 잘못 살리는 비용. 그룹 내 베스트는 항상 살린다.

### 3.1 눈감음 판정 — 가짜 눈감음(웃음 squint) 제외

> **PRD에서 명시한 핵심 요구사항:** "웃느라 눈이 감긴 것처럼 보인 사진은 사용자가 원할 수 있어. 실제로 눈을 감은 게 아니니까."

#### 3.1.1 측정 지표

각 얼굴에 대해 다음 4개 신호를 모두 측정한다:

1. **EAR (Eye Aspect Ratio)** — 눈 세로/가로 비율. MediaPipe FaceLandmarker 좌표 기반.
   - 좌우 평균: `EAR = (EAR_left + EAR_right) / 2`
   - 정상 뜬 눈: 0.25~0.35
   - 닫힘: < 0.15

2. **MAR (Mouth Aspect Ratio)** — 입 세로/가로 비율.
   - 다물고 있음: < 0.25
   - 미소: 0.25~0.45
   - 활짝 웃음: > 0.45

3. **MouthCornerAngle** — 입꼬리 각도 (입 양 끝점이 입 중앙선 대비 위로 올라간 정도, 도 단위).
   - 무표정: 0° 근방
   - 미소: +5°~+15°
   - 활짝 웃음: > +15°

4. **CheekRise** — 광대 융기 정도 (FaceLandmarker의 BlendShape `cheekSquintLeft`/`cheekSquintRight` 평균).
   - 0~1 정규화

#### 3.1.2 판정 알고리즘

```
입력: EAR, MAR, MouthCornerAngle, CheekRise

1. EAR ≥ 0.20 → 눈 뜸 (PASS)
   isGenuineEyeClose = false
   isLaughingSquint = false

2. EAR < 0.15 → 눈 명백히 감음 (BLOCK 후보)
   - MAR ≥ 0.40 AND MouthCornerAngle ≥ +12° AND CheekRise ≥ 0.4
     → "웃어서 눈 감김" (LAUGHING SQUINT)
       isGenuineEyeClose = false
       isLaughingSquint = true
       감점 없음 (경우에 따라 +가산점, §6.2 참조)
   - 위 조건 미충족
     → "진짜 눈감음" (HARD_OUT)
       isGenuineEyeClose = true
       isLaughingSquint = false
       eyeOpen score = 0.0
       ExclusionReason: { kind: "eye_closed", severity: "high" }

3. 0.15 ≤ EAR < 0.20 → 애매 구간
   - MAR ≥ 0.35 AND MouthCornerAngle ≥ +8° → 웃음 squint, eyeOpen = 0.7
   - 그 외: eyeOpen = 0.4 (감점하되 BLOCK 안 함)
   - ExclusionReason: { kind: "eye_closed", severity: "low" }
```

#### 3.1.3 다인원 사진 처리

- 사진 내 얼굴이 여러 개일 때, **주피사체 1명만** 위 판정 적용
- **주피사체 결정:**
  1. 얼굴 영역 면적 최대인 얼굴
  2. 동률이면 사진 중심에 가장 가까운 얼굴
- 비주피사체 얼굴의 눈감음은 무시 (배경 인물의 눈감음으로 컷 빠지면 안 됨)

#### 3.1.4 추가 안전망

- **단일 프레임만으로 판정 불확실** → 같은 burst 그룹 내 다른 컷의 EAR과 비교. **이 사람이 평소 EAR이 낮은 사람**(눈이 작거나 늘 살짝 감는 스타일)이면 임계 자동 완화.
- 구현: burst 그룹 내 EAR 분포의 25th percentile을 그 사람의 "기본 EAR"로 가정, 임계는 `max(0.15, basePerson_EAR × 0.7)`

### 3.2 흔들림 판정 — 의도적 아웃포커싱 제외

> **PRD 요구사항:** "인물중심으로 찍느라 배경이 날아간 포커스 아웃과 같은 것도 흔들린 사진이 아니니까 B급 사진이라 할 수 없어."

#### 3.2.1 측정 지표

전통적인 Laplacian variance는 **사진 전체에 대해** 계산하면 배경 아웃포커스를 흔들림으로 오판한다. v3.0에서는 **얼굴 영역 우선** 측정으로 변경한다.

```
Laplacian Variance:
  globalSharpness = laplacian_var(전체 그레이스케일)
  faceSharpness   = laplacian_var(주피사체 얼굴 bbox 영역)
                  + 0.4 × laplacian_var(주피사체 어깨~상반신 확장 영역)
```

bbox 확장: 얼굴 bbox의 가로 +50%, 세로 +80% (어깨까지 포함)

#### 3.2.2 판정 알고리즘

```
입력: globalSharpness, faceSharpness, faces.length

1. faces.length == 0 (얼굴 미감지)
   → globalSharpness < 80 → SOFT_OUT (low blur)
   → globalSharpness < 30 → HARD_OUT (high blur)

2. faces.length ≥ 1 (얼굴 있음)
   → faceSharpness ≥ 100 → PASS (얼굴 선명, 배경 아웃포커싱 가능성)
   → 60 ≤ faceSharpness < 100 → SOFT_OUT (low blur, 감점)
   → faceSharpness < 60 AND globalSharpness < 50
       → HARD_OUT (전체 흔들림)
       → ExclusionReason: { kind: "blurry", severity: "high", subkind: "motion" }
   → faceSharpness < 60 AND globalSharpness ≥ 80
       → "얼굴은 흔들렸지만 배경 선명" — 매우 드문 케이스, SOFT_OUT
       → ExclusionReason: { kind: "blurry", severity: "low", subkind: "motion" }
```

#### 3.2.3 노이즈 vs 흔들림 분리

저조도 노이즈는 Laplacian variance를 과대평가시킬 수 있다 (노이즈가 고주파 성분으로 잡힘). 분리 측정:

```
noiseScore = high_freq_energy / total_energy
  - DCT 또는 wavelet 기반, 0~1 정규화
  - noiseScore > 0.7 → 노이즈 의심
  - 이 경우 faceSharpness 보정: faceSharpness *= (1 - noiseScore × 0.5)
```

노이즈가 매우 심하면 (`noiseScore > 0.85`) 별도 분류:
- `ExclusionReason: { kind: "blurry", severity: "high", subkind: "noise" }`

#### 3.2.4 의도적 아웃포커싱 보존 (핵심)

다음 패턴은 **자동 PASS** (감점 0):
```
faceSharpness ≥ 120 AND globalSharpness < (faceSharpness × 0.5)
→ "인물 중심 아웃포커싱" 패턴
→ 추가 가산점 +5 (composition score)
```

이는 인물 중심 촬영의 의도된 보케(bokeh) 효과를 보호한다.

### 3.3 유사컷 그룹핑 — 결정 피로 제거

#### 3.3.1 2단계 그룹핑 (기존 v0.2.x 계승 + 강화)

```
1단계: Burst Grouping
  - pHash Hamming distance ≤ 10 AND
  - EXIF shotAt 차이 ≤ 5초 (EXIF 없으면 distance만)
  - 같은 cameraId
  → 같은 groupId

2단계: Scene Clustering
  - pHash Hamming distance ≤ 22 AND
  - 시간 차이 ≤ 5분 AND
  - 같은 outfitSig (§3.4)
  → 같은 sceneId
```

#### 3.3.2 그룹 내 베스트 선정

```
그룹 내 모든 사진 점수 계산 후, 최고점 1장 = bestPhotoId
- maxPerGroup 설정 (사용자 입력, 기본 2):
    동률에 가까운 상위 N장까지는 bestPhotoIds[]로 살림
- 베스트 외에는 ExclusionReason: { kind: "duplicate", groupId, reason: "burst" }
```

#### 3.3.3 그룹 비교 모달 (UX)

- 갤러리에서 베스트 사진에 "🔁 유사 5장 중 1장" 배지 표시
- 클릭 시 그룹 N장을 격자 모달로 띄우기
- 사용자가 다른 컷 선택 시 `userOverride = "force_in"` 적용, 기존 베스트는 `force_out`

### 3.4 의상·배경 변화 감지 (Outfit Signature)

> **목적:** 같은 의상/배경의 사진들을 한 씬으로 묶어 그룹핑 정확도 향상. 옷이 바뀌면 새 씬 시작.

#### 3.4.1 시그니처 계산

```
outfitSig = hash(
  주피사체 어깨~상반신 영역의 색상 히스토그램 +
  배경(주피사체 외 영역) 색상 히스토그램 다운샘플
)
```

구체:
- 어깨~상반신 영역: 얼굴 bbox 아래로 1.5×height, 좌우 1.5×width
- 색상 히스토그램: HSV 64 bin (H=8, S=8, V=1)
- 두 히스토그램 concat 후 SimHash로 64bit 시그니처화
- Hamming distance ≤ 8 → 같은 의상/배경

#### 3.4.2 변화 시점 감지

폴더 내 사진을 shotAt 순으로 정렬한 뒤, 인접 사진의 outfitSig Hamming > 12인 지점이 **의상 변화 시점**:

```
folderSession.outfitChangePoints = [photoId_a, photoId_b, ...]
```

이 경계는 씬 클러스터링의 강제 분리 지점으로 사용된다.

### 3.5 종합 점수 계산

각 PhotoEntry에 대해:

```ts
function calcFinalScore(p: PhotoEntry, mode: "person" | "pet" | "mixed"): number {
  if (mode === "person") {
    return (
      p.scores.eyeOpen     * 0.30 +
      p.scores.smileBalance* 0.10 +
      p.scores.sharpness   * 0.25 +
      p.scores.expression  * 0.15 +
      p.scores.facing      * 0.10 +
      p.scores.composition * 0.10
    ) * 100;
  }
  if (mode === "pet") {
    return (
      p.scores.sharpness   * 0.50 +
      p.scores.composition * 0.30 +
      p.scores.facing      * 0.20
    ) * 100;
  }
  // mixed: person 기준 + 펫 점수 반영
  // ...
}
```

**가중치 변경 자유도:** 위 가중치는 v0.2.x 기본값을 일부 조정한 것. **사용자 취향 학습(§6)**이 적용되면 가중치는 동적으로 변동.

### 3.6 최종 선별 알고리즘

```
함수: selectBest(folderSession, targetCount, maxPerGroup)

1. 모든 photo의 finalScore 계산
2. 그룹별 베스트 추출 (그룹당 최대 maxPerGroup 장)
3. HARD_OUT 사진 전부 제외
4. 남은 후보를 sceneId별로 분류
5. 각 sceneId에 비례 할당:
     allocation[scene] = round(targetCount × scene.candidateCount / total)
6. 씬별로 finalScore 내림차순 상위 allocation[scene] 장 선별
7. userOverride 반영:
     force_in → 무조건 포함
     force_out → 무조건 제외
8. 부족분 발생 시 다음 사진 채움 (점수 순)
9. 초과분 발생 시 가장 낮은 점수부터 제외
```

### 3.7 인물 자동 클러스터링 (Face Embedding 기반)

> **목표:** 업로드된 모든 사진에서 감지된 얼굴을 동일 인물끼리 자동으로 묶는다. 동일인 매칭 정확도 90% 이상(성장앨범 도메인 기준).

#### 3.7.1 임베딩 추출

- 모델: face-api.js의 `FaceRecognitionNet` (128 dim) 또는 TF.js MobileFaceNet (192~512 dim) 권장
- 입력: 얼굴 bbox crop을 모델 요구 입력 크기(보통 112×112 또는 160×160)로 리사이즈
- 출력: L2 정규화된 부동소수 벡터
- **얼굴이 너무 작거나(bbox 짧은 변 < 60px) 신뢰도 낮으면 임베딩 생략** (클러스터링 노이즈 방지)
- 회전된 얼굴(roll > 25°)은 사전 정렬(eye landmark 기준 회전 보정) 후 임베딩

#### 3.7.2 클러스터링 알고리즘

온라인 증분식 클러스터링 (사진 처리 순서대로 진행):

```
입력: 얼굴 임베딩 e (L2 정규화)
초기 임계값: τ = 0.42  (코사인 유사도 기준, 1.0 = 완전 일치)

For each face f with embedding e:
  if 클러스터 전무: 새 클러스터 P 생성 (centroid = e)
  else:
    각 클러스터 P_i에 대해 sim_i = cosine(e, P_i.centroid)
    best = argmax_i(sim_i)
    if sim_best >= τ:
      클러스터 best에 f 할당
      centroid 갱신: P_best.centroid = normalize(α × P_best.centroid + (1-α) × e)
      α = 0.9 (지속성), 처음 5개 얼굴까진 α = 0.7
    else:
      새 클러스터 P 생성
```

#### 3.7.3 적응형 임계값

성장앨범의 핵심 페인: **신생아 → 100일 → 돌까지 외형이 급격히 변함.** 단일 임계로는 동일인을 분리하거나, 다른 사람을 묶음.

```
EventTag별 임계값 조정:
  - newborn / 50days / 100days: τ = 0.36 (관대 — 외형 급변기)
  - first_birthday / family / wedding: τ = 0.42 (기본)
  - pet_profile: 인물 클러스터링 비활성 (얼굴 모델이 사람 전용)
```

폴더 단위로 임계값 결정. **폴더 간 클러스터 병합은 후처리 단계**에서 별도 수행 (§3.7.4).

#### 3.7.4 폴더 간 클러스터 병합 (성장앨범 핵심)

각 폴더(만삭/신생아/100일/돌)에서 독립적으로 클러스터링한 뒤, 폴더 간 같은 인물을 통합:

```
입력: 폴더별 클러스터 집합 {P_a1, P_a2, ...}, {P_b1, P_b2, ...}, ...
1. 모든 클러스터의 centroid 추출
2. 폴더 간 centroid 쌍의 코사인 유사도 행렬 생성
3. 헝가리안 알고리즘으로 최적 매칭
   매칭 임계: sim >= 0.30 (관대 — 시기별 외형 변화 허용)
4. 매칭된 클러스터 통합 (centroid는 가중 평균)
5. 통합 후 클러스터 ID 재할당
```

이 통합은 **사용자 인물 선택 화면 표시 직전**에 수행한다.

#### 3.7.5 사용자 수동 보정

- 인물 선택 화면에서 사용자가 "이 두 인물 합치기" 또는 "이 인물 분리" 버튼 제공
- 수동 보정 결과는 IndexedDB에 저장, 다음 분석 세션에서 재현(같은 임베딩 → 같은 인물)

#### 3.7.6 연령 추정 (휴리스틱, 옵션)

대표 얼굴의 bbox 비율과 얼굴 비율(이마/코/턱 비율)로 가벼운 휴리스틱:
```
- 얼굴/사진 비율 + 동그란 얼굴 + 작은 코 → "infant"
- 작은 얼굴 + 어른 비율 → "adult"
```

UI에서 "아기로 추정" 등 라벨 보조용. **정확도 보장 X, 사용자가 무시/수정 가능.**

### 3.8 카메라 응시 추정

> **목표:** 주인공이 카메라를 정면으로 바라보는 컷을 가산점. PRD F18에서 명시한 "카메라 응시 여부".

#### 3.8.1 신호

1. **얼굴 yaw / pitch** — MediaPipe로 이미 측정. |yaw| < 15° AND |pitch| < 12° → 정면
2. **눈동자(iris) 오프셋** — MediaPipe FaceLandmarker의 iris landmark(left iris center, right iris center)와 눈 외곽 4점의 상대 위치로 눈동자가 눈 중앙에 있는지 판정

#### 3.8.2 알고리즘

```
입력: face landmarks + iris landmarks
1. 좌안 외곽 4점의 중심 = eyeCenterL
   좌안 iris center = irisL
   irisOffsetL = (irisL - eyeCenterL) / eyeWidthL  (정규화, -1~+1)
2. 우안도 동일
3. 평균 응시 오프셋 = avg(irisOffsetL, irisOffsetR)
4. yaw, pitch 가산
   gazeError = |avgOffset.x| + |avgOffset.y| × 0.7 + |yaw|/30 + |pitch|/30
5. gazeError < 0.4 AND |yaw| < 15° AND |pitch| < 12° → isLookingAtCamera = true
   gazeConfidence = 1 - min(1, gazeError / 0.8)
```

#### 3.8.3 폴백

- iris landmark가 없거나(MediaPipe FaceLandmarker가 iris 모드 미설정) 신뢰도 낮으면 yaw/pitch만으로 판정
- 측면 응시 추정 시도 X (정면만 판정)

### 3.9 주인공 가산점 (Hero Bonus) 알고리즘

> **목표:** 사용자가 §3.7에서 선택한 주인공 인물을 기준으로 사진 점수를 조정한다. AND/OR 모드 모두 지원.

#### 3.9.1 입력

- `HeroConfig.selectedPersonIds`: 사용자가 체크한 인물 ID
- `HeroConfig.mode`: "AND" / "OR"
- `HeroConfig.guaranteeNonHeroCount`: 폴더당 주인공 미등장 컷 보장 장수

#### 3.9.2 매칭 판정

```ts
function classifyHeroMatch(
  photo: PhotoEntry,
  config: HeroConfig
): "all" | "any" | "none" | "non_hero_guaranteed" {
  if (config.selectedPersonIds.length === 0) return "any";  // 미선택 시 통과

  const present = new Set(photo.presentPersonIds);
  const heroes = config.selectedPersonIds;

  if (config.mode === "AND") {
    return heroes.every((id) => present.has(id)) ? "all" : "none";
  } else {
    // OR
    return heroes.some((id) => present.has(id)) ? "any" : "none";
  }
}
```

#### 3.9.3 점수 영향

```
heroBonus = 0
if heroMatchKind === "all":
  heroBonus += 25
elif heroMatchKind === "any":
  heroBonus += 15
elif heroMatchKind === "none":
  heroBonus -= 10  // BLOCK 아님, 감점만

추가:
  if 주인공이 사진 면적의 ≥10% 차지: heroBonus += 5  (구도)
  if 주인공의 isLookingAtCamera === true: heroBonus += 5
  if 주인공이 사진 중앙(중심점에서 ±20% 이내): heroBonus += 3

heroBonus = clamp(heroBonus, -10, 25)
```

`finalScore`에 합산:
```
finalScore = baseScore(§3.5) + heroBonus
finalScore = clamp(finalScore, 0, 100)
```

#### 3.9.4 주인공 미등장 컷 보장

```
selectBest 알고리즘 보강 (§3.6):

1. heroMatchKind === "none" 사진을 별도 후보 풀로 분리
2. 일반 후보(any/all)에서 targetCount - guaranteeNonHeroCount 장 선별
3. 별도 풀에서 finalScore 상위 guaranteeNonHeroCount 장 선별 (heroMatchKind = "non_hero_guaranteed"로 마크)
4. 두 결과 합치기
5. 별도 풀에 후보 부족 시 일반 후보로 채움 (가족 단체컷 비중을 보장하려는 의도)
```

UI에서는 보장된 비주인공 컷에 "👨‍👩‍👧 가족컷" 같은 배지로 표시 (사용자가 인지하도록).

#### 3.9.5 인물 미선택 자동 디폴트

사용자가 "인물 선택" 화면에서 아무도 선택하지 않거나 "건너뛰기" 클릭 시:

```
1. faceCount 기준 내림차순 정렬한 PersonCluster 중 1위를 자동 hero로 지정
2. 해당 인물의 estimatedAge가 "infant" 또는 "child"이고
   현재 폴더가 newborn/50days/100days/first_birthday 중 하나이면
   → "아이를 자동 주인공으로 선택했습니다" 토스트
3. 그 외에는 자동 선택 없이 hero 비활성 (모든 사진 동등 처리)
```

### 3.10 제외 사유 시각화 규칙

갤러리 "제외됨" 탭에서 사유별 버킷 정렬:

| 사유 | 라벨 (한국어) | 정렬 우선순위 |
|------|---------------|----------------|
| eye_closed (high) | 눈감음 | 1 |
| blurry (motion, high) | 흔들림 | 2 |
| blurry (noise, high) | 노이즈 심함 | 3 |
| duplicate (burst) | 비슷한 컷 | 4 |
| duplicate (scene) | 비슷한 씬 | 5 |
| off_center | 구도 어긋남 | 6 |
| hero_absent (AND 모드) | 주인공 일부 미등장 | 7 |
| hero_absent (OR 모드, 주인공 전무) | 주인공 미등장 | 8 |
| low_face_confidence | 얼굴 인식 실패 | 9 |
| user_excluded | 직접 제외 | 10 |
| eye_closed (low), blurry (low) | 약한 감점 | 11 |

각 버킷에 사유 설명 1줄 + 사진 썸네일 그리드.

---

## 4. 분석 파이프라인

### 4.1 전체 흐름

```
[Upload]
   ↓
[For each FolderSession (순차 처리, 단 Stage 1~5는 폴더 단위, Stage 6~7은 폴더 통합)]
   ↓
   ├─ Stage 1: Thumbnailing (병렬, Web Worker)
   │     원본 → 400px 썸네일 + DataURL
   ↓
   ├─ Stage 2: pHash 계산 (병렬, Web Worker)
   │     썸네일 → 64bit perceptual hash
   ↓
   ├─ Stage 3: Burst Grouping (메인 스레드)
   │     pHash + EXIF + camera 기반 묶기
   ↓
   ├─ Stage 4: Scene Clustering (메인 스레드)
   │     pHash + outfitSig + 시간 기반
   ↓
   ├─ Stage 5: Face Detection + Embedding (메인 스레드)
   │     FaceLandmarker × 4 + BlazeFace 폴백
   │     + face embedding 모델 (§3.7.1, 임베딩 100% 브라우저 내)
   ↓
[모든 폴더 Stage 1~5 완료]
   ↓
   ├─ Stage 6: Person Clustering (전 폴더 통합)
   │     §3.7.2 온라인 클러스터링 + §3.7.4 폴더 간 병합
   ↓
   ├─ Stage 7: Hero Pick UI (사용자 입력 대기)
   │     인물 선택 화면 표시 → AND/OR 토글 → 비주인공 컷 보장 토글
   │     사용자가 "건너뛰기" 시 §3.9.5 자동 디폴트
   ↓
   ├─ Stage 8: Scoring (메인 스레드)
   │     §3 모든 신호 계산 + heroBonus(§3.9) → finalScore
   ↓
   ├─ Stage 9: Selecting (메인 스레드)
   │     §3.6 + §3.9.4 비주인공 보장 적용
   ↓
[FolderSession.status = "done"]
```

**병렬화 원칙:**
- Stage 1, 2: 병렬 안전 (Web Worker pool, 동시 4)
- Stage 3, 4: 폴더 내 메모리 자료구조 갱신, 메인 스레드
- Stage 5: MediaPipe는 동시 실행 시 메모리 충돌 위험 → 폴더 단위 순차

### 4.2 단계별 진행률 가중치 (UX)

```
thumbnailing      : 0%  → 12%
phashing          : 12% → 20%
burst_grouping    : 20% → 25%
scene_clustering  : 25% → 30%
face_detecting    : 30% → 65%   (가장 오래 걸림)
person_clustering : 65% → 78%   (임베딩 추출 + 온라인 클러스터링)
awaiting_hero_pick: 78% → 78%   (UI 블로킹, progress bar 멈춤 + "잠시 선택 필요" 안내)
scoring           : 78% → 92%
selecting         : 92% → 100%
```

UI는 위 비율로 progress bar 표시. 정확한 시간 예측보다 **꾸준히 늘어나는 것**이 중요.

### 4.3 분석 스토리텔링 메시지 (PRD F6 구현)

각 Stage 시작·종료 시 `StorySnapshot` 생성:

```
"썸네일 만드는 중... (1,247/2,000)"
"비슷한 컷 묶는 중... (이미 142장 그룹화)"
"얼굴 인식 중... (얼굴 발견 893개, 1,420장 처리)"
"등장 인물 정리 중... (4명 감지: 아이 1,420컷, 엄마 890컷, 아빠 612컷, 할머니 210컷)"
"누구를 중심으로 골라드릴까요? 잠시 선택해주세요 →"
"눈 감은 컷 17장 제외 중..."
"흔들린 컷 8장 제외 중..."
"주인공 등장 컷 우선 정렬 중..."
"베스트 30장 선정 중... (가족컷 5장 보장 포함)"
"완료! 총 1,800장 → 30장 선별, 1,770장 제외"
```

메시지 표시 시 **실수치 우선**, 가짜 진행 X.

### 4.4 메모리 / 성능 관리

- **이미지 객체 풀:** 동시에 메모리 상주 ImageBitmap 최대 12개
- **썸네일 DataURL:** 갤러리 표시 후 즉시 GC 대상화 (URL.revokeObjectURL)
- **pHash, scores:** PhotoEntry에 영구 보관 (가벼움)
- **원본 File 객체:** 메모리 안 올림. Browser가 디스크 핸들로 관리
- **OOM 방지:** `performance.memory.usedJSHeapSize` 모니터링, 80% 도달 시 다음 폴더 처리 일시 정지 + 1초 GC 대기

### 4.5 분석 중단 / 재개

- 사용자가 분석 중 다른 폴더 추가 → 현재 폴더 완료 후 신규 폴더 처리
- 브라우저 새로고침 → IndexedDB 세션 복구 (현재 폴더는 처음부터 재분석, 완료된 폴더는 결과만 복원)

---

## 5. 폴더 단위 처리와 이벤트 태그

### 5.1 폴더 → 이벤트 태그 자동 추론

기존 `eventTagger.ts` 매칭 규칙을 v3.0에서 강화:

```ts
const TAG_PATTERNS: Record<EventTag, RegExp[]> = {
  maternity:       [/만삭/, /배니티/, /maternity/i, /pregnancy/i],
  newborn:         [/베이비?본/, /신생아/, /newborn/i, /baby\s*born/i],
  "50days":        [/50일/, /오십일/, /50\s*day/i],
  "100days":       [/100일/, /백일/, /100\s*day/i],
  first_birthday:  [/돌/, /돐/, /1살/, /first\s*birthday/i, /1st\s*bday/i],
  wedding:         [/웨딩/, /wedding/i, /본식/, /본스냅/],
  family:          [/가족/, /family/i, /family\s*shot/i],
  pet_profile:     [/펫/, /반려/, /강아지/, /고양이/, /pet/i, /dog/i, /cat/i],
  travel:          [/여행/, /travel/i, /trip/i],
  other:           [],
};
```

매칭 실패 → `other`. 사용자가 드롭다운으로 변경 가능.

### 5.2 이벤트 태그별 추천 장수

```ts
const RECOMMENDED_COUNT: Record<EventTag, number> = {
  maternity:       10,
  newborn:         15,
  "50days":        20,
  "100days":       30,
  first_birthday:  50,
  wedding:        100,
  family:          30,
  pet_profile:     20,
  travel:          50,
  other:           30,
};
```

업로드 후 자동 채워지고, 사용자가 변경 가능.

### 5.3 폴더별 분석 가중치 조정

이벤트 태그에 따라 §3.5 점수 가중치 미세 조정:

| 태그 | eyeOpen 가중치 | sharpness 가중치 | 비고 |
|------|---------------|------------------|------|
| newborn | 0.20 (낮음) | 0.40 (높음) | 신생아는 자주 눈 감음 → 눈 가중치↓ |
| pet_profile | (펫 모드) | 0.55 | 펫은 표정보단 선명도 |
| wedding | 0.35 | 0.25 | 표정 우선 |
| 그 외 | 0.30 (기본) | 0.25 | |

### 5.4 폴더 추가/제거 시 동작

- **분석 전 추가:** 무제한, 폴더 목록에 추가
- **분석 중 추가:** 현재 폴더 완료 후 큐에 추가
- **분석 후 추가:** 신규 폴더만 분석, 기존 폴더 결과 유지
- **삭제:** 분석 결과까지 메모리에서 제거. 확인 모달 1회

---

## 6. 사용자 가중치 / 취향 보정 모델

### 6.1 MVP 범위

- v3.0 MVP: **현재 세션 내 카드 스와이프 피드백만** (기존 v0.2.x `feedbackLearning.ts` 계승)
- v3.3+: 이벤트 태그별 가중치 IndexedDB 영속 저장

### 6.2 카드 스와이프 피드백 (계승 + 강화)

기존 로직 그대로 유지하되, **새 신호 추가:**

```
사용자가 "이 사진 좋다"로 스와이프한 사진들의 평균 신호 계산:
  - avgSmileBalance
  - avgLaughingSquintRatio  ← 신규 (§3.1.2)
  - avgFaceSharpness
  - avgComposition

이 평균을 기준으로 점수 가중치 재조정:
  - avgLaughingSquintRatio가 높음 → "이 사용자는 웃음 squint 사진 좋아함" → eyeOpen 가중치↓, smileBalance 가중치↑
```

### 6.3 가중치 변경 한계

- 한 번 피드백 세션에서 가중치 변동 폭은 ±20% 이내 (급격한 변화 방지)
- 누적 가중치는 [0.05, 0.6] 범위로 클램프

---

## 7. ZIP 출력 명세 (워터마크 합성 포함)

### 7.1 폴더 구조 보존

```
입력:
  /원본루트/
    ├── 만삭/
    ├── 베이비본/
    └── 100일/

출력 ZIP (Flow B/C):
  ddalgak_picks_2026-04-27_1547.zip
    ├── 만삭/
    │     ├── IMG_0042.jpg
    │     └── IMG_0089.jpg
    ├── 베이비본/
    │     └── ...
    └── 100일/
          └── ...
```

### 7.2 파일명 정책

- **원본 파일명 그대로 유지** (스튜디오 업로드 시 매칭 편의)
- 한글 파일명 보존 (UTF-8 + JSZip 옵션)
- 충돌 시 `_2`, `_3` 자동 부여

### 7.3 워터마크 합성 (무료 사용자만)

#### 7.3.1 합성 사양

```
입력: 원본 이미지 + 워터마크 PNG
출력: 워터마크 합성된 JPEG

위치: 우측 하단
크기: 가로 폭의 15%
오프셋: 우측 가장자리에서 가로 폭의 3%, 하단에서 세로 폭의 3%
투명도: opacity 0.40
모드: 일반 합성 (multiply 아님)
포맷: JPEG quality 90
```

#### 7.3.2 합성 방법

- 클라이언트 사이드 Canvas 2D `drawImage` 사용
- 원본 → drawImage(원본) → drawImage(워터마크, 우하단) → toBlob('image/jpeg', 0.9)
- Web Worker에서 처리 (UI 블로킹 방지)
- 동시 처리 4장 (메모리 보호)

#### 7.3.3 워터마크 디자인

- PNG, 투명 배경
- "딸깍픽스" 한글 로고 + 작은 도메인 텍스트(`ddalgak.app` 등)
- 디자인 시안 확정은 사용자(기획자) 승인 필요. 디자인 시안 2~3개 제시 후 결정

#### 7.3.4 회피 방어

- 워터마크 PNG 자체는 클라이언트 번들에 포함 (변조 가능성 있으나 MVP는 무시)
- 추후 동적 로딩 + 서명 검증 고려

### 7.4 결제 후 워터마크 없는 ZIP 재생성

- 결제 성공 콜백 수신 → `app.payment.isPaid = true` → `watermarkEnabled = false`
- "워터마크 없는 ZIP 다운로드" 버튼 활성화 → ZIP 재생성
- **재생성 동안 기존 워터마크 ZIP은 유지** (사용자 신뢰)

### 7.5 ZIP UX

- 진척률: "압축 중... 47/132"
- 완료 시 토스트 + 자동 다운로드 트리거
- 실패 시 부분 ZIP 남기지 않음 (atomic)
- 24시간 내 재다운로드: IndexedDB에 ZIP Blob 캐시

### 7.6 파일명 정책 (Anonymized Display + ZIP)

> **PRD F19 구현.** UI에서는 가명만, ZIP에는 결제 상태에 따라 다른 파일명.

#### 7.6.1 가명 생성 규칙

```ts
function generateDisplayName(
  photo: PhotoEntry,
  folderSession: FolderSession,
  indexInFolder: number
): string {
  const tagKo = EVENT_TAG_KOREAN[folderSession.eventTag];  // "만삭", "돌" 등
  const idx = String(indexInFolder + 1).padStart(3, "0");
  return `DDP-${tagKo}-${idx}`;
}

const EVENT_TAG_KOREAN: Record<EventTag, string> = {
  maternity: "만삭",
  newborn: "베이비본",
  "50days": "50일",
  "100days": "100일",
  first_birthday: "돌",
  wedding: "웨딩",
  family: "가족",
  pet_profile: "펫",
  travel: "여행",
  other: "사진",
};
```

`displayName`은 PhotoEntry에 영구 저장(일관성). 분석 순서대로 폴더당 001부터 부여.

#### 7.6.2 UI 표시 규칙

- 갤러리 카드 캡션: `displayName`만
- 줌 모달 제목: `displayName`만
- 인물 선택 화면 등장 사진 라벨: `displayName`만
- 결제 결과 영수증 미리보기: `displayName`만
- 광고/SEO 메타: 원본 파일명 노출 금지

#### 7.6.3 ZIP 파일명 정책

| 사용자 상태 | ZIP 내 파일명 | 폴더 구조 |
|-------------|---------------|-----------|
| 무료 (워터마크 ZIP) | **`displayName`** (예: `DDP-만삭-001.jpg`) | 보존 |
| 유료 1회권 (클린 ZIP) | **원본 파일명** (예: `IMG_0042.jpg`) | 보존 |
| 유료 패키지 (클린 ZIP) | **원본 파일명** | 보존 |

> **이유:** 무료 사용자가 가명으로 ZIP을 받으면 **원본 폴더에서 해당 파일을 역추적 불가능**. "이 파일들만 따로 골라서 PC에서 작업"하는 우회를 차단해 결제 동기를 만든다. 유료 사용자는 스튜디오 매칭 편의를 위해 원본 파일명 보존.

#### 7.6.4 보호 강화 (성실한 어그러뜨림)

- DOM에 `data-original-name` 같은 속성 부착 금지
- React DevTools에서 PhotoEntry 검사 시 원본 파일명 마스킹: 직렬화 헬퍼 적용
  ```ts
  PhotoEntry.toJSON() {
    return { ...this, file: { name: "[masked]", size: this.file.size } };
  }
  ```
- Sentry 로그 / 텔레메트리 페이로드에서 file.name 자동 마스킹
- IndexedDB 저장 시 `file.name`은 별도 필드(파일명 매핑 테이블)에 저장 + ZIP 생성 시점에만 조회

#### 7.6.5 한계 명시

- 클라이언트 사이드 보호이므로 **결정한 사용자가 우회하는 것 자체는 막을 수 없다.** 단, "약간 신경 쓰면 되는데?" 정도가 아니라 "꽤 귀찮네"로 만들면 충분 (대부분 사용자는 결제 선택)
- 이 정책은 **악의적 우회 방지가 아니라 일반 사용자의 자연스러운 결제 동기 부여** 목적

---

## 8. 결제 시스템 인터페이스

### 8.0 단계적 운영 정책 (사업자 등록 미완 상태)

> **2026-04-27 확정:** 사용자 사업자등록증 미보유 상태에서 결제 모듈을 먼저 개발한다.

#### 단계 1 — Sandbox 개발·검증 (PR 8 ~ 베타 출시)

- **PG:** 포트원(PortOne) V2 SDK + Sandbox 모드만 사용
  - `PG_PORTONE_MODE=sandbox` 환경변수
  - 포트원 가맹 등록 없이 테스트 가능 (포트원 sandbox 계정 무료 발급)
- **결제 흐름:** 실제 결제 화면 동일하게 구현, 단 결제 처리는 sandbox 응답으로 시뮬레이션
- **클라이언트·서버·DB·콜백 검증:** 모두 실제처럼 작동
- **사용자 화면:** "테스트 결제 모드" 워터마크 노출 (실수로 사용자가 진짜 결제 시도하는 일 방지)

#### 단계 2 — 사업자 등록 완료 후 (출시 직전)

- 사업자 등록증 + 통신판매업 신고증 확보 후
- 포트원 가맹 등록 (3~5영업일)
- `PG_PORTONE_MODE=live` 로 환경변수 변경
- 코드 변경 0줄, 환경변수만 전환 (포트원 SDK가 모드 자동 분기)
- "테스트 결제 모드" 워터마크 제거
- 베타 → 정식 출시

> **이 정책으로 사업자 등록과 무관하게 결제 코드의 모든 PR(PR 8)을 출시 일정대로 완성 가능. 실제 가맹 등록만 출시 직전 1주에 진행하면 됨.**

### 8.1 결제 플로우

```
[Gallery 화면]
   ↓ "결제하고 워터마크 없는 ZIP 받기" 클릭
[Paywall 화면]
   - 상품 선택 (1회권 ₩4,900 / 패키지 ₩15,000)
   - 이메일 입력 (영수증·재다운로드용)
   - PG 선택 (카카오/토스/카드)
   ↓ "결제하기" 클릭
[PG 결제창 호출]
   ↓ 결제 완료
[PG 콜백 → 백엔드 검증 → 클라이언트로 결과 전달]
   ↓
[Payment Result 화면]
   - 성공: "결제 완료! 영수증 발송됨" + Gallery로 자동 이동
   - 실패: 사유 표시 + 재시도 버튼
```

### 8.2 백엔드 API 인터페이스 (필수 엔드포인트)

```
POST /api/payment/create
  Request:
    {
      "productCode": "single" | "package",
      "email": "user@example.com",
      "pgProvider": "kakaopay" | "tosspay" | "card",
      "clientSessionId": "uuid"      // 분석 세션 추적용
    }
  Response:
    {
      "paymentSessionId": "uuid",
      "amount": 4900,
      "pgRedirectUrl": "https://pay.kakao.com/..." OR
      "pgClientToken": "..."          // PG SDK 사용 시
    }

POST /api/payment/verify
  Request:
    {
      "paymentSessionId": "uuid",
      "pgTransactionId": "...",
      "pgPayload": {...}               // PG가 보낸 콜백 페이로드
    }
  Response:
    {
      "status": "paid" | "failed",
      "downloadQuota": 1,
      "downloadCount": 0,
      "expiresAt": 1735689600000,
      "receiptUrl": "https://..."
    }

GET /api/payment/status/:paymentSessionId
  Response: PaymentSession 전체 (재방문 시 사용)

POST /api/payment/redownload
  Request: { "paymentSessionId": "uuid", "email": "..." }
  Response: { "valid": true, "expiresAt": ... }
  목적: 사용자가 영수증 이메일 링크로 재방문 시 인증
```

### 8.3 결제 검증 보안

- PG 콜백 → 서버 측에서 **PG 공식 SDK로 거래 검증** (signature 확인)
- 클라이언트만 보고 결제 완료 처리 X
- 실패한 결제도 30일 보존 (분쟁 대응)

### 8.4 환불 정책 (운영)

- 결제 후 24시간 내 ZIP 다운로드 0회 → 환불 자동 승인
- 다운로드 1회 이상 → 환불 불가 (약관 명시)
- 분쟁 시 운영자 수동 처리

### 8.5 비회원 결제

- MVP는 비회원 결제 (이메일만)
- 영수증 이메일에 "재다운로드 링크" 포함 (24시간 유효)
- 같은 이메일로 재방문 시 클라이언트가 자동 복원 (IndexedDB)

---

## 9. 광고 배너 노출 규칙

### 9.1 노출 위치 (PRD §10.4 구현)

```
1. AnalysisProgress.tsx
   위치: 진행률 바 하단, 100px 띠
   크기: 728×90 (PC) / 320×100 (모바일)
   닫기: 불가 (강제 노출, 단 작음)

2. FolderGallery.tsx
   위치: 갤러리 하단 고정 바 위쪽, 80px 띠
   크기: 728×90 / 320×50
   닫기: 가능 (1회 닫으면 세션 내 비노출)

3. PaywallPreview (Paywall 진입 직전)
   위치: 카드형, 결제 버튼 위
   크기: 300×250
   닫기: 가능
```

### 9.2 비노출 조건

- `app.payment.isPaid === true` → 모든 광고 즉시 숨김
- `app.userLocale === "en"` → AdSense 영문 광고 (광고 정책상 분리 필요)
- 분석 결과 사진을 가리거나 위에 덮지 않음 (강제)

### 9.3 광고 임프레션 추적

```ts
interface AdImpression {
  id: string;
  slot: "analysis" | "gallery" | "paywall";
  shownAt: number;
  closedAt?: number;
  clicked: boolean;
}
```

자체 텔레메트리에도 기록 (운영비 정산 / KPI 분석용).

### 9.4 AdSense 정책 준수

- "어린이 대상" 콘텐츠로 분류되지 않도록 GA4 + AdSense 메타에 명시
- 자동 광고 (Auto Ads) 사용 금지 (UI 통제 불가)
- 광고 식별 라벨 ("Ad" / "광고") 표시 의무

---

## 10. 워터마크 / 무료 장수 제한 명세

### 10.1 무료 사용자 제약

| 제약 | 값 | 적용 위치 |
|------|-----|-----------|
| ZIP 포함 장수 상한 | **50장** | ZIP 생성 시 점수순 상위 50장만 |
| 워터마크 합성 | **모든 사진** | ZIP 생성 시 §7.3 |
| 광고 노출 | **§9 모든 슬롯** | 분석/갤러리/페이월 |

### 10.2 50장 초과 시 UX

- 갤러리에서는 선별된 전체 (예: 125장) 모두 표시 (사용자 만족도)
- ZIP 다운로드 버튼 클릭 시: "무료는 50장까지 ZIP 가능 / 결제 시 전체 다운" 모달
- 50장 선택 기준: 전체 선별 결과 중 finalScore 상위 50장

### 10.3 워터마크 합성 명세 (재명시)

**§7.3 참조.** 핵심:
- 우측 하단 15% 폭, opacity 0.40
- Canvas 2D, JPEG 90% quality
- 결제 즉시 워터마크 없는 ZIP 재생성 가능

### 10.4 무료/유료 상태 전환

```
[무료 상태]
  watermarkEnabled = true
  freeZipLimit = 50
  광고 노출

[결제 진행 중]
  → 상태 변경 없음 (실패 가능성)

[결제 성공 콜백]
  → watermarkEnabled = false
  → freeZipLimit = Infinity
  → 광고 노출 즉시 중단
  → "워터마크 없는 ZIP" 버튼 활성화
```

### 10.5 결제 만료 후 동작

- 1회권: 24시간 후 결제 효력 만료 → 다시 무료 상태 (재다운로드 불가)
- 패밀리권: 90일 또는 5회 소진 → 무료 상태
- 만료 시 알림: 영수증 이메일에 만료일 명시, 만료 1시간 전 클라이언트 토스트

---

## 11. 보안 / 프라이버시

### 11.1 데이터 분류

| 데이터 | 저장 위치 | 보존 기간 | 서버 전송 |
|--------|-----------|-----------|----------|
| 원본 사진 픽셀 | 브라우저 메모리만 | 세션 종료 시 GC | **절대 안 함** |
| 썸네일 DataURL | IndexedDB | 24시간 | 안 함 |
| pHash, scores | IndexedDB | 24시간 | 안 함 |
| 얼굴 임베딩 (Float32Array) | IndexedDB | 24시간 | **절대 안 함** |
| PersonCluster.displayName (사용자 입력) | IndexedDB | 영속(사용자가 삭제할 때까지) | 안 함 |
| 파일명 | IndexedDB | 24시간 | 안 함 |
| 결제 메타 (이메일/주문) | 서버 DB | 5년 (전자상거래법) | 송신 |
| 광고 임프레션 메타 | 서버 텔레메트리 | 1년 | 송신 |
| (P2) 보정 대상 사진 | 서버 임시 | 24시간 | 송신, 자동 삭제 |

### 11.2 약관 / 정책 (출시 전 법무 검토 필수)

- 이용약관
- 개인정보처리방침 (수집·이용·보관·파기 명시)
- 환불 정책 (§8.4)
- 14세 미만 정책 (만 14세 미만 가입 제한 — MVP 비회원이므로 결제 시 약관 동의로 처리)

### 11.3 GDPR / CCPA (글로벌 확장 시 적용)

- MVP는 한국 단일 시장이므로 GDPR/CCPA 직접 적용 X
- 단, 영문 UI 사용자 IP가 EU/CA인 경우 광고 동의 배너 노출 (AdSense 자동 처리)

### 11.4 보안 체크리스트

- [ ] HTTPS only (Vercel 기본 적용)
- [ ] PG SDK 서버 시크릿 키는 환경변수만, 클라이언트 노출 X
- [ ] PG 콜백 IP allowlist (Kakao/Toss 공식 IP)
- [ ] CSRF 토큰 (백엔드 API)
- [ ] Rate limiting (결제 API: 분당 10회/IP)
- [ ] 클라이언트 결제 결과만 보고 워터마크 해제 X (서버 검증 필수)
- [ ] Sentry에 PII 로깅 금지 (이메일 마스킹)

---

## 12. 에러 처리 / 엣지 케이스

### 12.1 분석 실패 케이스

| 케이스 | 처리 |
|--------|------|
| 폴더에 사진 0장 | 폴더 분석 스킵, 경고 표시 |
| 사진 파일 손상 (read 실패) | 해당 파일만 스킵, 사용자에게 파일명 알림 |
| MediaPipe 모델 로드 실패 | Laplacian-only 모드로 폴백 (얼굴 점수 0, sharpness만 사용) |
| 브라우저 OOM | 폴더 분석 중단 + "폴더를 나눠서 다시 시도" 안내 |
| EXIF 없음 | shotAt = 파일 lastModified로 폴백 |
| 회전된 사진 (EXIF Orientation) | 분석 전 정방향 보정 |
| HEIC 파일 | MVP에서 미지원, 업로드 시 사전 차단 + 안내 |
| RAW (.cr2/.nef) | MVP 미지원, 안내 |

### 12.2 결제 실패 케이스

| 케이스 | 처리 |
|--------|------|
| PG 결제창 닫힘 | "결제 취소됨" + 재시도 버튼 |
| PG 응답 타임아웃 | 30초 후 백엔드 폴링으로 상태 확인 |
| 카드 한도 초과 등 PG 거절 | PG 메시지 그대로 표시 + 다른 결제수단 권유 |
| 결제 성공했으나 콜백 손실 | 사용자가 "이미 결제했어요" 클릭 → 이메일+영수증번호로 복원 |
| 중복 결제 | 같은 분석 세션에 같은 productCode 재결제 시 경고 모달 |

### 12.3 네트워크 단절

- 분석 단계: 영향 없음 (오프라인 작동)
- 결제 단계: "오프라인입니다" 모달 + 재연결 시 자동 재시도
- 광고 로드 실패: 광고 슬롯만 비우고 정상 진행

### 12.4 다중 탭

- 같은 분석 세션 ID를 가진 다중 탭 → 마지막 탭이 우선권
- 결제 진행 중 다른 탭 진입 → "다른 탭에서 결제 진행 중" 경고

---

## 13. 성능 목표

### 13.1 분석 성능 (PRD §9.1 재명시)

| 사진 수 | 목표 시간 | 측정 환경 |
|---------|-----------|-----------|
| 500장 | 3분 이내 | M1 MacBook, Chrome 최신 |
| 1,000장 | 5분 이내 (인물 클러스터링 포함) | 동일 |
| 3,000장 | 15분 이내 | 동일 |
| 5,000장 | 25분 이내 | 동일 (실용 상한) |

**인물 단계 추가 부담 추정:**
- 임베딩 추출: 얼굴당 약 30~80ms (M1, WebGL 백엔드)
- 1,000장에 평균 1.5개 얼굴 가정 → 1,500개 임베딩 → 약 60~120초 추가
- 클러스터링(증분): 미미 (< 5초)
- 위 목표 시간에 이미 포함된 추정치

### 13.2 코드 성능 규칙

- **Zustand 셀렉터:** 기존 v0.2.x 룰 유지 (`useStore((s) => s.a)` 만 사용, 객체 반환 금지 — React Error #185 방지)
- **메모이제이션:** 갤러리 카드 컴포넌트 `React.memo` 필수
- **이미지 lazy loading:** 갤러리 그리드는 IntersectionObserver
- **Canvas 작업:** OffscreenCanvas + Web Worker (브라우저 호환 시)

### 13.3 번들 크기

| 항목 | 상한 |
|------|------|
| 초기 JS 번들 (gzip) | 250KB |
| MediaPipe vision_bundle (gzip) | 추가 800KB (지연 로드) |
| CSS (gzip) | 30KB |
| Initial Page Load (LCP) | < 2.5s (3G fast 기준) |

### 13.4 결제 페이지 성능

- Paywall 진입 → 3초 이내 PG 결제창 호출
- 결제 완료 → 클라이언트 상태 반영까지 5초 이내

---

## 14. QA 체크리스트

### 14.0 정확도 게이트 (출시 필수 통과)

> **PRD §12.2의 정확도 지표 모두 충족하지 못하면 출시 불가.** 매 PR마다 자동 측정.

#### 14.0.1 정확도 측정 데이터셋

```
data/benchmark/
├── b_grade_recall/             # 1,000장, S/A/B 라벨 + B 사유
│   ├── maternity/   (200장)
│   ├── newborn/     (200장)
│   ├── 100days/     (200장)
│   ├── first_birthday/ (200장)
│   └── family/      (200장)
│   └── labels.json             # {photoId: {grade, reasons[]}}
├── person_clustering/          # 200세트 × 30~50장
│   └── families/               # 가족 단위 폴더
│   └── labels.json             # {photoId: {personId}}
└── gaze/                       # 30+30장
    └── labels.json             # {photoId: {looking_at_camera: bool}}
```

#### 14.0.2 자동 측정 스크립트

```
npm run bench:b-grade
  - data/benchmark/b_grade_recall/ 실행
  - 출력: precision, recall, F1, FPR, 사유별 정밀도
  - 게이트: recall ≥ 92%, FPR ≤ 8%, F1 ≥ 0.85
  - 실패 시 exit 1

npm run bench:person
  - data/benchmark/person_clustering/ 실행
  - 출력: 동일인 매칭률, 다른 인물 분리율
  - 게이트: ≥ 90% / ≥ 95%

npm run bench:gaze
  - data/benchmark/gaze/ 실행
  - 게이트: ≥ 80%
```

#### 14.0.3 CI/CD 통합

```
GitHub Actions:
  on push (main):
    - npm run bench:b-grade  ← 게이트
    - npm run bench:person   ← 게이트
    - npm run bench:gaze     ← 베타 게이트(MVP는 권고)
  on tag (v*):
    - 모든 위 + 정확도 리포트 자동 생성
    - 정확도 하락 시 배포 차단
```

#### 14.0.5 라벨링 협업 시스템 (PRD F22 구현)

> **다중 라벨러가 각자 계정으로 라벨링하고, 합의 알고리즘으로 최종 정답지를 만든다.**

##### 데이터 모델

```sql
-- 라벨러 계정 (Supabase Auth users 테이블 활용 + 메타)
create table labelers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  invited_at timestamptz not null default now(),
  invited_by uuid references auth.users(id),
  consensus_rate float,                     -- 합의율 (자동 계산, 라벨링 후)
  total_labels integer not null default 0,
  is_active boolean not null default true
);

-- 검증셋 사진 마스터 (라벨링 대상)
create table benchmark_photos (
  id uuid primary key default gen_random_uuid(),
  dataset text not null check (dataset in ('b_grade', 'person_clustering', 'gaze')),
  storage_path text not null,               -- Supabase Storage 경로
  event_tag text,                            -- maternity / newborn 등 (b_grade dataset만)
  family_id text,                            -- person_clustering dataset만
  uploaded_at timestamptz not null default now()
);

-- 라벨러 × 사진 작업 할당
create table labeling_assignments (
  id uuid primary key default gen_random_uuid(),
  labeler_id uuid not null references auth.users(id) on delete cascade,
  photo_id uuid not null references benchmark_photos(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(labeler_id, photo_id)
);

-- 개별 라벨 결과
create table labels (
  id uuid primary key default gen_random_uuid(),
  labeler_id uuid not null references auth.users(id) on delete cascade,
  photo_id uuid not null references benchmark_photos(id) on delete cascade,
  -- B급 검증셋용
  grade text check (grade in ('S', 'A', 'B', 'skipped')),
  b_reasons text[],                          -- ['eye_closed', 'blurry', 'duplicate', 'other']
  -- 인물 클러스터링용
  person_id_in_set text,                     -- 가족 내 인물 ID (예: 'p1', 'p2')
  -- 응시용
  looking_at_camera boolean,
  -- 공통
  confidence text check (confidence in ('high', 'medium', 'low')) default 'high',
  notes text,
  created_at timestamptz not null default now(),
  unique(labeler_id, photo_id)
);

-- 합의 알고리즘 결과 (사진당 1행, 최종 정답)
create table consensus_labels (
  photo_id uuid primary key references benchmark_photos(id) on delete cascade,
  consensus_grade text,
  consensus_b_reasons text[],
  consensus_person_id text,
  consensus_looking boolean,
  agreement_count integer not null,          -- 합의한 라벨러 수
  total_labelers integer not null,           -- 라벨링 한 라벨러 총 수
  status text not null check (status in ('consensus', 'disputed', 'insufficient')),
  resolved_by uuid references auth.users(id), -- 분쟁 시 운영자 결정
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

-- 라벨러 초대 토큰
create table labeler_invites (
  token text primary key,
  invited_email text,
  expires_at timestamptz not null,
  used boolean not null default false,
  used_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
```

##### 합의 알고리즘 의사코드

```ts
function computeConsensus(photoId: string): ConsensusResult {
  const labels = await db.query<Label>("select * from labels where photo_id = $1", [photoId]);
  const total = labels.length;

  if (total === 0) {
    return { status: "insufficient", reason: "no_labels" };
  }
  if (total === 1) {
    return { status: "insufficient", reason: "single_labeler", needsMore: true };
  }

  // grade(S/A/B) 다수결
  const gradeCounts = countBy(labels, l => l.grade);
  const [topGrade, topCount] = entries(gradeCounts).sort((a, b) => b[1] - a[1])[0];

  if (topCount > total / 2) {
    // 과반 합의
    const bReasons = topGrade === "B"
      ? consensusReasons(labels.filter(l => l.grade === "B").flatMap(l => l.b_reasons))
      : null;
    return {
      status: "consensus",
      consensus_grade: topGrade,
      consensus_b_reasons: bReasons,
      agreement_count: topCount,
      total_labelers: total,
    };
  }

  // 동률 → 분쟁
  return {
    status: "disputed",
    candidates: gradeCounts,
    total_labelers: total,
  };
}

function consensusReasons(allReasons: string[]): string[] {
  const counts = countBy(allReasons, r => r);
  const max = Math.max(...Object.values(counts));
  return Object.entries(counts)
    .filter(([_, count]) => count === max)
    .map(([reason]) => reason)
    .sort();  // alphabetical for ties
}
```

##### 작업 분배 알고리즘

```ts
function assignPhotosToLabelers(
  photos: string[],          // 검증셋 photoId 목록
  labelers: string[],        // 라벨러 userId 목록
  redundancy: number = 2     // 사진당 최소 라벨러 수
): Assignment[] {
  if (labelers.length < redundancy) {
    throw new Error(`Need at least ${redundancy} labelers`);
  }

  const assignments: Assignment[] = [];
  const photoLoadByLabeler = new Map(labelers.map(l => [l, 0]));

  for (const photo of photos) {
    // 작업량 적은 라벨러 redundancy명 선택
    const sorted = labelers.sort((a, b) =>
      photoLoadByLabeler.get(a)! - photoLoadByLabeler.get(b)!
    );
    const assigned = sorted.slice(0, redundancy);
    for (const labelerId of assigned) {
      assignments.push({ labeler_id: labelerId, photo_id: photo });
      photoLoadByLabeler.set(labelerId, photoLoadByLabeler.get(labelerId)! + 1);
    }
  }

  return assignments;
}
```

##### 라벨링 화면 핵심 동작

- **블라인드 모드:** 다른 라벨러 결정 절대 비노출 (편향 방지)
- **키보드 우선 UI:**
  ```
  1: S급 → 자동 다음 사진
  2: A급 → 자동 다음 사진
  3: B급 → 사유 팝업 (Q/W/E/R 단축키 또는 클릭) → 자동 다음 사진
  Space: 건너뛰기 (skipped 라벨)
  ←/→: 이전/다음
  Cmd+Z: 마지막 라벨 취소
  ```
- **자동 저장:** label 결정 직후 즉시 Supabase에 upsert (네트워크 끊겨도 IndexedDB 큐)
- **진행률 표시:** 본인 진행 / 전체 진행 / 합의 도달 / 분쟁 미해결

##### Row-Level Security (Supabase)

```sql
-- 라벨러는 자신의 라벨만 read/write
alter table labels enable row level security;
create policy "labelers see only own labels" on labels
  for all using (auth.uid() = labeler_id);

-- 어드민(role = 'admin')은 전체 read/write
create policy "admins full access" on labels
  for all using (
    exists (select 1 from labelers where user_id = auth.uid() and role = 'admin')
  );

-- benchmark_photos는 모든 라벨러 read 가능, 운영자만 write
alter table benchmark_photos enable row level security;
create policy "labelers can read photos" on benchmark_photos
  for select using (
    exists (select 1 from labelers where user_id = auth.uid())
  );
```

##### 데이터 보호 (사진 다운로드 방지)

- 사진은 Supabase Storage에 저장, **signed URL (5분 유효)** 로만 제공
- 클라이언트 표시 시:
  - `<img>` 태그에 `oncontextmenu="return false"` (우클릭 차단)
  - DevTools에서 src 추출해도 5분 후 만료
  - DOM에 워터마크 합성된 버전 표시 (라벨러용 워터마크 = "라벨링 전용, 외부 유출 금지")
- 다운로드 시도 감지 + 운영자 알림 (선택, 베타 후)

#### 14.0.4 출시 후 운영 모니터링

- **사용자 토글률 추적:** 갤러리에서 사용자가 토글한 비율(force_in / force_out)을 익명 텔레메트리로 수집
- 이벤트 태그별 토글률이 임계 초과 시 알람:
  - newborn: > 18% → 신생아 도메인 정확도 문제
  - first_birthday: > 12% → 돌 도메인 정확도 문제
- 분기마다 정확도 회귀 — 검증셋에 사용자 토글 사례를 무명화하여 추가 (라벨링은 기획자 수동)

### 14.1 핵심 시나리오 회귀 테스트 (수동 + 자동)

매 릴리즈마다 다음을 확인:

#### 시나리오 1 — 성장앨범 5폴더 통합
- [ ] 만삭/베이비본/50일/100일/돌 5폴더 업로드
- [ ] 자동 이벤트 태깅 5개 모두 정확
- [ ] 폴더별 추천 장수 자동 표시
- [ ] 분석 완료 (1,500장 기준 < 7분)
- [ ] 폴더별 탭에서 결과 확인 가능
- [ ] ZIP 다운로드 → 폴더 구조 보존 확인 (압축 해제 후 검증)

#### 시나리오 2 — 웃음 squint 보존
- [ ] 활짝 웃어서 눈 감긴 사진 10장 포함된 폴더 분석
- [ ] **이 10장 중 8장 이상이 선별되어야 함** (가짜 눈감음 오탐 < 20%)
- [ ] 선별 안 된 컷도 "제외 사유 = 눈감음(low)"이 아닌 "유사컷"이어야 함

#### 시나리오 3 — 인물 중심 아웃포커싱 보존
- [ ] 배경 보케, 인물 선명한 사진 5장 포함
- [ ] **5장 모두 흔들림으로 분류되지 않아야 함**
- [ ] composition score에 가산점 반영 확인

#### 시나리오 4 — 인물 클러스터링 + 주인공 우선
- [ ] 가족 4명(아이/엄마/아빠/할머니)이 등장한 사진 500장 분석
- [ ] **인물 클러스터링 결과 4명 모두 분리되어야 함** (정확도 ≥ 90%)
- [ ] 같은 인물의 외형 변화(의상 변경, 표정 변화)가 같은 클러스터로 묶여야 함
- [ ] 사용자가 "아이"만 hero 선택 → 결과의 ≥ 80%가 아이 등장 컷
- [ ] AND 모드: "아이 + 엄마" 선택 → 둘 다 등장한 컷만 후보
- [ ] OR 모드: "아이 + 엄마" 선택 → 둘 중 하나라도 등장한 컷
- [ ] 비주인공 컷 보장 5장 옵션 켜면 가족 단체컷이 5장 포함됨
- [ ] 사용자가 "건너뛰기" → 등장 최다 인물(아이) 자동 hero, 토스트 표시
- [ ] 폴더 간 동일 인물 통합: 만삭/베이비본/돌 모두 같은 "엄마"가 동일 personId

#### 시나리오 5 — 결제 + 워터마크
- [ ] 무료 상태에서 ZIP 다운 → 모든 사진에 워터마크 + 50장 제한 동작
- [ ] 결제 (테스트 모드) → 즉시 클린 ZIP 활성화
- [ ] 클린 ZIP 다운 → 워터마크 없음 + 전체 장수 포함
- [ ] 결제 후 광고 즉시 비노출
- [ ] 영수증 이메일 수신 확인

#### 시나리오 6 — Google Drive 폴더 연동
- [ ] "Google Drive에서 가져오기" 버튼 클릭 → OAuth 팝업 정상 표시
- [ ] Picker에서 폴더 5개 선택 → 폴더 카드 5개 정상 생성
- [ ] 각 폴더에 출처 배지 ☁️ Drive 표시
- [ ] 이벤트 태그 자동 추론 정상 작동 (Drive 폴더명 한국어)
- [ ] 분석 진행률에 "Drive에서 받는 중" 단계 표시
- [ ] 1,500장 분석 완료 (썸네일만, 약 9분)
- [ ] 갤러리에서 결과 정상 표시 (썸네일 표시)
- [ ] **무료 워터마크 ZIP**: 썸네일+워터마크 합성으로 ZIP 생성
- [ ] **결제 후**: 선별 사진만 원본 자동 다운로드 → 클린 ZIP
- [ ] 폴더 구조 보존 (Drive 원본 폴더명 그대로)
- [ ] 토큰 만료 시 재로그인 모달 정상 표시
- [ ] OAuth 거부 시 "컴퓨터 폴더 업로드"로 자연스러운 폴백

#### 시나리오 7 — 세션 복구
- [ ] 분석 중 새로고침 → 복구 배너 표시 → 재개
- [ ] 갤러리 상태에서 새로고침 → 즉시 복구
- [ ] 결제 직후 새로고침 → 결제 상태 유지

### 14.2 자동 테스트 우선순위

```
필수 (CI 게이트):
  - eventTagger.ts: 폴더명 → 태그 매핑 정확도 100%
  - phash.ts: 같은 사진 hash 일치
  - laplacian.ts: faceSharpness 계산 정확도
  - scorer.ts: §3.5 가중치 적용 확인
  - selector.ts: §3.6 비례 할당 정확도 + §3.9.4 비주인공 보장
  - watermark.ts: 합성 위치/크기/투명도
  - personCluster.ts: §3.7 클러스터링 — 동일 인물 임베딩 페어 ≥ 90% 매칭, 다른 인물 ≤ 10% 매칭
  - heroBonus.ts: §3.9 매칭 분류 + 가산점 계산
  - gaze.ts: §3.8 카메라 응시 추정 — 정면 응시 샘플 30장 ≥ 80% 정확도

권장:
  - 결제 API mock 테스트
  - ZIP 폴더 구조 보존 테스트
```

### 14.3 베타 테스트 체크리스트 (출시 1주 전)

- [ ] 베타 사용자 50명 모집 (맘카페 / 인스타)
- [ ] 결제는 0원 쿠폰으로 운영
- [ ] 사용자 피드백 NPS 설문 (10점 만점, 7+ 비율 측정)
- [ ] 1차 셀렉 결과 사용자 수정률 측정 (목표 < 15%)
- [ ] 분석 실패율 측정 (목표 < 1%)
- [ ] 워터마크 거슬림 정도 설문 (5단계, 평균 3.5+)

---

## 15. 배포 / 운영

### 15.1 배포 환경

- **프론트:** Vercel 정적 배포 (현재 구성 유지)
- **백엔드:** Vercel Serverless / Cloudflare Workers / Supabase Edge (Claude Code 결정)
- **DB:** Supabase / PlanetScale / Neon (Claude Code 결정)
- **모니터링:** Sentry (프론트 에러), 자체 로그 + GA4

### 15.2 CI/CD

```
GitHub Actions 워크플로우:
  on push (main):
    - lint (typescript-eslint, no-explicit-any 에러)
    - unit test (vitest)
    - build (vite)
    - bundle size check (250KB 초과 시 실패)
    - deploy preview (Vercel)
  on tag (v*):
    - 모든 위 단계
    - production deploy
    - 변경로그 자동 작성 (Conventional Commits)
```

### 15.3 운영자 어드민 페이지 (PRD F21 구현)

> **PRD F21의 8개 영역(대시보드/결제/사용자/쿠폰/모니터링/광고/콘텐츠/비상토글)을 한 사이트로 통합. `/admin` 경로.**

#### 15.3.1 기술 스택

- **프레임워크:** 본 프로덕트와 동일한 React + Vite (코드 분리 청크)
- **인증:** Supabase Auth + 단일 어드민 계정 (MVP). v3.2 이후 다계정·역할 분리
- **DB:** Supabase Postgres + Row-Level Security (어드민 키만 전체 read/write)
- **차트:** Recharts (이미 v0.2.x에서 사용)

#### 15.3.2 데이터 모델

```sql
-- 계정·역할 (PRD F21.3) — Supabase Auth users 테이블 위에 메타 추가
create table user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null check (role in ('admin', 'labeler', 'member')) default 'labeler',
  created_at timestamptz not null default now(),
  last_active_at timestamptz,
  is_active boolean not null default true,
  notes text                                -- 어드민 메모
);

-- 어드민 액션 감사 로그 (모든 어드민 행동 추적)
create table admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id),
  action text not null,                     -- 'refund', 'coupon_issued', 'role_changed', 'flag_toggled' ...
  target_type text,                         -- 'payment', 'user', 'coupon', 'flag'
  target_id text,
  before_state jsonb,
  after_state jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

-- 비회원 결제 이메일 디렉터리 (회원 가입 시 병합)
create table email_directory (
  email text primary key,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  total_paid_amount integer not null default 0,
  total_paid_count integer not null default 0,
  linked_user_id uuid references auth.users(id),  -- v3.2에서 회원 가입 시 연결
  notes text
);

-- 계정 활동 로그 (UI에서 "최근 활동" 표시용)
create table user_activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  email text,                               -- 비회원이면 user_id가 null, email만
  action text not null,                     -- 'analysis_started', 'payment_paid', 'label_submitted' ...
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index idx_activity_user on user_activity_log(user_id, created_at desc);
create index idx_activity_email on user_activity_log(email, created_at desc);

-- 결제 이력 (PR 8에서 만들어짐)
create table payment_sessions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  product_code text not null check (product_code in ('single', 'package')),
  amount integer not null,
  status text not null,
  pg_provider text,
  pg_transaction_id text,
  pg_mode text not null check (pg_mode in ('sandbox', 'live')),
  download_quota integer not null,
  download_count integer not null default 0,
  reextraction_count integer not null default 0,
  ad_free_enabled boolean not null default false,
  expires_at timestamptz not null,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- 쿠폰 (F21.4)
create table coupons (
  code text primary key,
  discount_percent integer,                -- nullable, 둘 중 하나만 사용
  discount_amount integer,                 -- 원 단위
  valid_from timestamptz not null default now(),
  valid_until timestamptz not null,
  max_uses integer,                        -- null = 무제한
  used_count integer not null default 0,
  applies_to text not null check (applies_to in ('single', 'package', 'both')),
  created_by text not null,
  notes text                               -- 어드민 메모
);

-- 텔레메트리 (F21.5)
create table analysis_events (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  event_type text not null,                -- 'started', 'completed', 'failed', 'toggled', ...
  event_tag text,                          -- maternity / newborn / ...
  metadata jsonb,
  user_modification_ratio float,           -- 사용자 토글률 (12% 임계)
  created_at timestamptz not null default now()
);

-- 비상 토글 (F21.8)
create table feature_flags (
  flag_name text primary key,              -- 'analysis_enabled', 'payment_enabled', 'ads_enabled'
  enabled boolean not null default true,
  message text,                            -- 사용자에게 보여줄 메시지
  updated_at timestamptz not null default now(),
  updated_by text
);

-- IP 차단 (F21.8)
create table blocked_ips (
  ip text primary key,
  reason text,
  blocked_at timestamptz not null default now()
);
```

#### 15.3.3 화면 구조

```
/admin
├── /                  대시보드 (오늘/이번주/이번달 핵심 숫자)
├── /payments          결제 관리 (검색/상세/환불/재발급)
├── /accounts          계정·권한 관리 (어드민/라벨러/회원)
│   ├── /accounts/labelers       라벨러 초대·통계 (F22 연동)
│   ├── /accounts/members        회원 (v3.2+)
│   └── /accounts/emails         비회원 이메일 디렉터리
├── /coupons           쿠폰 관리 (발급/사용현황/일괄발급)
├── /labeling          라벨링 관리 (검증셋 업로드·작업 분배·합의 결과·분쟁 해결)
├── /monitoring        오류·정확도 모니터링 (Sentry 임베드 + 정확도 그래프)
├── /ads               광고 운영 (AdSense 위젯)
├── /content           콘텐츠 관리 (공지/약관/FAQ)
├── /audit             감사 로그 (어드민 액션 기록)
└── /controls          비상 토글 (Kill Switch)

/labeling             라벨러 작업 화면 (PRD F22)
├── /labeling          내 라벨링 작업 큐
├── /labeling/photo/:id  카드 단위 라벨링 UI
└── /labeling/stats    내 진행률 + 합의율
```

#### 15.3.4 핵심 API 엔드포인트

```
어드민 전용 (Service Role Key 검증):

GET  /api/admin/dashboard/today      → 오늘 지표
GET  /api/admin/dashboard/range?from=&to=  → 기간 지표
GET  /api/admin/payments?q=&from=&to=
POST /api/admin/payments/:id/refund  → 포트원 환불 + DB 갱신
POST /api/admin/payments/:id/reissue → 다운로드 토큰 재발급

POST /api/admin/coupons              → 쿠폰 생성
GET  /api/admin/coupons
POST /api/admin/coupons/bulk         → 일괄 발급 (베타 테스터용)

GET  /api/admin/monitoring/errors    → Sentry 프록시
GET  /api/admin/monitoring/accuracy  → 사용자 토글률 시계열

POST /api/admin/flags/:name          → 비상 토글
POST /api/admin/blocked-ips

# 계정 관리 (F21.3)
GET  /api/admin/accounts             → 모든 계정 (역할·필터·페이징)
PATCH /api/admin/accounts/:id        → 역할 변경·활성화/비활성화
POST /api/admin/accounts/:id/reset-password  → 비밀번호 리셋 메일
POST /api/admin/labelers/invite      → 라벨러 초대 토큰 발급
POST /api/admin/labelers/bulk-reward → 라벨링 완료 라벨러 보상 쿠폰 일괄 발급
GET  /api/admin/audit                → 감사 로그 조회

# 라벨링 관리 (F22)
POST /api/admin/benchmark/upload     → 검증셋 사진 업로드
POST /api/admin/labeling/distribute  → 작업 분배 실행
GET  /api/admin/labeling/consensus   → 합의 결과 조회
POST /api/admin/labeling/resolve/:photoId  → 분쟁 사진 어드민 결정
GET  /api/admin/labeling/stats       → 라벨러별 진행률·합의율

# 라벨러용 (인증된 라벨러만)
GET  /api/labeling/my-queue          → 내 작업 큐
GET  /api/labeling/photo/:id         → 사진 signed URL (5분 유효)
POST /api/labeling/labels            → 라벨 결과 저장 (upsert)
GET  /api/labeling/my-stats          → 내 진행률·합의율
```

#### 15.3.5 보안

- 어드민 페이지는 **별도 청크**로 코드 분할 (일반 사용자에게 어드민 코드 미노출)
- Supabase Service Role Key는 서버(Edge Function)에서만 사용
- 어드민 비밀번호는 bcrypt 해시 후 ENV 보관
- 모든 어드민 API에 Rate limiting (분당 60회/IP)
- **모든 어드민 액션 감사 로그** (`admin_audit_log` 테이블) — 누가/언제/무엇을 변경했는지

#### 15.3.6 MVP 출시 시점 최소 기능

다음만 있으면 출시 OK, 나머지는 v3.0.x 패치로 점진 추가:

| 기능 | MVP 필수 | v3.0.x 패치 |
|------|----------|-------------|
| 대시보드 (오늘/이번주) | ✅ | — |
| 결제 검색·상세 | ✅ | — |
| 수동 환불 | ✅ | — |
| 다운로드 재발급 | ✅ | — |
| **계정·역할 관리 (어드민/라벨러)** | ✅ | 회원·이메일 디렉터리 확장 |
| **라벨링 관리 + 라벨러 초대 + 합의 결과** | ✅ | 분쟁 자동 해결 휴리스틱 |
| 쿠폰 발급 (단순) | ✅ (베타 테스터용) | 자동 발급 규칙 |
| 비상 토글 (분석/결제/광고) | ✅ | — |
| **감사 로그** | ✅ | 검색·필터 강화 |
| 정확도 그래프 | — | ✅ |
| AdSense 위젯 | — | ✅ |
| 콘텐츠 관리 | — | ✅ |
| IP 차단 | — | ✅ |

### 15.4 분석 텔레메트리·에러 모니터링

- **분석 텔레메트리:** Supabase `analysis_events` 테이블 + 어드민 §15.3 임베드
- **에러 모니터링:** Sentry (프론트), 에러율 1% 초과 시 Slack 알림

### 15.4 출시 전 체크리스트

- [ ] PRD §13.1 v3.0 DoD 모두 통과
- [ ] **§14.0 정확도 게이트 모두 통과** (B급 recall ≥ 92%, FPR ≤ 8%, F1 ≥ 0.85, 인물 ≥ 90%/95%, 응시 ≥ 80%)
- [ ] §14.1 회귀 테스트 6개 모두 통과
- [ ] §14.3 베타 테스트 NPS 7+ 50% 이상
- [ ] 약관/정책 법무 검토 완료
- [ ] PG 계약 / API 키 / 정산 계좌 셋업
- [ ] 카카오페이 가맹점 등록 완료
- [ ] Google AdSense 승인 완료
- [ ] 도메인 / SSL / 이메일 발송 (SendGrid/Resend) 준비

---

## 16. Google Drive 폴더 연동 (PRD F23 구현)

> **기존 v0.2.x AlbumContainer의 Google Drive 코드(GIS OAuth + Picker + Drive API)를 재활용해 FolderUpload·Upload 화면에서도 Drive 폴더 직접 선택 가능하게 확장.**

### 16.1 환경변수 (기존 v0.2.x 그대로)

```
VITE_GOOGLE_CLIENT_ID=...     # 기존 발급분 재사용
VITE_GOOGLE_API_KEY=...       # 기존 발급분 재사용
```

추가 OAuth 설정에서 `https://ddalgak-picks.vercel.app` 도메인을 승인된 origin에 추가 (이미 v0.2.x에서 완료된 작업이면 그대로).

### 16.2 OAuth Scope

```
https://www.googleapis.com/auth/drive.readonly
```

읽기 전용. Picker로 사용자가 명시적으로 선택한 폴더만 접근.

### 16.3 데이터 모델 확장

```ts
// FolderSession 확장 — 기존 필드는 유지, 새 필드만 추가
interface FolderSession {
  // ... §2.6 기존 필드 모두 유지

  // v3.0 신규 — Drive 연동 (선택적)
  source: "local" | "google_drive";       // 디폴트 "local"
  driveFolderId?: string;                  // Drive 폴더 ID
  driveFolderPath?: string;                // 사용자에게 표시할 경로 (예: "내 드라이브/2026 만삭/")
}

// PhotoEntry 확장 — Drive 출처 사진의 추가 메타
interface PhotoEntry {
  // ... §2.3 기존 필드 모두 유지

  // v3.0 신규 — Drive 사진 (source가 google_drive일 때만)
  driveFileId?: string;                    // Drive 파일 ID
  driveThumbnailUrl?: string;              // Drive thumbnailLink (만료될 수 있음)
  driveOriginalUrl?: string;               // Drive get media 엔드포인트 (선별 후 다운로드용)
  isOriginalDownloaded: boolean;           // 원본 다운로드 완료 여부 (결제 후 ZIP 시점에 true로)
  originalBlob?: Blob;                     // 다운로드 완료 시 Blob 캐시 (메모리, 세션 종료 시 GC)
}
```

### 16.4 OAuth + Picker 흐름

```
1. 사용자가 "Google Drive에서 가져오기" 버튼 클릭
2. GIS(Google Identity Services) OAuth 토큰 요청
   - 기존 토큰 있고 유효하면 재사용
   - 만료/없음이면 popup OAuth 화면
3. Drive Picker 모달 표시 (구글 공식 Picker SDK)
   - 폴더만 선택 가능 (filetype filter)
   - 다중 선택 (Picker.MULTI_SELECT_ENABLED)
4. 사용자가 폴더 1~N개 선택 + "선택 완료"
5. 각 폴더의 자식 파일 목록 가져오기 (Drive API files.list)
   - mimeType filter: image/*
   - 페이징 (한 번에 1000개)
   - nested 폴더는 v3.0 MVP에서 미처리 (한 단계만)
6. FolderSession 객체 생성 (source: "google_drive")
7. 이벤트 태그 자동 추론 + 폴더별 목표 장수 설정 화면으로 진입
   (기존 v0.2.x FolderUpload UI 동일하게 표시)
```

### 16.5 다운로드 파이프라인 (썸네일 → 원본 단계화)

#### 16.5.1 분석용 썸네일 다운로드 (Stage 0, 분석 시작 직후)

```ts
async function downloadThumbnails(session: FolderSession, concurrency: number = 6) {
  const queue = [...session.photos.values()];
  const inflight = new Set<Promise<void>>();

  for (const photo of queue) {
    const task = (async () => {
      // Drive thumbnailLink는 기본 220px, sz 파라미터로 800px 요청
      const url = `${photo.driveThumbnailUrl}=s800`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${getDriveAccessToken()}` },
      });
      const blob = await res.blob();
      photo.thumbDataUrl = await blobToDataUrl(blob);
      session.progress.thumbnailing++;
    })();

    inflight.add(task);
    if (inflight.size >= concurrency) {
      await Promise.race(inflight);
      for (const t of [...inflight]) {
        if (await isSettled(t)) inflight.delete(t);
      }
    }
  }
  await Promise.all(inflight);
}
```

- 동시 6개 (Drive API 분당 1,000회 한도, 충분)
- 실패한 사진은 3회 재시도 후 스킵 + UI에 마크
- 진행률 UI: "Drive에서 사진 받는 중... 247/2,000"

#### 16.5.2 분석 (썸네일만으로)

기존 §4 분석 파이프라인 그대로. 썸네일이 400~800px이므로 얼굴 감지·임베딩·pHash·Laplacian 모두 정확도 영향 없음.

#### 16.5.3 결제 후 원본 다운로드 (ZIP 생성 직전)

```ts
async function downloadOriginalsForSelected(session: FolderSession): Promise<void> {
  const selected = [...session.photos.values()].filter(p => p.isSelected);

  for (const photo of selected) {
    if (photo.isOriginalDownloaded) continue;

    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${photo.driveFileId}?alt=media`,
      { headers: { Authorization: `Bearer ${getDriveAccessToken()}` } }
    );
    photo.originalBlob = await res.blob();
    photo.isOriginalDownloaded = true;
    emitProgress(`원본 다운로드 중... ${counter}/${selected.length}`);
  }
}
```

- 결제 사용자만 호출
- 동시 4개 (원본은 큼, 메모리 보호)
- 실패한 사진은 ZIP에서 제외 + 사용자에게 명시 + 재시도 버튼

### 16.6 메모리 관리

- 썸네일 DataURL: 갤러리 표시 후 unmount 시 `URL.revokeObjectURL`
- 원본 Blob: ZIP 생성 후 즉시 `null` 할당 + GC 유도
- IndexedDB에 원본 Blob 저장 X (디스크 부담 + 프라이버시)
- `performance.memory.usedJSHeapSize` 모니터링 (§4.4 기존 정책 동일)

### 16.7 토큰 관리

```ts
interface DriveAuthState {
  accessToken: string;
  expiresAt: number;          // epoch ms
  scope: string;
}

// 메모리만, IndexedDB·서버 X
let driveAuth: DriveAuthState | null = null;

function getDriveAccessToken(): string {
  if (!driveAuth || driveAuth.expiresAt < Date.now() + 60_000) {
    throw new Error("Drive 토큰 만료. 다시 로그인 필요");
  }
  return driveAuth.accessToken;
}
```

- 토큰 만료 1분 전부터 silent refresh 시도 (GIS의 `tokenClient.requestAccessToken({ prompt: '' })`)
- 실패 시 사용자에게 재로그인 모달

### 16.8 OAuth 동의 화면 텍스트 (개인정보처리방침)

> 이 텍스트는 Google OAuth 동의 화면에 표시되며, 출시 전 법무 검토 + Google 검수 통과 필요:

```
딸깍픽스는 다음 권한을 요청합니다:
- Google Drive 파일 보기 (읽기 전용)

요청 이유:
- 사용자가 명시적으로 선택한 폴더의 사진만 분석합니다
- 분석은 100% 사용자 브라우저 내에서 처리되며, 사진 데이터는 딸깍픽스 서버로 전송되지 않습니다
- 선별된 사진만 사용자가 다운로드 받기 위해 Google Drive에서 가져옵니다
- 사용자 세션 종료 시 모든 임시 토큰이 삭제됩니다
```

### 16.9 UI 변경 사항

#### FolderUpload.tsx (Flow B/C)
- 기존 드롭존 위에 **"Google Drive에서 가져오기"** 버튼 추가 (PrimaryButton 옆 SecondaryButton)
- 클릭 시 §16.4 흐름
- Drive 폴더 선택 후 동일한 폴더 카드 UI에 합류 (이벤트 태그 / 목표 장수 설정)
- 폴더 카드에 **출처 배지** 표시: 🖥 컴퓨터 / ☁️ Drive

#### Upload.tsx (Flow A)
- 동일하게 "Google Drive에서 가져오기" 버튼 추가

#### FolderGallery.tsx
- 사진 카드에 출처 배지 미니 아이콘 (호버 시 폴더 경로 표시)
- 분석 진행률에 "Drive에서 받는 중" 단계 추가

#### Paywall.tsx
- 결제 완료 후 자동으로 §16.5.3 원본 다운로드 시작
- 진행률 표시 ("원본 다운로드 중... 47/132") + ZIP 압축 단계로 자동 전환

### 16.10 에러 처리

| 케이스 | 처리 |
|--------|------|
| Drive 토큰 만료 | 사용자에게 재로그인 모달, 분석 일시 중단·재개 |
| Drive API 429 (할당량 초과) | 60초 대기 후 자동 재시도 (지수 백오프) |
| 폴더 안에 image/* 0개 | 폴더 분석 스킵 + 사용자에게 알림 |
| 단일 파일 다운로드 실패 (5xx) | 3회 재시도 후 스킵, ZIP에서 제외 |
| Picker 닫기 (선택 X) | 아무 동작 없음 (이전 화면 유지) |
| 권한 거부 | "Drive 권한 없이는 이 기능을 사용할 수 없어요" 안내 + 컴퓨터 폴더 폴백 |

### 16.11 v3.0 MVP에서 미처리 (v3.1+ 검토)

- **중첩 폴더 (nested folders):** 만삭/2026/원본/IMG_xxx 같은 깊은 구조는 v3.0에서 한 단계만 읽음. v3.1에서 재귀 옵션
- **공유 드라이브 (Shared Drives):** 개인 Drive만 v3.0 지원. v3.1에서 검토
- **OneDrive·Dropbox:** v3.5+에서 검토 (Google Drive가 한국 시장에서 가장 흔함)

### 16.12 정확도·성능 영향

- **셀렉 정확도:** 영향 없음 (썸네일 800px는 분석에 충분)
- **분석 시간:** 1,500장 기준 +1~2분 (썸네일 다운로드)
- **결제 후 ZIP 생성:** 선별 132장 기준 +2~3분 (원본 다운로드)
- **메모리:** 썸네일은 기존 정책과 동일, 원본 Blob은 ZIP 생성 직전 잠시 메모리 점유 후 즉시 해제

---

## 17. UX 강제 사양 (PRD §6.B 구현 가이드)

> **PRD §6.B의 토스식 UX 원칙을 코드 레벨에서 강제하기 위한 컴포넌트·테스트·CI 가이드.**

### 17.1 디자인 토큰 + 강제 컴포넌트

```ts
// src/ui/PrimaryButton.tsx — 메인 CTA 전용. 한 화면 1개만 사용.
// 위반 감지: 한 페이지 컴포넌트 트리에 PrimaryButton이 2개 이상 → ESLint 룰 에러

interface PrimaryButtonProps {
  label: string;        // 마이크로카피 5원칙 따름 (§17.3)
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "default" | "danger";  // danger는 거의 안 씀
}

// 강제 스타일:
//   - height: 56px
//   - width: 100% (또는 부모의 80%+)
//   - font-size: 17px, weight: 700
//   - background: var(--color-primary)
//   - border-radius: 12px
```

```ts
// src/ui/SecondaryButton.tsx, TextLink.tsx — 보조 액션 전용
// 강제 스타일:
//   SecondaryButton: outline, height 44px, 작음
//   TextLink: 텍스트만, 밑줄 호버 시
```

### 17.2 화면별 메인 CTA 명세

| 화면 | 메인 CTA 라벨 | 보조 |
|------|---------------|------|
| Landing | "사진만 셀렉" / "스튜디오용 셀렉" 카드 (실질 메인 = 카드) | 없음 |
| StudioTypeSelect | 카드 2개 ("셀렉용 폴더 있어요" / "사진만 있어요") | 없음 |
| FolderUpload | "분석 시작 ({총}장, 약 {시간})" | "폴더 더 추가" (TextLink) |
| Analysis | (자동 진행, 버튼 없음) | "취소" (TextLink, 작게) |
| PersonSelect | "이 인물 중심으로 골라줘 ({선택수}명)" | "건너뛰기" (TextLink) |
| Gallery | "ZIP 다운로드 ({장수}장)" | "재추출" (SecondaryButton) |
| Paywall | "₩4,900 결제하기" (큰 버튼) | "₩15,000 패키지 보기" (SecondaryButton) |
| PaymentResult (성공) | "ZIP 다운로드" | "갤러리로 돌아가기" (TextLink) |

### 17.3 마이크로카피 검증 (CI 룰)

```
src/messages/ko.json 의 모든 키에 다음 룰 자동 검사:
- 의문문 ('?'로 끝남) 비율 ≤ 10% (대부분 단언문이어야 함)
- "주세요/하세요/해주세요" 어미 사용 시 결과 약속 동반 ("→ N분 안에 끝나요")
- 에러 메시지에 해결책 동반 (정규식: 에러 키 + "다시" or "해결" or "방법" 포함)
```

### 17.4 인지 부하 자동 측정

```
e2e 테스트 (Playwright):
  test("랜딩 → ZIP 다운까지 클릭 ≤ 5회", async () => {
    // 시뮬레이션 시나리오로 클릭 카운트
    // 5회 초과 시 fail
  });
  test("새 사용자 첫 분석 완료까지 도움말 텍스트 노출 0회", ...);
```

### 17.5 비주얼 회귀 테스트

- Storybook + Chromatic 또는 Percy
- PrimaryButton·SecondaryButton·결제 버튼·결과 카드 등 핵심 컴포넌트 픽셀 단위 비교
- PR마다 실행, diff 5px+ 시 사람 승인 필요

### 17.6 광고 위치 강제 검증

```
e2e 테스트:
  test("결제 페이월 화면에 광고 노출 없음", ...);
  test("분석 결과 카드 위에 광고 없음", ...);
  test("인물 카드 위에 광고 없음", ...);
```

### 17.7 토스식 UX 위반 자동 감지

```
ESLint 커스텀 룰 (예시):
- one-primary-button-per-screen: 페이지 컴포넌트에 PrimaryButton 2개 이상 → 에러
- no-cta-question-mark: PrimaryButton.label 끝이 ? → 경고
- micro-copy-from-i18n: PrimaryButton.label은 t("...") 호출만 허용 (하드코딩 금지)
```

---

## 18. 부록: 알고리즘 의사코드

### 18.1 isLaughingSquint 판정

```ts
function isLaughingSquint(face: FaceFeature): boolean {
  const ear = (face.earLeft + face.earRight) / 2;
  if (ear >= 0.20) return false;        // 눈 떴음
  if (ear < 0.15) {
    return face.marInner >= 0.40
        && face.mouthCornerAngle >= 12
        && face.cheekRise >= 0.4;
  }
  // 0.15 <= ear < 0.20
  return face.marInner >= 0.35 && face.mouthCornerAngle >= 8;
}
```

### 18.2 calculateEyeOpenScore

```ts
function calculateEyeOpenScore(face: FaceFeature, basePersonEar: number): number {
  const ear = (face.earLeft + face.earRight) / 2;
  const adaptiveThreshold = Math.max(0.15, basePersonEar * 0.7);

  if (ear >= 0.20) return 1.0;
  if (ear >= adaptiveThreshold) return 0.8;

  if (isLaughingSquint(face)) {
    return 0.85;  // 웃어서 감김 → 거의 만점
  }

  if (ear < 0.10) return 0.0;            // 완전히 감음
  return 0.3;                             // 어중간
}
```

### 18.3 calculateFaceSharpness

```ts
function calculateFaceSharpness(
  imageData: ImageData,
  primaryFaceBbox: BBox
): number {
  // bbox 확장: 가로 1.5배, 세로 1.8배
  const expanded = expandBbox(primaryFaceBbox, 1.5, 1.8);
  const cropped = cropImageData(imageData, expanded);
  const gray = toGrayscale(cropped);

  const faceLap = laplacianVariance(gray);

  // 어깨~상반신 영역 (얼굴 아래 1.5배)
  const shoulderBbox = shoulderRegion(primaryFaceBbox);
  const shoulderCrop = cropImageData(imageData, shoulderBbox);
  const shoulderLap = laplacianVariance(toGrayscale(shoulderCrop));

  return faceLap + 0.4 * shoulderLap;
}
```

### 18.4 detectIntentionalBokeh

```ts
function isIntentionalBokeh(
  faceSharpness: number,
  globalSharpness: number
): boolean {
  return faceSharpness >= 120 && globalSharpness < faceSharpness * 0.5;
}
```

### 18.5 outfitSig 계산

```ts
function calculateOutfitSig(
  imageData: ImageData,
  primaryFaceBbox: BBox
): string {
  const torsoRegion = expandBbox(primaryFaceBbox, 1.5, 2.5);
  const torsoCrop = cropImageData(imageData, torsoRegion);
  const torsoHist = hsvHistogram(torsoCrop, [8, 8, 1]);  // 64 bin

  const backgroundCrop = invertCrop(imageData, primaryFaceBbox);
  const bgHist = hsvHistogram(backgroundCrop, [8, 8, 1]);

  const concat = new Float32Array([...torsoHist, ...bgHist]);
  return simHash64(concat).toString(16);
}
```

### 18.6 인물 클러스터링 — 온라인 증분식

```ts
function clusterFace(
  embedding: Float32Array,
  clusters: PersonCluster[],
  threshold: number
): { clusterId: string; isNew: boolean } {
  if (clusters.length === 0) {
    const newId = generateId();
    clusters.push(makeCluster(newId, embedding));
    return { clusterId: newId, isNew: true };
  }

  let bestSim = -Infinity;
  let bestCluster: PersonCluster | null = null;
  for (const c of clusters) {
    const sim = cosineSimilarity(embedding, c.centroid);
    if (sim > bestSim) {
      bestSim = sim;
      bestCluster = c;
    }
  }

  if (bestSim >= threshold && bestCluster) {
    const alpha = bestCluster.faceCount < 5 ? 0.7 : 0.9;
    bestCluster.centroid = l2Normalize(
      addWeighted(bestCluster.centroid, embedding, alpha, 1 - alpha)
    );
    bestCluster.faceCount++;
    return { clusterId: bestCluster.id, isNew: false };
  }

  const newId = generateId();
  clusters.push(makeCluster(newId, embedding));
  return { clusterId: newId, isNew: true };
}
```

### 18.7 카메라 응시 추정

```ts
function estimateGaze(face: FaceFeature, irisL: Point, irisR: Point): {
  isLookingAtCamera: boolean;
  confidence: number;
} {
  const eyeCenterL = avgPoints(face.landmarks!.leftEyeOutline);
  const eyeCenterR = avgPoints(face.landmarks!.rightEyeOutline);
  const eyeWidthL = eyeWidth(face.landmarks!.leftEyeOutline);
  const eyeWidthR = eyeWidth(face.landmarks!.rightEyeOutline);

  const offL = subPoints(irisL, eyeCenterL);
  offL.x /= eyeWidthL; offL.y /= eyeWidthL;
  const offR = subPoints(irisR, eyeCenterR);
  offR.x /= eyeWidthR; offR.y /= eyeWidthR;
  const avgOff = { x: (offL.x + offR.x) / 2, y: (offL.y + offR.y) / 2 };

  const gazeError =
    Math.abs(avgOff.x) +
    Math.abs(avgOff.y) * 0.7 +
    Math.abs(face.yaw) / 30 +
    Math.abs(face.pitch) / 30;

  const isLookingAtCamera =
    gazeError < 0.4 && Math.abs(face.yaw) < 15 && Math.abs(face.pitch) < 12;
  const confidence = 1 - Math.min(1, gazeError / 0.8);
  return { isLookingAtCamera, confidence };
}
```

### 18.8 heroBonus 계산

```ts
function calcHeroBonus(
  photo: PhotoEntry,
  config: HeroConfig,
  clusters: Map<string, PersonCluster>
): { matchKind: HeroMatchKind; bonus: number } {
  const matchKind = classifyHeroMatch(photo, config);  // §3.9.2

  let bonus = 0;
  if (matchKind === "all") bonus += 25;
  else if (matchKind === "any") bonus += 15;
  else if (matchKind === "none") bonus -= 10;

  // 면적/응시/중앙
  const heroes = config.selectedPersonIds;
  for (const f of photo.faces) {
    if (!f.personId || !heroes.includes(f.personId)) continue;
    const area = f.bbox.w * f.bbox.h;
    if (area >= 0.10) bonus += 5;
    if (f.isLookingAtCamera) bonus += 5;
    const cx = f.bbox.x + f.bbox.w / 2;
    const cy = f.bbox.y + f.bbox.h / 2;
    if (Math.abs(cx - 0.5) < 0.2 && Math.abs(cy - 0.5) < 0.2) bonus += 3;
    break; // 주인공 1명에 대해서만 가산
  }

  bonus = Math.max(-10, Math.min(25, bonus));
  return { matchKind, bonus };
}
```

### 18.9 selectBest 비례 할당

```ts
function selectBest(
  candidates: PhotoEntry[],   // HARD_OUT 제외, 그룹별 베스트만
  targetCount: number,
  scenes: Map<string, PhotoEntry[]>,
  heroConfig: HeroConfig       // §3.9 — 비주인공 보장 적용
): PhotoEntry[] {
  // 1. 주인공 미등장 컷 분리 (§3.9.4)
  const guaranteed = heroConfig.guaranteeNonHeroCount;
  const heroAbsent = candidates.filter((p) => p.heroMatchKind === "none");
  const heroPresent = candidates.filter((p) => p.heroMatchKind !== "none");

  const heroAllocCount = Math.max(0, targetCount - guaranteed);
  const total = heroPresent.length;
  const allocations = new Map<string, number>();

  // 2. 주인공 등장 후보 → 씬별 비례 할당
  const presentScenes = new Map<string, PhotoEntry[]>();
  for (const [sceneId, photos] of scenes) {
    const filtered = photos.filter((p) => p.heroMatchKind !== "none");
    if (filtered.length > 0) presentScenes.set(sceneId, filtered);
  }
  for (const [sceneId, photos] of presentScenes) {
    const ratio = photos.length / total;
    allocations.set(sceneId, Math.round(heroAllocCount * ratio));
  }

  // 합계 보정 (rounding 차이) — 큰 씬에서 +1/-1 조정 (생략)

  // 3. 씬별 상위 N장 선정
  const selected: PhotoEntry[] = [];
  for (const [sceneId, alloc] of allocations) {
    const photos = presentScenes.get(sceneId)!;
    photos.sort((a, b) => b.finalScore - a.finalScore);
    selected.push(...photos.slice(0, alloc));
  }

  // 4. 주인공 미등장 컷에서 점수 상위 guaranteed 장 보장
  heroAbsent.sort((a, b) => b.finalScore - a.finalScore);
  const guaranteedPicks = heroAbsent.slice(0, guaranteed).map((p) => {
    p.heroMatchKind = "non_hero_guaranteed";
    return p;
  });
  selected.push(...guaranteedPicks);

  // 5. 부족 시 일반 후보로 채움
  while (selected.length < targetCount) {
    const remaining = candidates
      .filter((p) => !selected.includes(p))
      .sort((a, b) => b.finalScore - a.finalScore);
    if (remaining.length === 0) break;
    selected.push(remaining[0]);
  }

  // 6. userOverride 반영
  for (const p of candidates) {
    if (p.userOverride === "force_in" && !selected.includes(p)) {
      selected.push(p);
    }
    if (p.userOverride === "force_out") {
      const idx = selected.indexOf(p);
      if (idx >= 0) selected.splice(idx, 1);
    }
  }

  return selected;
}
```

---

## 부록 A — Claude Code 작업 시작 가이드

### A.1 권장 첫 스프린트 (3주, 인물 기능 포함)

1. **Day 1-2:** §3 (B급 정의) 알고리즘을 v0.2.x `scorer.ts`/`laplacian.ts` 기반으로 재구현
2. **Day 3-4:** isLaughingSquint, faceSharpness, isIntentionalBokeh 단위 테스트 작성 + 실 데이터로 검증
3. **Day 5-6:** outfitSig 계산 + 의상 변화 감지 로직 추가
4. **Day 7-9:** **인물 임베딩 모델 통합 + §3.7 클러스터링 + 폴더 간 병합**
5. **Day 10-11:** **§3.8 카메라 응시 추정 + §3.9 heroBonus 알고리즘**
6. **Day 12-13:** **PersonSelect 화면 (인물 카드 + AND/OR 토글 + 비주인공 보장 토글) + AppStep 통합**
7. **Day 14-15:** 분석 스토리텔링(F6) UI 추가 + 인물 단계 메시지 포함
8. **Day 16-17:** 결제 백엔드 API 골격 + 카카오페이 sandbox 연동
9. **Day 18-19:** 워터마크 합성 (Canvas + Web Worker) + 50장 제한
10. **Day 20-21:** 광고 슬롯 3개 + 무료/유료 상태 전환 + 통합 QA

### A.2 마이그레이션 시 주의

- 기존 `src/lib/scorer.ts`의 점수 계산 로직은 **유지하되 §3 신호 추가** (eyeOpen에 isLaughingSquint 반영)
- 기존 `src/lib/types.ts`의 PhotoEntry는 **필드 추가만**, 기존 필드명 변경 X
- 기존 v0.2.x Flow A/B/C는 **그대로 유지**, paywall step만 신규 추가
- Zustand `useStore` 셀렉터 룰은 절대 깨면 안 됨 (React Error #185)

### A.3 첫 PR 권장 분리 단위

```
PR 1: docs/v3-plan/* (이 문서 세트 자체 커밋, 기록 보존용)
PR 2: types.ts 신규 필드 추가 (PaymentSession, ClientPaymentState, PersonCluster, HeroConfig 등)
PR 3: §3 알고리즘 재구현 (scorer/laplacian/eye)
PR 4: 인물 임베딩 + §3.7 클러스터링 + 폴더 간 병합
PR 5: §3.8 응시 추정 + §3.9 heroBonus + selectBest 보강
PR 6: PersonSelect 화면 + AppStep 라우팅
PR 7: 분석 스토리텔링 UI + 인물 단계 메시지
PR 8: 결제 백엔드 골격 + sandbox 연동
PR 9: 워터마크 + 50장 제한
PR 10: 광고 슬롯 (모든 화면, 비침해 디자인) + 비노출 토글
PR 11: F19 파일명 가림 (displayName 생성 + UI 적용 + ZIP 가명 분기)
PR 12: F20 토스식 UX 강제 (PrimaryButton 컴포넌트 + ESLint 룰 + 마이크로카피 검증)
PR 13: §14.0 정확도 게이트 자동 측정 스크립트 + 검증셋 storage 구조
PR 14: F22 라벨링 협업 시스템 (라벨러 초대·UI·합의 알고리즘·라벨러 인증)
PR 15: F21 어드민 페이지 (MVP 최소 기능 — 대시보드/결제/계정/쿠폰/감사로그/비상토글/라벨링관리)
PR 16: F23 Google Drive 폴더 연동 (FolderUpload·Upload 화면 확장 + 썸네일/원본 단계화 다운로드)
PR 17: 통합 회귀 테스트 + 베타 출시
```

---

**END OF TECH_SPEC v3.0-draft**
