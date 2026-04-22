# 딸깍픽스 (ddalgak-picks) — PROJECT STATUS

> **마지막 업데이트:** 2026-04-23
> **현재 버전:** v0.1.4 (GitHub 커밋 완료 — Vercel 자동 배포 미트리거 상태)
> **배포 URL:** https://ddalgak-picks.vercel.app
> **GitHub:** https://github.com/IamMochaInSeoul/ddalgak-picks (main 브랜치)

---

## 프로젝트 개요

- **무엇:** 수백~수천 장 사진 중 원하는 만큼 AI가 골라주는 웹앱
- **누가:** 비개발자 Minhyup (민현). 아이디어만 제공, 모든 기획·설계·개발·QA·배포는 Claude가 담당
- **스택:** Vite 5 + React 18 + TypeScript + Zustand 5 + MediaPipe tasks-vision@0.10.34 + JSZip + Vercel 정적 배포

---

## 제품 전략 — 기능 기획 v1 (2026-04-23 확정)

> **이 섹션은 모든 기능 결정의 상위 기준이다. 후속 세션의 Claude는 기능 변경·추가 시 이 섹션과 충돌하는지 먼저 확인할 것.**

### 핵심 문제 (JTBD)

> "스튜디오가 준 폴더 구조(만삭/베이비본/100일/돌) 그대로, 각 폴더에서 베스트 N장씩 셀렉해서, **똑같은 폴더 구조로** ZIP 돌려보내기 — 3시간 작업을 10분으로."

핵심 타겟: **스튜디오에서 원본 앨범을 받아 셀렉 후 다시 스튜디오에 보내야 하는 신혼부부·육아맘·반려동물 부모.** 보조 타겟: 여행·일상 사진 중 S급만 추리고 싶은 일반 유저.

### 3가지 Flow 구조

| Flow | 시나리오 | 입력 | 출력 |
|---|---|---|---|
| **A** | 단일 묶음 베스트 셀렉 | 사진 덩어리 (폴더 구조 무의미) | 베스트 N장 ZIP |
| **B** ★ | 폴더 병렬 셀렉 (메인 Use Case) | 폴더 여러 개 (만삭/베이비본/100일/돌) | 입력 구조 그대로 ZIP |
| **C** | 앨범 템플릿 배치 | 촬영 세션 폴더 + 템플릿(액자/앨범 슬롯) | 슬롯별 배치된 ZIP |

랜딩은 이 3Flow를 카드로 명시하여 사용자가 자기 상황을 주카드 선택.

### 핵심 차별점 5가지

1. **폴더 구조 유지 셀렉 (Flow B)** — 경쟁사가 못하는 본질적 차별점
2. **이벤트 자동 태깅** — 폴더명·EXIF에서 만삭/베이비본/100일/돌 등 자동 분류
3. **중복 제거 — 과거 셀렉 기억하는 AI** — pHash 지문 이력 기반, 성장앨범에서 이미 쓴 컷 자동 제외. Phase 0 필수 기능.
4. **AI 보정 샘플 → 전체** — Try Before Buy, Before/After 슬라이더. Phase 1.
5. **100% 로컬 셀렉 + 선택적 서버 보정** — 사진 원본은 기본 브라우저에서만, 보정만 명시 동의 후 서버

### UX 원칙 (토스식 6원칙)

1. **한 화면 한 결정** — 기본 CTA 하나, 보조 행동은 숨김
2. **숫자는 먼저 공개** — 예상 시간·감지 장수를 분석 시작 전 노출
3. **다음 액션은 시스템이 추천** — 갤러리 진입 즉시 베스트가 기본 선택된 상태
4. **결제는 2초** — (Phase 2 적용 시) 카카오페이 원탭 기본
5. **로딩은 스토리텔링** — "눈 감은 컷 17장 제외, 흔들림 8장 제외, 베스트 10장 선정"
6. **무료 재시도·수정 무제한** — 실수해도 되돌릴 수 있음

### Flow별 상세 스펙

#### Flow A · 단일 묶음 베스트

