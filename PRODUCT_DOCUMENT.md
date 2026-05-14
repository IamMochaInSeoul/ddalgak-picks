# 딸깍픽스 (ddalgak-picks) — 전체 제품 문서

> **작성 기준일:** 2026-05-13  
> **현재 배포 버전:** v0.5.4-stable  
> **배포 URL:** https://ddalgak-picks.vercel.app  
> **GitHub:** https://github.com/IamMochaInSeoul/ddalgak-picks  
> **Vercel 프로젝트:** `prj_5Z0q2wFkjWQgNnoHzwH9r3bdP1Gd`

---

## 목차

1. [제품 개요](#1-제품-개요)
2. [기획 단계](#2-기획-단계)
3. [기술 아키텍처](#3-기술-아키텍처)
4. [디자인 철학](#4-디자인-철학)
5. [UX 플로우](#5-ux-플로우)
6. [버전별 개발 이력](#6-버전별-개발-이력)
7. [현재 구현 기능 전체 목록](#7-현재-구현-기능-전체-목록)
8. [파일 구조](#8-파일-구조)
9. [비즈니스 모델](#9-비즈니스-모델)
10. [보안 이력](#10-보안-이력)
11. [환경변수 현황](#11-환경변수-현황)
12. [대기 중인 작업 (로드맵)](#12-대기-중인-작업-로드맵)
13. [운영 규칙 및 기술 제약](#13-운영-규칙-및-기술-제약)

---

## 1. 제품 개요

### 한 문장 정의
수백~수천 장 사진에서 **폴더 구조를 유지한 채** AI가 베스트컷만 골라 ZIP으로 돌려주는 100% 브라우저 앱.

### 핵심 문제 (JTBD)
> "스튜디오가 준 폴더 구조(만삭/베이비본/100일/돌) 그대로, 각 폴더에서 베스트 N장씩 셀렉해서, **똑같은 폴더 구조로** ZIP 돌려보내기 — 3시간 작업을 10분으로."

### 주요 타겟

| 구분 | 대상 |
|------|------|
| **메인** | 스튜디오 원본 앨범을 받아 셀렉 후 다시 스튜디오에 보내야 하는 신혼부부·육아맘·반려동물 부모 |
| **보조** | 여행·일상·돌잔치 사진 중 S급만 추리고 싶은 일반 유저 |

### 핵심 차별점 (6가지)

1. **폴더 구조 유지 셀렉** — 경쟁사가 못하는 본질적 차별점
2. **이벤트 자동 태깅** — 폴더명에서 만삭/베이비본/100일/돌 자동 분류 + 태그별 추천 장수 자동 적용
3. **과거 셀렉 기억하는 AI** — pHash 지문 이력으로 이전 세션 중복 사진 자동 감지 및 배지 표시
4. **B급 정밀화** — 활짝 웃음(눈감음 아님) vs 진짜 눈감음 / 인물 아웃포커싱 vs 흔들림 구분
5. **인물 자동 클러스터링 + 주인공 선택** — 얼굴 임베딩 100% 브라우저 내 처리. "〈아기 지유〉 중심 셀렉"
6. **100% 브라우저 처리** — 사진이 서버에 전송되지 않음 (프라이버시 신뢰 포인트)

---

## 2. 기획 단계

### 2-1. 제품 방향 확정 (2026-04-23)

초기 기획은 "다양한 기능을 갖춘 AI 사진 도구"로 시작했으나, 전략 리뷰를 통해 핵심을 좁혔다:

1. Flow B("폴더 구조 유지 셀렉")를 제품의 본질로 정의
2. Google Drive 폴더를 로컬 폴더와 동등한 주 입력 소스로 취급
3. 사용자가 생각할 것을 줄이고, 시스템이 먼저 추천하는 UI 설계
4. 기능 수보다 **"선택 결과에 대한 심리적 만족감"** 우선

### 2-2. Phase 1 기획서 완성 (2026-04-29, `PHASE1_PLAN.md`)

Phase 1 기능 우선순위 확정:

| 순서 | 항목 | 구현 비용 | 임팩트 |
|------|------|----------|--------|
| 1 | 사진 상세 확인 모달 (NOTES 톤) | 중 | 매우 큼 — 사용자 명시 요청 |
| 2 | 분석 로딩 스토리텔링 (실수치 카운터) | 작음 | 큼 — 신뢰 형성 |
| 3 | 취향 학습 영속화 | 중 | 큼 — 재방문 직결 |
| 4 | ZIP UX 개선 (진행률 + 24h 재다운로드) | 작음 | 중 |
| 5 | 온보딩 1-step 모달 | 작음 | 중 — 신규 전환 |
| 6 | 재방문 배너 + 단골 인지 | 작음 | 중 — 리텐션 |
| 7 | GA4 이벤트 인스트루먼테이션 | 작음 | 측정용 |
| 8 | 워터마크 + 결제 게이트 | 중 | 큼 — 매출 직결 |

### 2-3. Phase 1 성공 기준 (KPI)

| 지표 | 목표 |
|------|------|
| 분석 완료 → ZIP 다운로드 전환율 | **60%** (베이스라인 추정 30%) |
| 7일 재방문률 | **25%** (베이스라인 5~10%) |
| ZIP 시도 → 결제 완료 전환율 | **8%** (결제 활성화 후) |
| 평균 세션 시간 | 분석~ZIP **15분 이내** |

---

## 3. 기술 아키텍처

### 3-1. 기술 스택

| 레이어 | 기술 |
|--------|------|
| 빌드 도구 | Vite 5 |
| UI 프레임워크 | React 18 + TypeScript |
| 상태 관리 | Zustand 5 |
| AI/ML (얼굴 감지) | MediaPipe tasks-vision@0.10.34 |
| AI/ML (얼굴 임베딩) | face-api.js (WebAssembly, 브라우저 전용) |
| 압축 | JSZip (`generateAsync` 진행률 콜백) |
| 로컬 저장소 | IndexedDB (4개 스토어) + OPFS |
| 국제화 | 자체 구현 (ko.json / en.json) |
| 배포 | Vercel 정적 배포 |
| 결제 | PortOne V2 (현재 비활성) |
| 결제 검증 백엔드 | Supabase Edge Functions (Deno, 배포 완료·비활성) |
| 광고 | Google AdSense (재심사 대기) |

### 3-2. IndexedDB 스토어 목록

| 스토어 이름 | 용도 | TTL |
|-------------|------|-----|
| `ddalgak-dedupe` | pHash 지문 이력 (중복 제거) | 영구 |
| `ddalgak-session` | 세션 자동저장 (갤러리 상태) | 24h |
| `ddalgak-zip-cache` | ZIP Blob 재다운로드 캐시 | 24h |
| `ddalgak-profile` | 닉네임·sessionCount·heroPersonNames | 영구 |

### 3-3. OPFS 사용처

`src/lib/opfsStore.ts` — FolderSession 원본 Blob을 OPFS에 저장. 새로고침/재방문 후에도 폴더 세션 복원 가능.

### 3-4. AI 분석 파이프라인

```
입력 파일 N장
  └→ [1] 썸네일 생성 (400px JPEG)
  └→ [2] pHash 계산
            └→ 연사 그룹핑 (Hamming ≤ 10)
            └→ 씬 클러스터링 (Hamming ≤ 22)
  └→ [3] 얼굴 감지 (FaceLandmarker×4 + BlazeFace — 5단계)
  └→ [4] B급 정밀화
            └→ EAR 시계열 + 뺨 융기 → 웃음/눈감음 구분
            └→ 얼굴 영역 Laplacian → 인물 아웃포커싱 보호
            └→ BLUR_NOISE 분류 (저조도 노이즈 별도 처리)
  └→ [5] 얼굴 임베딩 (face-api.js, WebAssembly)
  └→ [6] 인물 클러스터링
            └→ 온라인 증분 클러스터링 (코사인 유사도)
            └→ 폴더 간 헝가리안 매칭 통합 (성장앨범)
  └→ [7] 응시 추정 (iris landmark → 카메라 응시 여부)
  └→ [8] 채점 + heroBonus 적용
  └→ [9] 씬 비례 그리디 선별 (maxPerGroup 적용)
  └→ 출력: PhotoEntry[] + PhotoGroup[] + PersonCluster[]
```

### 3-5. 채점 가중치

**인물 모드:**
- eyeOpen: 35% / sharpness: 30% / expression: 20% / facing: 15%

**heroBonus (clamp −10 ~ +25):**
- AND 모드 모두 등장: +25 / OR 모드 한 명: +15 / 미등장: −10
- 면적 ≥10%: +5 / 카메라 응시: +5 / 중앙 ±20%: +3

**반려동물 모드:**
- sharpness: 55% / position: 30% / eyeEstimate: 15%

### 3-6. 감점 코드 (DeductionCode)

| 코드 | 의미 | 감점 여부 |
|------|------|-----------|
| `EYE_CLOSED` | 눈 감음 | 감점 |
| `BLUR` | 흔들림 | 감점 |
| `SIDE_FACE` | 옆모습 | 감점 |
| `EYE_REGION_DARK` | 눈 어두움 | 감점 |
| `LOW_CONFIDENCE` | 저신뢰 | 감점 |
| `NO_SUBJECT` | 피사체 없음 | 감점 |
| `EYE_SQUINT_SMILE` | 웃음으로 가는 눈 | **감점 없음** |
| `BLUR_AESTHETIC_BOKEH` | 인물 아웃포커싱 | **감점 없음** |
| `BLUR_NOISE` | 저조도 노이즈 | 경미한 감점 |

---

## 4. 디자인 철학

### 4-1. 핵심 컨셉 — "다크룸의 큐레이터"

> **"AI 도구가 아니라 디지털 큐레이터처럼 보이게."**
> 사용자는 자신이 사진을 고른 게 아니라, "안목 있는 전문가가 골라준 결과를 검토하는 중"이라고 느껴야 한다.

### 4-2. 비주얼 토큰

| 토큰 | 값 | 용도 |
|------|-----|------|
| `--bg-base` | `#0E0D0B` | 메인 배경 |
| `--bg-elevated` | `#16140F` | 카드/패널 |
| `--text-primary` | `#F2EDE3` | 본문 |
| `--text-secondary` | `#C5BBA5` | 보조 정보 |
| `--accent` | `#2D4356` | 잉크 블루 (v0.5.2.2에서 골드 → 네이비로 교체) |
| `--font-sans` | Pretendard | UI 기본 폰트 |
| `--font-display` | — | **사용 금지** (v0.5.2.1 §9-5 정책으로 폐지) |
| `--font-mono` | JetBrains Mono | 수치·메타데이터 |

### 4-3. 카피 원칙

- **이모지·느낌표 0개** — 큐레이터 노트 톤 유지
- **코드 내 한국어 하드코딩 금지** — `messages/ko.json` 한 곳에서 관리
- **AI 마케팅 금지어** — "AI가 알아서", "완벽한", "최고의" 등 금지
- 폰트 정책 §9-5: `var(--font-sans)`, fontWeight 800, fontStyle "normal" 고정

### 4-4. 참조 레퍼런스

닮을 곳: Adobe Lightroom, Capture One, Magnum Photos, MoMA 웹사이트, Linear, Things 3  
피할 것: Notion/Slack 카드 톤, Duolingo 일러스트, 이모지 헤더, Airbnb 둥근 카드+그림자

---

## 5. UX 플로우

### 5-1. 전체 플로우 맵

```
Landing (2카드)
│
├── [사진만 셀렉] ──────────────────────────────────────────────────────────────
│    돌잔치·여행·일상                                                          
│    └→ TypeSelect (인물 / 반려동물 / 혼합)                                   
│         └→ Upload (파일 선택 or Google Drive)                               
│              └→ Analysis (스토리텔링 로딩)                                  
│                   └→ [PersonSelect — VITE_FEATURE_PERSON_CLUSTERING ON 시]  
│                        └→ Gallery                                           
│                             ├→ 3탭 (선택됨 / 제외됨 / 전체)                
│                             ├→ PhotoDetailModal (NOTES 스코어)              
│                             ├→ GroupCompareModal (유사컷 비교)              
│                             ├→ FeedbackMode (취향 재추출)                   
│                             └→ ZIP 다운로드 (24h 재다운로드 캐시)           
│
└── [스튜디오용 셀렉] ───────────────────────────────────────────────────────────
     스튜디오·웨딩·돌스냅
     └→ StudioTypeSelect
          ├── [셀렉용 폴더 있어요] — Flow B
          │    └→ FolderUpload (다중 폴더 드래그앤드롭 or Drive)
          │         └→ 폴더별 순차 분석 (MediaPipe 메모리 충돌 방지)
          │              └→ [PersonSelect]
          │                   └→ FolderGallery
          │                        ├→ 폴더별 탭 + 3탭 갤러리
          │                        ├→ PhotoDetailModal
          │                        ├→ ZIP (폴더 구조 보존)
          │                        └→ 앨범 배치하기 → AlbumContainer
          │
          └── [사진만 있어요] — Flow C
               └→ FolderUpload → 분석 → PersonSelect → FolderGallery → ZIP
```

### 5-2. 특수 진입 경로

- **세션 복구 배너** — 재방문 시 24h 이내 미완료 세션 감지 → "이어서 작업하기" 버튼
- **OPFS 복원 카드** — Landing에 미완료 폴더 세션 목록 인라인 표시 → "이어서 하기"
- **NicknameCaptureModal** — 첫 ZIP 다운로드 시 1회 닉네임 입력 권유
- **OnboardingModal** — 첫 방문 시 1-step 안내 (localStorage `ddalgak-onboarded-at` 기준)
- **PaymentGate** — `VITE_FEATURE_PAYMENT=true` 시 freeZipLimit 초과 ZIP 요청에서 진입

---

## 6. 버전별 개발 이력

### v0.1.x — 초기 MVP ✅ 배포됨

**구현 내용:**
- 사진 업로드 + AI 분석 + 베스트컷 선별 (Flow A 원형)
- 취향 재추출 — FeedbackMode 카드 스와이프 20장 → 가중치 조정 → 재선별 (in-session)
- 세션 지속성 — beforeunload 경고 + IndexedDB 자동저장 (24h TTL) + 재방문 복구
- 앨범 기능 (AlbumContainer) — 템플릿 폴더 + 촬영 세션 → 슬롯 자동 배치 → ZIP
- v0.1.1 태그 존재

---

### v0.2.x — Flow B/C 신규 + 랜딩 재설계 ✅ 배포됨

**구현 내용:**
- **FolderUpload** — FileSystemEntry 재귀 기반 다중 폴더 드래그앤드롭, 이벤트 태그 자동/수동, 목표 장수 프리셋
- **FolderGallery** — 폴더별 탭 UI + 선택/제외/전체 3탭 + 감점 사유 한국어 배지
- **StudioTypeSelect** — "셀렉용 폴더 있어요 / 사진만 있어요" 분기 화면
- **Landing 2카드** — "사진만 셀렉" / "스튜디오용 셀렉"
- SEO 최적화 — title, description, OG 태그, `<noscript>` 한국어 크롤러 콘텐츠

---

### v0.3.x — 중복제거 + Drive + 보안 체계 ✅ 배포됨 (`v0.3.1-stable`)

**구현 내용:**
- **pastSelectionStore** — IndexedDB `ddalgak-dedupe`. pHash(BigInt→string) + filename + sessionId 저장 (원본 픽셀 미저장)
- **dedupe.ts** — `findPastDupes()` Hamming≤8 매칭 → 🔁 이전 배지
- **Flow C 폴백** — AlbumContainer 파싱 실패 시 FolderGallery 자동 전환
- **Google Drive 백그라운드 다운로드** — 비블로킹 큐 + `DriveDownloadBanner` (전 화면 플로팅)
- **브라우저 알림** — 다운로드 완료 시 Notification API 권유
- **AdSense** — `public/ads.txt` 배포 완료 (재심사 대기)
- **개인정보처리방침** — `/privacy` 페이지 (`vercel.json` rewrite)
- **보안 절차 확립** — `PRE_PUSH_SECURITY_CHECKLIST.md` 8단계 게이트 + `SECURITY.md`

**보안 사고 (2026-04-29):**
- `git add -f dist/` 포함 커밋 → GitHub 공개 저장소에 `VITE_GOOGLE_API_KEY` 노출
- 즉시 GitGuardian 알림 → 기존 키 삭제·신규 발급·도메인 제한·Vercel 환경변수 교체
- 재발 방지: `dist/` 커밋 절대 금지 정책 확립

---

### v0.4.0 — Stage A · 큐레이터 톤 디자인 ✅ 배포됨 (`v0.4.0-stable`)

**구현 내용:**
- **디자인 토큰** (`globals.css`) — 다크 배경, 액센트 골드, 따뜻한 오프화이트 텍스트
- **세리프 디스플레이** (Spectral + Noto Serif KR) + JetBrains Mono 수치 폰트
- **Display / MonoNumber 컴포넌트** — 큰 헤드라인·수치 전용 컴포넌트
- **이모지·느낌표 일괄 제거** — `messages/ko.json` 큐레이터 톤 카피 리라이트
- 분석 로딩 스토리텔링 — `onProgress(stage, payload)` 콜백 + 단계별 카운터 표

---

### v0.4.1 — Stage B · 누락 기능 보완 ✅ 배포됨 (`v0.4.1-stable`)

**구현 내용:**

**F20 — 토스식 직관 UX 강제:**
- `PrimaryButton.tsx` — 화면당 1개 룰, 액센트 컬러
- `SecondaryButton.tsx` — 보더만, 채움 없음
- `TextLink.tsx` — secondary 색상 + 호버 밑줄

**F3 강화 — 폴더별 추천 장수:**
- `recommendedCount.ts` — 이벤트 태그별 추천 (만삭=10/신생아=15/100일=30/돌=50/웨딩=80)
- 폴더 카드 추천 장수 자동 적용 + 전체 합계 실시간 표시

**F4 강화 — B급 정밀화:**
- 감점 코드 신규: `EYE_SQUINT_SMILE`, `BLUR_AESTHETIC_BOKEH`, `BLUR_NOISE`
- `eye.ts` — EAR 시계열 + 입꼬리 각도 + 뺨 융기로 활짝 웃음 분류
- 얼굴 영역 Laplacian만 검사하여 인물 아웃포커싱 보호

**F5 강화 — 유사컷 그룹 비교 모달:**
- `GroupCompareModal.tsx` — 유사 컷 5장 격자 비교 + 베스트 교체
- `sceneChange.ts` — 의상·배경 변화 감지 (색 히스토그램 + 픽셀 영역 변화율)

**닉네임 캡처 + 호명:**
- `NicknameCaptureModal.tsx` — 첫 ZIP 다운로드 시점 1회 권유
- `UserAddress.tsx` — "민현님," 호명 5곳 자동 삽입
- `userProfile.ts` — IndexedDB 프로필 저장 + sessionCount 누적

---

### v0.5.0 — Stage C · F18 인물 클러스터링 + 주인공 선택 ✅ 배포됨 (`v0.5.0-stage-c`)

**구현 내용:**
- **faceEmbedding.ts** — face-api.js 모델 로딩 (`public/models/`) + 128차원 임베딩 생성
- **personClustering.ts** — 온라인 증분 클러스터링 + 폴더 간 헝가리안 매칭 (성장앨범 핵심)
- **gazeEstimation.ts** — iris landmark 기반 카메라 응시 추정
- **heroScore.ts** — heroBonus 알고리즘 (AND/OR 모드, clamp −10~+25)
- **PersonSelect.tsx** — 인물별 대표 카드 + AND/OR 토글 + 이름 직접 입력
- **이름 영속화** — `userProfile.heroPersonNames[personId]` IndexedDB → 다음 세션 자동 부여
- **결과 카피 결합** — `"민현님의 〈아기 지유〉 중심 셀렉. 80장."` 형태로 표시
- **개인정보처리방침 보강** — "얼굴 임베딩은 브라우저에서만 처리됨" 항목 추가
- **토글** — `VITE_FEATURE_PERSON_CLUSTERING` 환경변수로 on/off

---

### v0.5.1 (설계 패치) — 디자인 v2 갭 패치 ✅ 배포됨 (`v0.5.1-stable`)

`feat/design-v2-gap-patch` 브랜치. v0.5.2.x 시리즈로 이어지는 디자인 정비.

**구현 내용:**
- 액센트 컬러 골드(`#C9A961`) → **잉크 블루 `#2D4356`** 교체 (v0.5.2.2)
- Landing.tsx 갭 5건 해소 (이모지·radius20·boxShadow·translateY·accentRgb 보라)
- `.badge-high` 형광 그린 → 차분한 올리브 그린 (`#6B8B5A`)
- 폰트 정책 §9-5 — `var(--font-display)` 폐지, `var(--font-sans)` 800 표준화 (v0.5.2.1)
- 헤더 borderBottom `var(--border)` → `var(--border-subtle)` (v0.5.2.1)
- `messages/ko.json` AI 마케팅 금지어 제거
- 모바일 breakpoints + clamp 타이포 + iOS Safari safe-area + 100dvh

---

### v0.5.2 — 성능·영속·안내·가독·인물인지 ✅ 배포됨 (`v0.5.2-stable`)

`feat/perf-persist-clarity-v0.5.2` 브랜치 (PR #3). 배포 후 실사용 피드백 반영.

**구현 내용:**

| # | 항목 | 핵심 변경 |
|---|------|----------|
| 1 | Drive 다운로드 병렬화 | 직렬 for 루프 → 동시성 8개. 1,000장 약 200초 → 약 25초 |
| 2 | OPFS 세션 영속화 | `opfsStore.ts` 신규. 원본 Blob OPFS 저장 → 새로고침 후 복원 |
| 3 | 백그라운드 안내 + beforeunload + Notification | DriveDownloadBanner 카피 보강, 다운로드 중 떠나기 경고 |
| 4 | 텍스트 명도 상향 | `--text-secondary` #A39B89→#C5BBA5, `--text-tertiary` #6B6555→#8E8470 (WCAG AA) |
| 5 | F18 default-on | 환경변수 기본값 변경 (`VITE_FEATURE_PERSON_CLUSTERING !== "false"`). PersonSelect UX 강화 |

> F18은 v0.5.0에서 코드 완성됐으나 `.env.example` 기본값이 `false`라 **배포 환경에서 한 번도 노출되지 않았던 상태**였음. 이 PR로 첫 실사용자 노출.

---

### v0.5.3 — 사진 상세 모달 (단독 PR) ✅ 배포됨 (`v0.5.3-stable`)

`feat/photo-detail-modal-v0.5.3` 브랜치 (PR #7). Flow B/C 메인 타겟 누락 해소.

**구현 내용:**

| # | 항목 |
|---|------|
| 1 | `scoreBreakdown.ts` 신규 — `buildScoreBreakdown(photo): ScoreBreakdown` |
| 2 | `PhotoDetailModal.tsx` 신규 — NOTES 톤, 모노 헤더, 분수형 SCORE, 감점/가산점 표, 그룹 베스트 점프 |
| 3 | Gallery (Flow A) — 카드 바디 클릭 = 모달, 우상단 ✕ = 즉시 토글로 인터랙션 분리 |
| 4 | FolderGallery (Flow B/C) — PhotoDetailModal 연결. **메인 타겟이 처음으로 큰 화면 상세 확인 가능** |
| 5 | 그룹 베스트 점프 — "이 그룹의 최고점은 87점 → [그 컷 보기 →]" |
| 6 | 모바일 풀스크린 슬라이드업 시트 + 키보드 단축키 (← → Space Esc + −) |

---

### v0.5.4 — 무료 베타 + Stage D1 잔여 ✅ 배포됨 (`v0.5.4-stable`)

`feat/v0.5.4-d1-rest-and-free-beta` 브랜치 (PR #8). 5개 커밋, 단일 PR.

**커밋 목록:**

| 커밋 | 내용 |
|------|------|
| `885044a` | `freeBetaConfig.ts` 신규 + Landing/Gallery/FolderGallery/AppShell/PaymentGate 카피 적용 |
| `fde49d8` | `OnboardingModal.tsx` 신규 — 첫 방문 1-step 환영 모달 |
| `02ca2ec` | `ReturningBanner.tsx` 신규 — 4단계 호명 + 단골 인지 |
| `a560795` | `zipManager.ts` 신규 — IndexedDB 24h ZIP 재다운로드 캐시 |
| `7554ca8` | `analytics.ts` 신규 — GA4 12 이벤트, PII 스크러버, 레이지 로드 |

**세부 내용:**

**freeBetaConfig.ts:**
```typescript
// VITE_FEATURE_PAYMENT=true 시 결제 활성, false 시 무료 베타
export function isFreeBeta(): boolean
export function isPaymentEnabled(): boolean
export const FREE_BETA_COPY = { badge, resultLine, downloadButton, helperLine }
export const FUTURE_PRICING = { single: 2900, monthly: 9900, retouch10: 4900 }
```

**OnboardingModal:** localStorage `ddalgak-onboarded-at` 미존재 시 첫 진입에서 노출. "다시 보지 않기" / "시작" 2버튼.

**ReturningBanner:** `loadProfile()` + `listFolderSessions()`로 4단계 메시지 분기:
1. 첫 방문자 (닉네임 없음) → 숨김
2. 재방문·첫 셀렉 전 → "어서오세요"
3. 1회 이상 셀렉 완료 → "다시 오셨군요. N번째 방문이에요."
4. 미완료 세션 있음 → "이어서 작업할 수 있어요."

**zipManager.ts (IndexedDB `ddalgak-zip-cache`):**
- `saveZip(sessionId, blob, filename)` — fire-and-forget
- `loadZip(sessionId)` — 24h TTL 초과 시 null
- `clearZip(sessionId)` / `clearExpiredZips()` — 앱 마운트 시 호출

**analytics.ts (GA4 12 이벤트):**

| 이벤트 | 발생 시점 |
|--------|----------|
| `app_open` | AppShell 마운트 (free_beta 플래그 포함) |
| `flow_select` | Landing 카드 클릭 (personal/studio) |
| `free_beta_view` | Landing 마운트 + isFreeBeta() = true |
| `zip_download_attempt` | handleExport 진입 |
| `zip_download_complete` | ZIP 생성 완료 (photo_count, size_mb) |
| `zip_redownload` | "방금 만든 ZIP 다시 받기" 클릭 |
| `photo_modal_open` | PhotoDetailModal 열림 |
| `photo_toggle` | 사진 선택/제외 토글 (action: select/deselect) |
| `reextract_start` | 재추출 시작 (attempt 횟수) |
| `onboarding_shown` | OnboardingModal 최초 표시 |
| `onboarding_dismiss` | 모달 닫기 (permanent 여부) |
| `session_restored` | 세션 복구 배너 "이어서 작업하기" 클릭 |

> **현재 상태:** `VITE_GA_MEASUREMENT_ID` 미등록 → 전량 noop. 측정 ID 발급 후 Vercel 환경변수 등록 필요.

---

## 7. 현재 구현 기능 전체 목록

### 7-1. 분석 엔진

- **3가지 모드** — 인물 / 반려동물 / 혼합
- **5단계 얼굴 감지** — FaceLandmarker(4가지 설정) + BlazeFace
- **연사 그룹핑** — pHash Hamming≤10
- **씬 클러스터링** — Hamming≤22 + 의상/배경 변화 감지 (색 히스토그램)
- **B급 정밀화** — EAR 시계열, 얼굴 영역 Laplacian, 저조도 노이즈 분류
- **F18 인물 클러스터링** — 128차원 임베딩, 온라인 클러스터링, 폴더 간 헝가리안 통합
- **응시 추정** — iris landmark → 카메라 바라보기 여부
- **heroBonus** — AND/OR 주인공 가산점, 면적·응시·중앙 보너스
- **maxPerGroup** — 유사 컷 최대 허용 (1/2/3/5/무제한)
- **재추출 5회** — 가중치·필터 조건 변경 후 재선별

### 7-2. 갤러리 (Flow A)

- 선택됨 / 제외됨 / 전체 3탭
- PhotoDetailModal — NOTES 톤, SCORE 분수형, 그룹 베스트 점프, 키보드 네비
- GroupCompareModal — 유사 컷 5장 격자 비교 + 베스트 교체
- FeedbackMode — 카드 스와이프 취향 피드백 → 즉시 재선별
- 취향 결과 비교 탭 (AI 기본 / 내 취향)
- 우클릭 컨텍스트 메뉴 (선택 제외/포함, 자세히 보기)
- 감점 사유 그룹별 폴더 (눈 감음/흔들림/측면/인물 감지 불가)

### 7-3. 갤러리 (Flow B/C — FolderGallery)

- 폴더별 탭 (⏳ 분석 중 / ✓ 완료 / ⚠️ 오류 상태)
- 폴더 내 선택됨/제외됨/전체 3탭
- PhotoDetailModal 연결 (v0.5.3에서 추가, 이전에는 누락)
- 🔁 이전 배지 — 과거 세션 사용 사진
- 감점 사유 한국어 배지
- Google Drive 원본 받기 훅 (ZIP 시점)
- DriveDownloadBanner — 전 화면 플로팅 다운로드 상태

### 7-4. ZIP 내보내기

- 폴더 구조 보존 ZIP (`jszip`)
- 진행률 표시 (`generateAsync` 콜백)
- 워터마크 적용 옵션 (OffscreenCanvas 대각선 3개소, JPEG q0.88)
- 파일명 마스킹 (`displayName.ts` — MOOD+MOMENT seed 기반)
- **24h 재다운로드 캐시** (IndexedDB `ddalgak-zip-cache`) — 방금 만든 ZIP 다시 받기 버튼
- ZIP 완료 토스트 — 닉네임 + hero 이름 포함

### 7-5. Google Drive 연동

- GIS OAuth + Google Picker API
- 백그라운드 비블로킹 다운로드 큐
- 동시성 8개 병렬 다운로드 (1,000장 약 25초)
- DriveDownloadBanner (전 화면 플로팅 + 브라우저 Notification)
- beforeunload 경고 (다운로드 중 탭 닫기 방지)

### 7-6. 세션 지속성

- IndexedDB `ddalgak-session` 3초 디바운스 자동저장 (갤러리 상태)
- OPFS 폴더 세션 영속화 (`opfsStore.ts`) — 새로고침/재방문 후 복원
- 앱 마운트 시 만료 세션 정리 (`clearExpiredSessions`, `clearExpiredZips`)
- 파일 재첨부 배너 (새로고침 후 ZIP 다운로드 복구)

### 7-7. 개인화

- NicknameCaptureModal — 첫 ZIP 다운로드 시 1회 권유
- UserAddress — "민현님," 호명 (랜딩, 갤러리 헤더, ZIP 토스트 등)
- hero displayName 영속화 — 다음 세션에 자동 부여
- OnboardingModal — 첫 방문 안내
- ReturningBanner — 재방문 4단계 호명

### 7-8. 분석 스토리텔링

- `analyzer.ts` onProgress 콜백 — 12개 단계 (`received|thumbnail|phash|burst_group|scene_cluster|face_detect|face_embed|person_cluster|gaze|scoring|selection|done`)
- StorySnapshot 누적 카운터 — eyeClosedFound, blurFound, sideFaceFound, pastDupeFound, personsFound, sCandidates
- Analysis.tsx 큐레이터 톤 실시간 표시

### 7-9. 결제 인프라 (비활성)

- `payment.ts` — PortOne V2 requestPayment / verifyPayment
- `PaymentGate.tsx` — 모달 (단건 ₩2,900 / 30일 ₩9,900 표시)
- `supabase/functions/verify-payment/index.ts` — Deno Edge Function 배포 완료
- **무료 베타 bypass** — `isFreeBeta()` = true 시 PaymentGate useEffect에서 즉시 `onSuccess()` 호출

### 7-10. 기타 인프라

- ErrorBoundary — 컴포넌트 에러 격리
- Toast 시스템 — 글로벌 이벤트 버스 기반
- LangToggle — ko/en 전환
- `bench-b-grade.mjs / bench-person.mjs / bench-gaze.mjs` — 정확도 벤치마크
- `npm run bench:all` — F1·FPR 게이트 (fail 시 exit 1)

---

## 8. 파일 구조

```
src/
├── components/
│   ├── ui/
│   │   ├── PrimaryButton.tsx       ← 화면당 1개 룰
│   │   ├── SecondaryButton.tsx
│   │   └── TextLink.tsx
│   │
│   ├── AppShell.tsx                ← 스텝 라우팅 + 세션 자동저장 + 복구 배너
│   ├── Landing.tsx                 ← 2카드 + SEO + OPFS 복원 카드
│   ├── StudioTypeSelect.tsx        ← Flow B/C 분기
│   ├── TypeSelect.tsx              ← Flow A 피사체 선택
│   ├── Upload.tsx                  ← Flow A 업로드
│   ├── FolderUpload.tsx            ← 다중 폴더 드롭존 + Drive 연동
│   ├── DriveDownloadBanner.tsx     ← 전 화면 플로팅 다운로드 배너
│   ├── Analysis.tsx                ← 분석 로딩 + 스토리텔링 카운터
│   ├── PersonSelect.tsx            ← F18 주인공 선택
│   ├── Gallery.tsx                 ← Flow A 메인 갤러리
│   ├── FolderGallery.tsx           ← Flow B/C 폴더별 탭 갤러리
│   ├── PhotoCard.tsx
│   ├── PhotoDetailModal.tsx        ← NOTES 톤 상세 모달 (v0.5.3)
│   ├── PhotoModal.tsx              ← 줌·패닝 (구형, 일부 경로에서 유지)
│   ├── GroupCompareModal.tsx       ← 유사컷 5장 격자 비교
│   ├── FeedbackMode.tsx            ← 카드 스와이프 취향 피드백
│   ├── AlbumContainer.tsx          ← 앨범 배치 + Flow C 폴백
│   ├── NicknameCaptureModal.tsx    ← 닉네임 1회 권유
│   ├── UserAddress.tsx             ← 호명 컴포넌트
│   ├── OnboardingModal.tsx         ← 첫 방문 안내 (v0.5.4)
│   ├── ReturningBanner.tsx         ← 재방문 호명 (v0.5.4)
│   ├── Display.tsx                 ← 세리프 디스플레이 슬롯
│   ├── MonoNumber.tsx              ← 모노 수치 슬롯
│   ├── PaymentGate.tsx             ← PortOne V2 결제 모달
│   ├── Toast.tsx                   ← 글로벌 토스트 이벤트 버스
│   ├── LangToggle.tsx
│   └── ErrorBoundary.tsx
│
├── lib/
│   ├── types.ts                    ← AppState, Flow, EventTag, AnalysisStage, HeroConfig 등
│   ├── store.ts                    ← Zustand (driveQueue 포함)
│   ├── analyzer.ts                 ← 분석 파이프라인 + onProgress 콜백
│   ├── scorer.ts                   ← 채점 + 씬 다양성 그리디
│   ├── scoreBreakdown.ts           ← NOTES 표 데이터 변환
│   ├── phash.ts                    ← pHash + Hamming + 씬 클러스터링
│   ├── laplacian.ts                ← Laplacian variance
│   ├── eye.ts                      ← EAR 시계열 + 웃음 분류
│   ├── sceneChange.ts              ← 의상·배경 변화 감지
│   ├── recommendedCount.ts         ← 이벤트 태그별 추천 장수
│   ├── faceEmbedding.ts            ← face-api.js 임베딩
│   ├── personClustering.ts         ← 온라인 클러스터링 + 헝가리안
│   ├── gazeEstimation.ts           ← iris 응시 추정
│   ├── heroScore.ts                ← heroBonus 알고리즘
│   ├── eventTagger.ts              ← 폴더명·EXIF → EventTag
│   ├── pastSelectionStore.ts       ← IndexedDB 지문 저장
│   ├── dedupe.ts                   ← Hamming 기반 중복 감지
│   ├── opfsStore.ts                ← OPFS 폴더 세션 영속화
│   ├── feedbackLearning.ts         ← 취향 재추출 (in-session)
│   ├── userProfile.ts              ← 닉네임·sessionCount·heroPersonNames
│   ├── googleDrive.ts              ← GIS OAuth + Picker + Drive API
│   ├── sessionPersist.ts           ← IndexedDB 세션 자동저장/복구
│   ├── zipManager.ts               ← IndexedDB ZIP 24h 캐시 (v0.5.4)
│   ├── freeBetaConfig.ts           ← 무료 베타 플래그 + 카피 상수 (v0.5.4)
│   ├── analytics.ts                ← GA4 12 이벤트 + PII 스크러버 (v0.5.4)
│   ├── displayName.ts              ← 파일명 마스킹 MOOD+MOMENT
│   ├── watermark.ts                ← OffscreenCanvas 워터마크
│   ├── payment.ts                  ← PortOne V2 (비활성)
│   └── i18n.ts
│
├── messages/
│   ├── ko.json                     ← 큐레이터 톤 카피 (한국어 하드코딩 금지)
│   └── en.json
│
public/
├── ads.txt                         ← AdSense 인증
├── privacy.html                    ← 개인정보처리방침
└── models/                         ← face-api.js 모델 파일
│
supabase/
└── functions/verify-payment/index.ts  ← Deno Edge Function (배포 완료, 비활성)
│
scripts/
├── bench-b-grade.mjs / bench-person.mjs / bench-gaze.mjs
└── download-face-models.sh
```

---

## 9. 비즈니스 모델

### 9-1. 무료/유료 경계 (설계 기준, 현재 무료 베타)

| 기능 | 무료 | 유료 |
|------|:----:|:----:|
| 분석·셀렉·감점 사유 보기 | ✅ | ✅ |
| 사진 5장까지 다운로드 | ✅ | ✅ |
| 6장째부터 다운로드 | ❌ | ✅ |
| 폴더 구조 보존 ZIP | ❌ | ✅ |
| 과거 세션 중복 제거 | ✅ | ✅ |
| AI 보정 (미구현) | 샘플 1장 | 별도 크레딧 |
| AdSense 광고 | 노출 | 제거 |

### 9-2. 가격 구조 (기획 확정)

| 티어 | 가격 | 권한 |
|------|------|------|
| **단건권** | **₩2,900** | 결제 후 24시간 무제한 ZIP + 광고 제거 |
| **30일권** | **₩9,900** | 30일 무제한 + AI 보정 크레딧 5장 |
| **AI 보정 크레딧** | **₩4,900 / 10장** | 별도 추가 |

### 9-3. 결제 활성화 조건

사업자등록 + PortOne 가맹·세금 신고 체계 완비 후 다음만 처리하면 즉시 활성화:

1. Vercel 환경변수: `VITE_FEATURE_PAYMENT=true` + `VITE_PORTONE_STORE_ID` + `VITE_PORTONE_CHANNEL_KEY`
2. Supabase Edge Function 시크릿: `PORTONE_API_SECRET`
3. PortOne 콘솔: 허용 도메인 + 카카오페이/토스페이 채널 연결
4. 결과 화면 카피 "무료 베타" → 정상 가격 표시로 자동 전환 (환경변수 분기로 이미 구현)

### 9-4. AdSense 현황

- `public/ads.txt` 배포 완료
- 재심사 대기 중 (1~2주 소요 예상)
- 승인 후 무료 사용자에게만 노출 (갤러리 사이드바 또는 하단)
- 분석 로딩 화면에는 절대 노출 금지 (신뢰도 저하)

---

## 10. 보안 이력

### 2026-04-29 — VITE_GOOGLE_API_KEY 노출 사고

**원인:** `git add -f dist/` 포함 커밋 → GitHub 공개 저장소에 Vite 번들링된 API 키 노출  
**감지:** GitGuardian 자동 알림  
**조치:**
1. 기존 키 즉시 삭제 (Google Cloud Console)
2. 신규 키 발급 + HTTP 리퍼러 도메인 제한 (`ddalgak-picks.vercel.app`)
3. Vercel 환경변수 교체
4. `SECURITY.md` 사고 경위 기록
5. `PRE_PUSH_SECURITY_CHECKLIST.md` 8단계 게이트 확립

**재발 방지 규칙:**
- `dist/` 커밋 절대 금지 (`.gitignore`에 포함)
- 배포는 소스 파일만 push → Vercel이 서버에서 빌드
- 모든 push 전 PRE_PUSH_SECURITY_CHECKLIST.md 8단계 통과 필수

### PRE_PUSH_SECURITY_CHECKLIST 8단계 (요약)

1. `payment.ts` 미변경 확인
2. `analyzer.ts` 미변경 확인
3. `VITE_` 붙은 API secret 없는지 grep
4. `supabase/functions/verify-payment/` 미변경 확인
5. `.env` 파일 미스테이징 확인
6. 신규 `console.log` 없는지 확인
7. PII 노출 패턴 없는지 확인
8. `PhotoDetailModal.tsx` 미변경 확인

---

## 11. 환경변수 현황

| 변수 | 용도 | 등록 위치 | 상태 |
|------|------|-----------|------|
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth | `.env` + Vercel | ✅ 등록됨 |
| `VITE_GOOGLE_API_KEY` | Google Drive API (도메인 제한) | `.env` + Vercel | ✅ 등록됨 |
| `VITE_SUPABASE_URL` | Supabase | Vercel | ⚠️ 값 미확정 |
| `VITE_SUPABASE_ANON_KEY` | Supabase Anon | Vercel | ⚠️ 미등록 |
| `VITE_ADSENSE_CLIENT_ID` | AdSense `ca-pub-7332731589854643` | Vercel | ✅ 등록됨 (재심사 대기) |
| `VITE_SENTRY_DSN` | Sentry | Vercel | ⚠️ 미등록 |
| `VITE_FEATURE_PAYMENT` | 결제 게이트 on/off | Vercel | `false` (무료 베타) |
| `VITE_FEATURE_PERSON_CLUSTERING` | F18 PersonSelect | Vercel | 기본 ON |
| `VITE_GA_MEASUREMENT_ID` | GA4 측정 ID | Vercel | ❌ 미발급·미등록 |
| `VITE_PORTONE_STORE_ID` | PortOne 결제 | Vercel | ⚠️ 미등록 |
| `VITE_PORTONE_CHANNEL_KEY` | PortOne 결제 | Vercel | ⚠️ 미등록 |
| `VITE_API_BASE_URL` | 외부 API | Vercel | ⚠️ 미사용 |
| `VITE_FACE_EMBEDDING_MODEL_URL` | face-api.js 모델 | Vercel | ⚠️ 미사용 (public/models/ 직접 사용) |

**서버 전용 (Supabase Edge Function):**

| 변수 | 상태 |
|------|------|
| `SUPABASE_URL` | ⚠️ |
| `SUPABASE_SERVICE_ROLE_KEY` | ⚠️ |
| `PORTONE_API_SECRET` | ⚠️ 미등록 (결제 비활성 동안 불필요) |
| `ADMIN_PASSWORD_HASH` | ⚠️ |
| `JWT_SECRET` | ⚠️ |

---

## 12. 대기 중인 작업 (로드맵)

### v0.6.0 — 소셜 로그인 🔲 미시작

`feat/v0.6.0-social-login` 브랜치 예정.  
사전 액션 가이드: `CLAUDE_CODE_PROMPT_v0.6.0_SOCIAL_LOGIN_PREP.md`

| # | 항목 |
|---|------|
| 1 | Supabase Auth 활성화 + RLS 기본 정책 |
| 2 | Google OAuth Provider 연결 |
| 3 | 카카오 OAuth Custom Provider |
| 4 | 네이버 OAuth Custom Provider |
| 5 | UserProfile 모델 확장 (provider/providerUserId/email — 기존 nickname/heroPersonNames 보존) |
| 6 | 로그인/로그아웃 UI + AppShell 헤더 우상단 사용자 영역 |
| 7 | 게스트 모드 호환 — 로그인 안 해도 셀렉 가능 유지 |
| 8 | 결제 회원 구분 (`auth.uid` 매핑) |
| 9 | UUID 어뷰징 방지 1차 — 동일 이메일 + Device Fingerprint 중복 감지 (조용히 플래그) |

> **사전 액션 (사용자가 직접):** Supabase 프로젝트 활성화 + 카카오/네이버/구글 개발자 콘솔 앱 등록 + 환경변수 수집

---

### v0.7.0 — 모바일 이어 작업 (디바이스 간 동기화) 🔲 미시작

v0.6.0 소셜 로그인 위에서 진행. 옵션 3가지:

| 옵션 | 방식 | 비고 |
|------|------|------|
| A | Drive 메타 P2P | 백엔드 0, Drive 사용자만 |
| B | Supabase Storage | 백엔드, 로컬 폴더 사용자도 커버 |
| C | 하이브리드 | Drive 사용자 = A, 비-Drive = B |

---

### 결제 활성화 🔲 사업자등록 후 (시점 미정)

코드는 모두 완성. 위 [9-3] 참고.

---

### GA4 측정 ID 발급 🔲 즉시 처리 가능

`analytics.ts`는 완성됨. `VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX`를 Google Analytics에서 발급받아 Vercel 환경변수에 등록하면 즉시 12개 이벤트 수신 시작.

---

### AdSense 재심사 🔲 대기 중

`public/ads.txt` 배포 완료. 구글 재심사 결과 대기.

---

### Phase 1 후순위 항목

| 항목 | 설명 |
|------|------|
| 취향 학습 영속화 | `preferenceProfile` IndexedDB — EventTag별 자동 저장/적용 |
| 시스템 자동 분기 | 드롭 형태 감지로 StudioTypeSelect 스킵 |
| Drive 썸네일 우선 다운로드 | 분석 = 썸네일 / ZIP = 원본 (F23) |
| AI 보정 | Replicate API + CodeFormer + GFPGAN — 외부 API 의존, 별도 결제 |

---

### Phase 2 — 비즈니스 레이어 (Phase 1 데이터 쌓인 후 검토)

PortOne 결제 활성화 / 광고 배너 / 무료 체험 워터마크 / 어드민 페이지 / 다중 라벨러 협업 / 서버 지문 동기화 / Supabase ANON 미등록 해소

---

## 13. 운영 규칙 및 기술 제약

### 13-1. 절대 금지 사항

```
❌ dist/ 커밋 (API 키 노출 위험)
❌ npx vercel --prod 로컬 직접 빌드 배포
❌ main 브랜치 직접 커밋 (반드시 브랜치 → PR → 머지)
❌ payment.ts / analyzer.ts / PhotoDetailModal.tsx / verify-payment/ 무단 수정
❌ VITE_ 붙은 서버 시크릿 코드에 하드코딩
❌ 한국어 카피 코드 내 하드코딩 (messages/ko.json만 사용)
```

### 13-2. 배포 절차

```bash
# 1. 브랜치 생성
git checkout -b feat/xxx

# 2. 작업 후 특정 파일만 스테이징 (dist/ 제외)
git add src/ public/ index.html vercel.json package.json supabase/

# 3. PRE_PUSH_SECURITY_CHECKLIST 8단계 통과
git diff --staged | grep -E "VITE_|AIza|ya29"  # 출력 없어야 안전

# 4. TypeScript 타입 체크
npx tsc --noEmit  # EXIT:0 필수

# 5. 빌드 검증
npx vite build --outDir /tmp/ddalgak-buildN  # EXIT:0 필수

# 6. 커밋 + push
git commit -m "feat: ..."
git push -u origin feat/xxx

# 7. GitHub에서 PR → 머지 → 태그
git tag vX.X.X-stable
git push origin vX.X.X-stable
```

### 13-3. Zustand 셀렉터 규칙

```typescript
// ❌ 절대 금지 — React Error #185 무한루프
const { a, b } = useStore((s) => ({ a: s.a, b: s.b }))

// ✅ 올바른 방법 — 개별 셀렉터
const a = useStore((s) => s.a)
const b = useStore((s) => s.b)
```

### 13-4. 폰트 정책 §9-5 (v0.5.2.1 이후)

```typescript
// ❌ 위반
fontFamily: "var(--font-display)"
fontStyle: "italic"

// ✅ 준수
fontFamily: "var(--font-sans)"
fontWeight: 800
fontStyle: "normal"
```

### 13-5. 태그 이력

| 태그 | 대응 릴리즈 |
|------|------------|
| `v0.1.1` | 초기 MVP |
| `v0.3.1-stable` | Flow B/C + Drive + 보안 |
| `v0.4.0-stable` | Stage A — 큐레이터 톤 |
| `v0.4.1-stable` | Stage B — 누락 기능 보완 |
| `v0.5.0-design-stable` | 디자인 v2 갭 패치 시작 |
| `v0.5.0-stage-c` | Stage C — F18 인물 클러스터링 |
| `v0.5.1-stable` | 디자인 갭 패치 완료 |
| `v0.5.2-stable` | 성능·영속·F18 default-on |
| `v0.5.2.1-stable` | 폰트 정책 §9-5 |
| `v0.5.2.2-stable` | 네이비 테마 |
| `v0.5.2.3-stable` | 헤더 border 픽스 |
| `v0.5.3-stable` | PhotoDetailModal |
| **`v0.5.4-stable`** | **무료 베타 + GA4 + 온보딩 + ZIP 캐시 (현재)** |

---

## 참조 문서

| 문서 | 용도 |
|------|------|
| `PROJECT_STATUS.md` | 현재 상태·로드맵·기술 제약 |
| `PHASE1_PLAN.md` | Phase 1 상세 기획 (§1~⑦) — 가격·KPI·F18 통합 |
| `DESIGN_DIRECTION.md` | 큐레이터 톤 디자인 명세 v2 |
| `PERSONALIZATION_PLAN.md` | 닉네임·호명·재방문·hero displayName |
| `SECURITY.md` | 보안 정책 + 2026-04-29 사고 기록 |
| `PRE_PUSH_SECURITY_CHECKLIST.md` | push 전 8단계 게이트 |
| `PRODUCT_STRATEGY_REVIEW_2026-04-23.md` | 초기 전략 리뷰 (역사적 자료) |
| `CLAUDE_CODE_PROMPT_v0.6.0_SOCIAL_LOGIN_PREP.md` | v0.6.0 소셜 로그인 사전 액션 가이드 |
| `.env.example` | 환경변수 목록 (값 없음, git 추적) |
