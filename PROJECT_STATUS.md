# 딸깍픽스 (ddalgak-picks) — PROJECT STATUS

> **마지막 업데이트:** 2026-04-27
> **현재 버전:** v0.2.1 (빌드 완료 — 터미널에서 git commit + npx vercel --prod 필요)
> **배포 URL:** https://ddalgak-picks.vercel.app
> **GitHub:** https://github.com/IamMochaInSeoul/ddalgak-picks (main 브랜치)

---

## 프로젝트 개요

- **무엇:** 수백~수천 장 사진 중 원하는 만큼 AI가 골라주는 웹앱
- **누가:** 비개발자 Minhyup (민현). 아이디어만 제공, 모든 기획·설계·개발·QA·배포는 Claude가 담당
- **스택:** Vite 5 + React 18 + TypeScript + Zustand 5 + MediaPipe tasks-vision@0.10.34 + JSZip + Vercel 정적 배포

---

## 제품 전략 — 기능 기획 v2 (2026-04-27 확정)

> **이 섹션은 모든 기능 결정의 상위 기준이다. 후속 세션의 Claude는 기능 변경·추가 시 이 섹션과 충돌하는지 먼저 확인할 것.**

### 핵심 문제 (JTBD)

> "스튜디오가 준 폴더 구조(만삭/베이비본/100일/돌) 그대로, 각 폴더에서 베스트 N장씩 셀렉해서, **똑같은 폴더 구조로** ZIP 돌려보내기 — 3시간 작업을 10분으로."

핵심 타겟: **스튜디오에서 원본 앨범을 받아 셀렉 후 다시 스튜디오에 보내야 하는 신혼부부·육아맘·반려동물 부모.** 보조 타겟: 여행·일상 사진 중 S급만 추리고 싶은 일반 유저.

---

### UX 플로우 구조 (v2 — 2026-04-27 재설계 확정)

```
Landing (2카드)
├── 사진만 셀렉 ──────────────→ TypeSelect → Upload → Analysis → Gallery
│    돌잔치·여행·일상
│
└── 스튜디오용 셀렉 ──────────→ StudioTypeSelect (분기 화면)
     스튜디오·웨딩·돌스냅           │
                                   ├── 셀렉용 폴더 있어요 (flow B)
                                   │     "스튜디오에서 폴더 받음"
                                   │     → FolderUpload → FolderGallery
                                   │                        ├── ZIP 저장
                                   │                        └── 앨범 배치하기 → AlbumContainer
                                   │
                                   └── 사진만 있어요 (flow C)
                                         "폴더 없이 사진만"
                                         → FolderUpload → FolderGallery
                                                            └── ZIP 저장만
```

**핵심 설계 원칙:** "앨범 배치"는 랜딩에서 꺼내지 않는다. 스튜디오용 경로에서 셀렉 완료 후 자연스럽게 이어지는 다음 단계로 노출한다.

---

### Flow 별 상세

#### Flow A · 사진만 셀렉 (개인용)

- **대상:** 돌잔치, 여행, 일상 사진
- **입력:** 이미지 파일 N장 or 폴더 (구조 무의미)
- **처리:** 피사체 선택(인물/반려동물/혼합) → 썸네일 400px → pHash → 연사 그룹핑(Hamming≤10) → 씬 클러스터링(Hamming≤22) → 얼굴 감지 → bbox Laplacian 선명도 → 채점·감점 → 씬 비례 할당 + maxPerGroup 그리디 선별
- **출력:** 갤러리 3탭(선택/제외/전체) → ZIP 다운로드
- **상태:** ✅ 완전 구현

#### Flow B · 스튜디오 폴더 셀렉 + 앨범 배치 (셀렉용 폴더 있음)

- **대상:** 스튜디오에서 의상·배경별 폴더 구조를 제공받은 고객
- **입력:** 폴더 여러 개 (만삭/, 베이비본/, 100일/, 돌/ 등)
- **처리:** 폴더별 독립 분석(이벤트 태그 자동 추정 → Flow A 동일 파이프라인)
- **출력:** 폴더 탭 UI → 선별 결과 → ZIP (폴더 구조 보존) → 앨범 배치로 이어가기
- **상태:** ✅ FolderUpload + FolderGallery 구현 완료 (v0.2.x)