- **입력:** 이미지 파일 N장, 피사체 자동/수동(인물·반려동물·자동), 목표 장수
- **처리:** 썸네일 400px → pHash → 연사 그룹핑(Hamming≤10) → 씬 클러스터링(Hamming≤22) → 피사체 감지 → bbox Laplacian 선명도 → 채점·감점 → 씬 비례 할당 + maxPerGroup 그리디 선별
- **출력:** 갤러리 3탭(선택·제외·전체) → ZIP 다운로드
- **UX:** 단일 드롭존 → 자동 분석 → 로딩 스토리텔링 → 갤러리 진입 시 단일 CTA "이대로 받기"

#### Flow B · 폴더 병렬 셀렉 ★ (신규 구현 필요)

- **입력:** 폴더 여러 개 (`만삭/`, `베이비본/`, `100일/`, `돌/` 등)
- **처리:** 폴더별 독립 분석 (이벤트 태그 추정 → 피사체 자동 감지 → Flow A 동일 파이프라인)
- **출력:** 폴더 탭 UI `[만삭 12/15] [베이비본 18/20] ...`, 각 탭 안 갤러리, ZIP 내부 구조 = 입력 폴더 구조, 파일명 원본 유지
- **목표 장수 UX:** AI 자동 추천이 기본. "직접 입력할게요" 누르면 전체 폴더 일괄 입력 UI `[만삭:15][베이비본:20][100일:30][돌:40]`

#### Flow C · 앨범 템플릿 배치 (기존 AlbumContainer 유지 + 폴백 추가)

- **입력:** 템플릿 폴더(빈 액자/앨범 슬롯 구조) + 촬영 세션 폴더들
- **처리:** `parseTemplate()` 슬롯 배열 생성 → 세션 분석 → `autoAssign()` 슬롯 배치
- **출력:** 슬롯 편집 UI → 템플릿 폴더 구조 그대로 ZIP
- **개선:** 템플릿 파싱 실패 시 자동으로 Flow B로 폴백 ("템플릿을 못 읽었어요. 폴더 구조 그대로 셀렉만 도와드릴게요.")

### 공통 엔진 기능

- **AI 셀렉:** 인물 가중치 eyeOpen(35%)/sharpness(30%)/expression(20%)/facing(15%), 반려동물 sharpness(55%)/position(30%)/eyeEstimate(15%)
- **취향 학습:** 20장 스와이프 피드백 → 가중치 조정 → 즉시 재선별. Phase 1에 이벤트 태그별 영속화.
- **중복 제거(Phase 0):** `PastSelection` 구조로 pHash 지문 + 파일명만 IndexedDB 저장. 새 업로드 시 Hamming ≤ 8 대조 → "🔁 이전 세션에 사용됨" 뱃지 + 기본 제외. 계정 도입 대비 구조 호환 설계.
- **AI 보정(Phase 1):** Replicate API + CodeFormer + GFPGAN. 프리셋 3종(자연스럽게·스튜디오급·프로페셔널). 샘플 1장 10분 만료, 전체는 비동기 Queue + 완료 알림. 명시 동의 후 업로드, 24시간 내 서버 파기.
- **워터마크·저장 방지(Phase 1):** 프리뷰는 canvas 렌더 + 대각선 4방향 워터마크, 우클릭·드래그 차단. 결제(혹은 최종 ZIP) 후에만 원본 해상도 워터마크 없음.
- **세션 지속성(기구현):** IndexedDB 자동저장 3초 디바운스, 24h TTL, 재방문 복구 배너.

### 데이터 구조 — 추가될 타입