#### Flow C · 스튜디오 폴더 셀렉 + ZIP만 (사진만 있는 경우)

- **대상:** 스튜디오 폴더 없이 촬영 사진만 있는 고객
- **입력:** 사진 파일 or 폴더 (직접 구분)
- **처리:** Flow B와 동일 파이프라인
- **출력:** 폴더 탭 UI → 선별 결과 → ZIP 저장 (앨범 배치 버튼 없음)
- **상태:** ✅ FolderUpload + FolderGallery 공유 구현 (v0.2.x, flow 값으로 분기)

#### 앨범 배치 (AlbumContainer) — Flow B 이후 단계

- **입력:** 템플릿 폴더(빈 액자/앨범 슬롯 구조) + 촬영 세션 폴더들
- **처리:** `parseTemplate()` 슬롯 배열 생성 → 세션 분석 → `autoAssign()` 슬롯 배치
- **출력:** 슬롯 편집 UI → 템플릿 폴더 구조 그대로 ZIP
- **상태:** ✅ v0.1.3 기구현, Flow B에서 연결됨

---

### 핵심 차별점 5가지

1. **폴더 구조 유지 셀렉** — 경쟁사가 못하는 본질적 차별점
2. **이벤트 자동 태깅** — 폴더명에서 만삭/베이비본/100일/돌 등 자동 분류
3. **중복 제거 — 과거 셀렉 기억하는 AI** — pHash 지문 이력 기반, 이미 쓴 컷 자동 제외 (Phase 0 미구현)
4. **AI 보정 샘플 → 전체** — Try Before Buy, Before/After 슬라이더 (Phase 1)
5. **100% 로컬 셀렉 + 선택적 서버 보정** — 사진 원본은 기본 브라우저에서만

### UX 원칙 (토스식 6원칙)

1. **한 화면 한 결정** — 기본 CTA 하나, 보조 행동은 숨김
2. **숫자는 먼저 공개** — 예상 시간·감지 장수를 분석 시작 전 노출
3. **다음 액션은 시스템이 추천** — 갤러리 진입 즉시 베스트가 기본 선택된 상태
4. **결제는 2초** — (Phase 2 적용 시) 카카오페이 원탭 기본
5. **로딩은 스토리텔링** — "눈 감은 컷 17장 제외, 흔들림 8장 제외, 베스트 10장 선정"
6. **무료 재시도·수정 무제한** — 실수해도 되돌릴 수 있음

---

### 핵심 데이터 타입

```ts
// flow 정의 (store.ts)
// A = 사진만 셀렉 (개인용)
// B = 스튜디오 폴더 셀렉 + 앨범 배치 (셀렉용 폴더 있음)
// C = 스튜디오 폴더 셀렉 + ZIP만 (폴더 없음)
type Flow = "A" | "B" | "C" | null;

type EventTag =
  | "maternity" | "newborn" | "50days" | "100days"
  | "first_birthday" | "wedding" | "family"
  | "pet_profile" | "travel" | "other";

interface FolderSession {
  id: string;
  folderName: string;
  eventTag: EventTag;
  files: File[];
  status: "pending" | "analyzing" | "done" | "error";
  progress: number;       // 0~1
  stage: string;          // 분석 단계 텍스트
  photos: Map<string, PhotoEntry>;
  groups: PhotoGroup[];
  targetCount: number;
  errorMessage?: string;
}

// AppState 추가 필드 (구현 완료)
interface AppState {
  step: "landing" | "typeSelect" | "upload" | "analysis" | "gallery" | "album"
      | "studioSelect" | "folderUpload" | "folderGallery";
  flow: Flow;
  folderSessions: FolderSession[];
}
```

---

## 기술 제약 (매 세션 반드시 숙지)

### Zustand 규칙
```
❌ useStore((s) => ({ a: s.a, b: s.b }))  → React Error #185 무한루프!
✅ const a = useStore((s) => s.a)          → 개별 셀렉터만 사용
```

### 빌드·배포 제약
- **FUSE 파일시스템:** 프로젝트 폴더 내 `rm -rf dist/` 불가, /tmp 기존 빌드 폴더 삭제 불가
- **빌드 명령:** `npx vite build --outDir /tmp/ddalgak-buildN --emptyOutDir` (N을 매번 증가)
  - 현재까지 build1~build5 사용 → 다음은 `/tmp/ddalgak-build6`
- **dist 업데이트:** 빌드 결과를 `dist/assets/`에 복사, `dist/index.html`도 복사
- **배포:** 사용자가 터미널에서 `rm -f .git/index.lock && git add ... && git commit && git push`
- **git index.lock:** FUSE로 삭제 불가 → 막힐 때 사용자 터미널에서 `rm -f .git/index.lock`
- **dist는 .gitignore에 있음:** `git add -f dist/`로 강제 추가 필요

### Vercel 배포
- GitHub 자동 트리거가 간헐적으로 멈춤 → `npx vercel --prod`로 수동 배포
- 명령: `cd ~/Desktop/"vibe coding"/ddalgak-picks && npx vercel --prod`
- projectId: `prj_5Z0q2wFkjWQgNnoHzwH9r3bdP1Gd`
- teamId / orgId: `team_QCXZxUDktkf2o1BPLrh0lVk7`
- GitHub 계정: IamMochaInSeoul / Google 계정: jungmoca90@gmail.com

---

## 구현 완료 기능 현황 (v0.2.1 기준)

### ✅ 랜딩 (v0.2.1)
- 2카드: "사진만 셀렉" (개인용) / "스튜디오용 셀렉"
- hover 시 카드 부상 + 보라색 글로우 애니메이션
- 각 카드에 배지 (용례) + CTA 버튼

### ✅ StudioTypeSelect (v0.2.1 신규)
- "셀렉용 폴더 있어요" (flow B → 앨범 배치까지) / "사진만 있어요" (flow C → ZIP만)
- 각 옵션에 단계 흐름 배지로 시각화

### ✅ FolderUpload (v0.2.0 신규)
- 다중 폴더 드래그앤드롭 (FileSystemEntry API 재귀 읽기)
- 폴더별 이벤트 태그 자동 추론 (eventTagger.ts) + 수동 변경 가능
- 폴더별 목표 장수 개별 설정 (10/20/30/50 프리셋 + 직접 입력)
- 유사 사진 최대 허용 (maxPerGroup) 전역 설정
- 폴더 추가/삭제/전체 초기화

### ✅ FolderGallery (v0.2.0 신규)
- 폴더별 순차 분석 (MediaPipe 메모리 충돌 방지)
- 탭 바: 각 탭에 상태(⏳/✓/⚠️) + 선별 장수 배지
- 썸네일 그리드 + 클릭으로 선택/해제
- 품질 배지 (HIGH/MED/LOW)
- 분석 진행 프로그레스 바 (단계 텍스트 포함)
- 하단 고정 바: ZIP 저장 + flow B일 때만 "앨범 배치하기 →" 버튼

### ✅ eventTagger.ts (v0.2.0 신규)
- 한국어/영어 폴더명 → EventTag 자동 추론
- 만삭/신생아/50일/백일/돌잔치/웨딩/가족/펫/여행/기타 10개 태그

### ✅ Flow A 엔진 (완성)
- 인물 / 반려동물 / 혼합 3가지 모드
- 2단계 pHash 그룹핑: 연사(Hamming≤10) + 씬(Hamming≤22)
- 씬별 비례 선별 (다양성 자동 보장)
- 얼굴 감지 5단계 파이프라인 (FaceLandmarker×4 + BlazeFace)
- 인물 가중치: eyeOpen(35%) / sharpness(30%) / expression(20%) / facing(15%)
- 반려동물 가중치: sharpness(55%) / position(30%) / eyeEstimate(15%)
- maxPerGroup 설정 (1/2/3/5/무제한)
- 필터: 눈감음 / 흔들림 / 정면만 / 낮은신뢰도 제외
- 갤러리 3탭 (선택됨/제외됨/전체), 제외됨 감점 사유별 버킷
- 재추출 최대 5회, 줌 모달 (1~500% + 드래그 패닝)
- 취향 재추출: 20장 카드 스와이프 → 가중치 조정 → 즉시 재선별