```ts
type EventTag =
  | "maternity" | "newborn" | "50days" | "100days"
  | "first_birthday" | "wedding" | "family"
  | "pet_profile" | "travel" | "other";

interface FolderSession {
  id: string;
  folderName: string;
  eventTag: EventTag | null;
  photoType: PhotoType;
  targetCount: number;        // AI 추천 or 사용자 입력
  photos: PhotoEntry[];
  selectedIds: Set<string>;
  groups: PhotoGroup[];
}

interface PastSelection {
  sessionId: string;
  eventTag: EventTag | null;
  selectedAt: number;
  fingerprints: {
    hash: string;             // BigInt 직렬화
    originalFileName: string;
  }[];
}

// AppState에 추가
interface AppState {
  // ... 기존
  flow: "A" | "B" | "C" | null;
  folderSessions: FolderSession[];
  pastSelections: PastSelection[];
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
- **FUSE 파일시스템:** 프로젝트 폴더 내 `rm -rf dist/` 불가, /tmp 도 기존 빌드 폴더 삭제 불가
- **빌드 명령:** `npx vite build --outDir /tmp/ddalgak-buildN --emptyOutDir` (N을 매번 증가시킴)
- **dist 업데이트:** 새 JS를 `dist/assets/`에 복사 후 `dist/index.html`의 src 속성 수정
- **배포:** 사용자가 터미널에서 `git commit && git push` → Vercel 자동 배포
- **git index.lock:** FUSE로 삭제 불가 → 막힐 때 사용자 터미널에서 `rm -f .git/index.lock`
- **FUSE 파일 변경 감지:** git이 Claude 수정 파일을 diff로 못 잡을 수 있음 → `git show HEAD:파일` 으로 커밋된 내용 확인 필수

### Vercel 배포 이슈 (중요)
- Vercel GitHub 자동 트리거가 간헐적으로 멈춤 → `npx vercel --prod` 로 수동 배포 필요
- 명령: `cd ~/Desktop/"vibe coding"/ddalgak-picks && npx vercel --prod`
- 첫 실행 시 브라우저 로그인 필요 (jungmoca90@gmail.com 구글 계정)
- projectId: `prj_5Z0q2wFkjWQgNnoHzwH9r3bdP1Gd`
- teamId / orgId: `team_QCXZxUDktkf2o1BPLrh0lVk7`
- GitHub 계정: IamMochaInSeoul

---

## 구현 완료 기능 (v0.1.4 기준)

### 랜딩 페이지 (Phase 0에서 3카드로 재설계 예정)
- 현재 버튼 2종: "사진만 셀렉하기" / "스튜디오 앨범용"
- **Phase 0 목표:** Flow A/B/C 3카드 명시 랜딩

### Flow A 엔진 (단일 묶음 베스트 — 거의 완성)
- 인물 / 반려동물 / 혼합 3가지 모드
- 2단계 pHash 그룹핑: 연사(Hamming≤10) + 씬(Hamming≤22)
- 씬별 비례 선별 (다양성 자동 보장)
- 얼굴 감지 5단계 파이프라인 (FaceLandmarker×4 + BlazeFace)
- 얼굴 bbox 영역만 선명도 측정 (보케 오판 방지)
- 인물 가중치: eyeOpen(35%) / sharpness(30%) / expression(20%) / facing(15%)
- 반려동물 가중치: sharpness(55%) / position(30%) / eyeEstimate(15%)
- maxPerGroup 설정 (1/2/3/5/무제한)
- 필터: 눈감음 제외 / 흔들림 제외 / 정면만 / 낮은신뢰도 제외
- 갤러리 3탭 (선택됨 / 제외됨 / 전체), 제외됨 감점 사유별 버킷
- 재추출 최대 5회, 더블클릭 상세 모달(줌 1~500% + 드래그 패닝), 우클릭 컨텍스트 메뉴
- 신뢰도 레이블: HIGH→확실한 최선 / LOW→유사 컷 다수
- 취향 재추출: 플로팅 배너 → 20장 카드 스와이프 피드백 → 가중치 조정 → 즉시 재선별, AI 기본 vs 내 취향 탭 비교

### 업로드 화면 (v0.1.4 개선)
- 폴더 드래그앤드롭: FileSystemEntry API로 재귀 읽기
- "🖼 사진 파일 선택" + "📁 폴더째 선택" 버튼 2종
- 폴더 읽는 동안 로딩 상태 표시
- 선택 초기화 버튼

### 세션 지속성 (v0.1.2)
- beforeunload 경고 (분석 중·갤러리)
- IndexedDB 자동저장 3초 디바운스 (24h TTL)
- 재방문 복구 배너
- ZIP용 파일 재첨부 배너 (파일명 매칭)

### Flow C 엔진 (앨범 템플릿 배치 — v0.1.3 기구현)
- 스튜디오 템플릿 폴더 파싱 (액자 capacity=1 / 앨범 스프레드 capacity=3 / 일반 capacity=2 자동 감지)
- 템플릿 업로드 피드백: 파싱 스피너 → 초록 성공카드 / 빨간 실패카드
- 다중폴더 드래그앤드롭 (v0.1.4: 파일 직접 드롭 fallback 추가)
- Google Drive 연동: GIS OAuth + Google Picker + Drive API 다운로드
  - 환경변수 미설정 시 Cloud Console 설정 가이드 모달 표시
  - 필요 env: `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`
- 세션 순서 조정 + AI 자동 배치(`autoAssign`: 액자부터 전체 선명도, 나머지 세션 비례) + 수동 배치
- ZIP 다운로드 (템플릿 폴더 구조 그대로)

### 기타
- ZIP 다운로드 / 파일명 복사
- 한국어/영어 전환 (i18n)

---

## 로드맵 — Phase별

### Phase 0 — 제품 정체성 완성 (3~4주)

> **목표:** "이 제품은 폴더 구조를 지켜주고, 과거를 기억하는 셀렉터다"를 사용자가 첫 방문에서 인지.

1. **랜딩 3카드 리디자인** — Flow A/B/C 명시 + 각 카드 "이런 분에게" 카피
2. **Flow B 신규 구현** — `FolderSessionContainer.tsx` (폴더 탭 래퍼 + 각 탭 Gallery 임베드)
3. **Flow C 폴백** — 템플릿 파싱 실패 시 자동으로 Flow B로 전환
4. **이벤트 태깅 사전** — `eventTagger.ts` (한국어 폴더명 매칭 + EXIF 촬영일)
5. **분석 로딩 스토리텔링** — "눈 감은 컷 N장 제외..." 실수치 단계별 노출
6. **갤러리 진입 단일 CTA** — 보조 행동은 아이콘 1열로 축소
7. **중복 제거 (IndexedDB 로컬)** — `dedupe.ts` + `pastSelectionStore.ts`
   - pHash 지문 + 파일명만 저장, 사진 원본은 안 보냄
   - Hamming ≤ 8 매칭 시 "🔁 이전 세션에 사용됨" 뱃지 + 기본 제외
   - 계정 도입 대비 데이터 구조 호환 설계

### Phase 1 — 프리미엄 업셀 + 재방문 엔진 (4~6주)

> **목표:** 셀렉+보정 풀 스택 제공 + 재방문 시 가치 증가 체감.

8. **취향 학습 영속화** — 이벤트 태그별 가중치 세트 IndexedDB 저장
9. **워터마크 프리뷰 + 저장 방지** — canvas 렌더 + 대각선 4방향 워터마크, 우클릭·드래그 차단
10. **ZIP UX 개선** — 진척률 + 완료 토스트 + 재다운로드 버튼
11. **AI 보정 (샘플 + 전체)**
    - Replicate API + CodeFormer + GFPGAN
    - 샘플 1장: 명시 동의 → Before/After 슬라이더 → 10분 만료
    - 전체: 비동기 Queue → 완료 시 알림 → 워터마크 없는 보정 ZIP
    - 프리셋 3종: 자연스럽게 / 스튜디오급 / 프로페셔널

### Phase 2 — 비즈니스 레이어 (나중, 이번 기획 범위 밖)

- 계정 시스템 (소셜 로그인 + UUID 어뷰징 방지)
- 서버 지문 동기화 (중복 제거 기기 간 이전)
- 결제 (토스페이먼츠 — 카카오페이·네이버페이·카드)
- 알림톡 CRM (라이프사이클 할인 재방문 루프)
- 광고 슬롯 (네이티브, Flow A·무료 유저 대상)
- 가격 체계 확정

---

## 주요 파일 구조

```
src/
├── components/
│   ├── AppShell.tsx         ← beforeunload + 세션 자동저장 + 복구 배너
│   ├── Landing.tsx          ← Phase 0에서 3카드로 재작성 예정
│   ├── TypeSelect.tsx       ← Flow A 피사체 선택
│   ├── Upload.tsx           ← 파일/폴더 업로드 + maxPerGroup (v0.1.4)
│   ├── Analysis.tsx         ← Phase 0에서 스토리텔링 로딩 강화
│   ├── Gallery.tsx          ← Flow A 메인 (가장 큰 파일, 복잡)
│   ├── FeedbackMode.tsx     ← 카드 스와이프 취향 피드백
│   ├── PhotoCard.tsx
│   ├── PhotoModal.tsx       ← 줌·패닝 모달
│   ├── AlbumContainer.tsx   ← Flow C 전체 (파싱 + 배치 + ZIP)
│   ├── LangToggle.tsx
│   └── ErrorBoundary.tsx
│   ── (Phase 0 신규)
│   ├── FolderSessionContainer.tsx   ← Flow B 메인 (신규)
│   └── FolderTabBar.tsx             ← 폴더 탭 UI (신규)
├── lib/
│   ├── types.ts             ← 전체 타입 + AppState (flow/folderSessions/pastSelections 추가 예정)
│   ├── albumTypes.ts        ← Flow C 전용 타입 + FolderSession/PastSelection 추가 예정
│   ├── store.ts             ← Zustand
│   ├── analyzer.ts          ← 분석 파이프라인 진입점 (Flow B에서 폴더별 호출)
│   ├── scorer.ts            ← 채점 + 씬 다양성 선별 (공통)
│   ├── phash.ts             ← pHash + Hamming + 씬 클러스터링 (공통, 중복제거도)
│   ├── laplacian.ts         ← Laplacian variance
│   ├── feedbackLearning.ts  ← 취향 재추출 알고리즘
│   ├── sessionPersist.ts    ← IndexedDB 세션 저장/복구
│   ├── i18n.ts
│   ── (Phase 0 신규)
│   ├── eventTagger.ts               ← 폴더명·EXIF → EventTag 추정 (신규)
│   ├── dedupe.ts                    ← 과거 지문 대조 (신규)
│   └── pastSelectionStore.ts        ← IndexedDB 지문 저장소 (신규)
├── messages/
│   ├── ko.json
│   └── en.json
dist/
├── index.html               ← 현재 참조: index-BvGccAyR.js
└── assets/
    ├── index-BvGccAyR.js    ← v0.1.4 빌드 (최신, GitHub 커밋 완료)
    ├── index-BPphCvQy.js    ← v0.1.3 빌드
    ├── index-Dduc-P9a.js    ← v0.1.2 빌드
    ├── index-C4CHNhkV.css
    ├── jszip.min-CZkjPKPL.js ← v0.1.4 빌드용
    ├── jszip.min-Dg5IA1G5.js ← 구버전
    └── vision_bundle-Df2dKBJJ.js