### ✅ 업로드 화면 — Flow A용 (v0.1.4)
- 폴더 드래그앤드롭 (FileSystemEntry API 재귀 읽기)
- "사진 파일 선택" + "폴더째 선택" 버튼 2종
- 선택 초기화 버튼

### ✅ 세션 지속성
- beforeunload 경고 (분석 중/갤러리/folderGallery)
- IndexedDB 자동저장 3초 디바운스 (24h TTL)
- 재방문 복구 배너

### ✅ 앨범 배치 (AlbumContainer) — v0.1.3
- 스튜디오 템플릿 폴더 파싱 (액자 capacity=1 / 앨범 capacity=3 / 일반 capacity=2)
- 다중폴더 드래그앤드롭 + 파일 직접 드롭 fallback
- Google Drive 연동 (GIS OAuth + Picker + Drive API)
  - 필요 env: `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`
- AI 자동 배치(`autoAssign`) + 수동 배치
- ZIP 다운로드 (템플릿 폴더 구조 그대로)

---

## 주요 파일 구조 (v0.2.1 기준)

```
src/
├── components/
│   ├── AppShell.tsx          ← 스텝 라우팅 + 세션 자동저장 + 복구 배너
│   ├── Landing.tsx           ← 2카드 (사진만/스튜디오용) — v0.2.1 재작성
│   ├── StudioTypeSelect.tsx  ← 셀렉용 폴더 有無 분기 — v0.2.1 신규
│   ├── FolderUpload.tsx      ← 다중 폴더 드롭존 — v0.2.0 신규
│   ├── FolderGallery.tsx     ← 폴더별 탭 갤러리 + ZIP — v0.2.0 신규
│   ├── TypeSelect.tsx        ← Flow A 피사체 선택
│   ├── Upload.tsx            ← Flow A 파일/폴더 업로드
│   ├── Analysis.tsx          ← Flow A 분석 진행 화면
│   ├── Gallery.tsx           ← Flow A 메인 갤러리
│   ├── FeedbackMode.tsx      ← 카드 스와이프 취향 피드백
│   ├── PhotoCard.tsx
│   ├── PhotoModal.tsx        ← 줌·패닝 모달
│   ├── AlbumContainer.tsx    ← 앨범 배치 (Flow B 이후 단계)
│   ├── LangToggle.tsx
│   └── ErrorBoundary.tsx
├── lib/
│   ├── types.ts              ← 전체 타입 + AppState (flow/folderSessions 추가 완료)
│   ├── store.ts              ← Zustand (setFlow + folderSessions CRUD 완료)
│   ├── eventTagger.ts        ← 폴더명 → EventTag 자동 추론 — v0.2.0 신규
│   ├── analyzer.ts           ← 분석 파이프라인 진입점
│   ├── scorer.ts             ← 채점 + 씬 다양성 선별
│   ├── phash.ts              ← pHash + Hamming + 씬 클러스터링
│   ├── laplacian.ts          ← Laplacian variance
│   ├── feedbackLearning.ts   ← 취향 재추출 알고리즘
│   ├── sessionPersist.ts     ← IndexedDB 세션 저장/복구
│   ├── albumTypes.ts         ← Flow C(앨범 배치) 전용 타입
│   └── i18n.ts
├── messages/
│   ├── ko.json
│   └── en.json
dist/
├── index.html               ← 현재 참조: index-Bth3krMX.js (v0.2.1 빌드)
└── assets/
    ├── index-Bth3krMX.js    ← v0.2.1 빌드 (최신, 미커밋)
    ├── index-B_zzzRE2.js    ← v0.2.0 빌드
    ├── index-B7rHhheK.js    ← v0.2.0-pre 빌드
    ├── index-BvGccAyR.js    ← v0.1.4 빌드
    ├── index-C4CHNhkV.css
    ├── jszip.min-CAN6tTy6.js ← v0.2.1 빌드용
    └── vision_bundle-Df2dKBJJ.js
```

---

## 로드맵

### ✅ Phase 0 — 완료 항목

- [x] 랜딩 2카드 리디자인 (v0.2.1)
- [x] StudioTypeSelect 분기 화면 (v0.2.1)
- [x] FolderUpload — 다중 폴더 드롭존 + 이벤트 태그 설정 (v0.2.0)
- [x] FolderGallery — 폴더별 순차 분석 + 탭 갤러리 + ZIP (v0.2.0)
- [x] eventTagger.ts — 폴더명 → EventTag 자동 추론 (v0.2.0)
- [x] types.ts / store.ts — flow, folderSessions, EventTag 타입 추가 (v0.2.0)

### 🔲 Phase 0 — 남은 항목

- [ ] **분석 로딩 스토리텔링** — "눈 감은 컷 N장 제외..." 실수치 단계별 노출 (Analysis.tsx 개선)
- [ ] **FolderGallery 갤러리 개선** — 선택/제외 토글, 감점 사유 표시, 그룹 뷰
- [ ] **중복 제거 (IndexedDB 로컬)** — `dedupe.ts` + `pastSelectionStore.ts`
  - pHash 지문 + 파일명만 저장 (원본 안 보냄)
  - Hamming ≤ 8 매칭 시 "🔁 이전 세션에 사용됨" 배지 + 기본 제외
- [ ] **Flow C 폴백** — AlbumContainer 파싱 실패 시 FolderGallery로 자동 전환

### 🔲 Phase 1 — 프리미엄 업셀 + 재방문 엔진

- [ ] 취향 학습 영속화 (이벤트 태그별 가중치 IndexedDB 저장)
- [ ] 워터마크 프리뷰 + 저장 방지
- [ ] AI 보정 (Replicate API + CodeFormer + GFPGAN)
- [ ] ZIP UX 개선 (진척률 + 완료 토스트 + 재다운로드)

### 🔲 Phase 2 — 비즈니스 레이어

- 계정 시스템 / 서버 지문 동기화 / 결제 / 알림톡 CRM

---

## 버전 히스토리

| 버전 | 내용 | 배포 상태 |
|------|------|-----------|
| v0.1.1 | 초기 릴리즈: 사진 선별 + 취향 재추출 | ✅ 배포됨 |
| v0.1.2 | 세션 지속성 (beforeunload + IndexedDB) | ✅ 배포됨 |
| v0.1.3 | 앨범 기능 (피드백 + 다중폴더 + Google Drive) | ✅ 배포됨 |
| v0.1.4 | 랜딩 텍스트 + 업로드 폴더 버그 수정 + 드롭 안정화 | ⏳ 수동 배포 필요 |
| v0.2.0 | Phase 0: Flow B/C 신규 (FolderUpload+FolderGallery+eventTagger) | ⏳ 수동 배포 필요 |
| v0.2.1 | UX 플로우 재설계: 2카드 랜딩 + StudioTypeSelect 분기 | ⏳ 커밋·배포 필요 |

---

## 다음 세션 시작 시 체크리스트

1. v0.2.1 배포 완료 여부 확인 (`npx vercel --prod` 결과)
2. 미배포라면: 아래 커밋 명령 실행
3. Phase 0 남은 항목 중 우선순위 결정

---

## 커밋 방법 (사용자 터미널)

```bash
cd ~/Desktop/"vibe coding"/ddalgak-picks
rm -f .git/index.lock

# v0.2.x 전체 소스 스테이징
git add src/lib/types.ts src/lib/store.ts src/lib/eventTagger.ts \
        src/components/AppShell.tsx src/components/Landing.tsx \
        src/components/StudioTypeSelect.tsx \
        src/components/FolderUpload.tsx src/components/FolderGallery.tsx

# dist 강제 추가
git add -f dist/

git commit -m "feat: v0.2.1 — UX 플로우 재설계 + Phase 0 Flow B/C 구현

- Landing: 2카드 (사진만 셀렉 / 스튜디오용 셀렉)
- StudioTypeSelect: 셀렉용 폴더 有無 분기 신규 화면
  · 있음(flow B) → FolderUpload → FolderGallery → 앨범 배치
  · 없음(flow C) → FolderUpload → FolderGallery → ZIP만
- FolderUpload: 다중 폴더 드롭존 + 이벤트 태그 + 목표장수
- FolderGallery: 폴더별 순차 분석 + 탭 갤러리 + 폴더구조 ZIP
- eventTagger: 한국어 폴더명 → EventTag 자동 추론 10종
- types/store: flow, folderSessions, EventTag, studioSelect step"

git push && npx vercel --prod
```