```

---

## 버전 히스토리

| 버전 | 내용 | 배포 상태 |
|------|------|-----------|
| v0.1.1 | 초기 릴리즈: 사진 선별 + 취향 재추출 | ✅ 배포됨 |
| v0.1.2 | 세션 지속성 (beforeunload + IndexedDB) | ✅ 배포됨 |
| v0.1.3 | 앨범 기능 (피드백 + 다중폴더 + Google Drive) | ✅ GitHub 커밋 완료 |
| v0.1.4 | 랜딩 텍스트 + 업로드 폴더 버그 수정 + 드롭 안정화 | ⏳ GitHub 커밋 완료, Vercel 수동 배포 필요 |
| v0.2.0 | **(Phase 0 목표)** 랜딩 3카드 + Flow B 신규 + 이벤트 태깅 + 중복제거 | 예정 |

---

## 커밋 방법 (사용자 터미널)

```bash
cd ~/Desktop/"vibe coding"/ddalgak-picks
rm -f .git/index.lock

# 소스 스테이징 (변경된 파일만)
git add src/[변경파일들]

# dist 강제 추가 (빌드 후 새 해시 파일)
git add -f dist/index.html dist/assets/index-[새해시].js

git commit -m "feat: 설명 (vX.Y.Z)"
git push origin main

# Vercel 자동 배포가 안 될 경우 수동 배포:
npx vercel --prod
```

### 다음 세션 시작 시 필요한 작업
- v0.1.4 Vercel 배포 완료 여부 확인
- 미배포라면: `cd ~/Desktop/"vibe coding"/ddalgak-picks && npx vercel --prod`
- Phase 0 작업 진입 지점: 랜딩 3카드 리디자인(`Landing.tsx`) → Flow B 골격(`FolderSessionContainer.tsx`)
