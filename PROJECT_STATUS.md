# 딸깍픽스 (ddalgak-picks) — PROJECT STATUS

> **마지막 업데이트:** 2026-05-04
> **현재 버전:** **v0.5.0 머지 완료 + Stage D1 부분 진행 중**
>   ─ Stage A(v0.4.0) ✅ / Stage B(v0.4.1) ✅ / Stage C(v0.5.0) ✅
>   ─ Stage D1 후속 커밋: 분석 스토리텔링(c077783) ✅ / Drive·ZIP 진행률(1c68db8) ✅
>   ─ 미머지 푸시 상태(main 직접 커밋) — 다음 세션에서 Stage D1 잔여 묶음 정리 후 v0.5.1 태그 권장
> **package.json version:** 0.3.0 ⚠️ (실코드 v0.5.0 대비 dirty — Stage D1 묶음 종료 시 일괄 갱신)
> **배포 URL:** https://ddalgak-picks.vercel.app
> **GitHub:** https://github.com/IamMochaInSeoul/ddalgak-picks (main 브랜치)

---

## 프로젝트 개요

- **무엇:** 수백~수천 장 사진 중 원하는 만큼 AI가 골라주는 웹앱
- **누가:** 비개발자 Minhyup (민현). 아이디어만 제공, 모든 기획·설계·개발·QA·배포는 Claude가 담당
- **스택:** Vite 5 + React 18 + TypeScript + Zustand 5 + MediaPipe tasks-vision@0.10.34 + face-api.js(얼굴 임베딩) + JSZip + Vercel 정적 배포 + Supabase Edge Functions(결제 검증, 비활성)

---

## 제품 전략 — 기능 기획 v2 (2026-04-27 확정 / 2026-05-04 보강)

> **이 섹션은 모든 기능 결정의 상위 기준이다. 후속 세션의 Claude는 기능 변경·추가 시 이 섹션과 충돌하는지 먼저 확인할 것.**

### 핵심 문제 (JTBD)

> "스튜디오가 준 폴더 구조(만삭/베이비본/100일/돌) 그대로, 각 폴더에서 베스트 N장씩 셀렉해서, **똑같은 폴더 구조로** ZIP 돌려보내기 — 3시간 작업을 10분으로."

핵심 타겟: **스튜디오에서 원본 앨범을 받아 셀렉 후 다시 스튜디오에 보내야 하는 신혼부부·육아맘·반려동물 부모.** 보조 타겟: 여행·일상 사진 중 S급만 추리고 싶은 일반 유저.

### 제품 톤 — "다크룸의 큐레이터"

Stage A(v0.4.0)에서 도입. 이모지·느낌표 0, 세리프 디스플레이(Display 컴포넌트) + JetBrains Mono 수치(MonoNumber), 액센트 골드(#C9A961), 다크 배경. 카피는 큐레이터의 작품 노트 톤 — `"NOTES 없음 — 흠잡을 데 없는 컷입니다."` `"이벤트별로 베스트 컷을 분배하는 중입니다."`

### UX 플로우 구조 (v2)

```
Landing (2카드)
├── 사진만 셀렉 ──────────────→ TypeSelect → Upload → Analysis → Gallery
│    돌잔치·여행·일상
│
└── 스튜디오용 셀렉 ──────────→ StudioTypeSelect (분기 화면)
     스튜디오·웨딩·돌스냅           │
                                   ├── 셀렉용 폴더 있어요 (Flow B)
                                   │   → FolderUpload → Analysis → [PersonSelect] → FolderGallery
                                   │                                         ├── ZIP 저장
                                   │                                         └── 앨범 배치하기 → AlbumContainer
                                   │
                                   └── 사진만 있어요 (Flow C)
                                         → FolderUpload → Analysis → [PersonSelect] → FolderGallery
                                                                                       └── ZIP 저장만
```

> **v0.5.0부터의 변화:** 분석 단계 직후 `VITE_FEATURE_PERSON_CLUSTERING=true`이면 **PersonSelect**(주인공 선택) 화면이 자동 삽입됨. 미선택 시 등장 횟수 1위 자동 주인공.

**핵심 설계 원칙:** "앨범 배치"는 랜딩에서 꺼내지 않는다. 스튜디오용 경로에서 셀렉 완료 후 자연스럽게 이어지는 다음 단계로 노출한다.

### Flow 별 상세

#### Flow A · 사진만 셀렉 (개인용)
- **입력:** 이미지 파일 N장 or 단일 폴더
- **처리:** TypeSelect(인물/반려동물/혼합) → 썸네일 400px → pHash → 연사 그룹핑(Hamming≤10) → 씬 클러스터링(Hamming≤22) → 얼굴 감지(5단계) → bbox Laplacian → 채점·감점(B급 정밀화 포함) → [얼굴 임베딩 + 인물 클러스터링 + 주인공 선택] → heroBonus 적용 → 씬 비례 그리디 선별
- **출력:** 갤러리 3탭(선택/제외/전체) + 그룹 비교 모달 → ZIP
- **상태:** ✅ 완전 구현 (v0.5.0)

#### Flow B · 스튜디오 폴더 셀렉 + 앨범 배치
- **입력:** 폴더 여러 개(만삭/베이비본/100일/돌 등) + Google Drive 폴더
- **처리:** 폴더별 독립 분석(이벤트 태그 자동 추정 + 추천 장수 자동 + Flow A 동일 파이프라인). 헝가리안 매칭으로 폴더 간 동일인 통합(성장앨범 핵심).
- **출력:** 폴더 탭 UI → 폴더 구조 보존 ZIP → 앨범 배치로 이어가기
- **상태:** ✅ 완전 구현 (v0.5.0)

#### Flow C · 스튜디오 폴더 셀렉 + ZIP만
- 입력·처리는 Flow B와 동일, 출력은 ZIP까지
- **폴백:** AlbumContainer 파싱 실패 시 FolderGallery로 자동 전환
- **상태:** ✅ 완전 구현 (v0.5.0)

#### 앨범 배치 (AlbumContainer) — Flow B 이후 단계
- 템플릿 폴더(빈 액자/앨범 슬롯) + 촬영 세션 폴더 → `parseTemplate()` → `autoAssign()` → 슬롯 편집 UI → 템플릿 구조 그대로 ZIP
- **상태:** ✅ v0.1.3 기구현, Flow B에서 연결됨

### 핵심 차별점 (5가지 → v0.5.0에서 6가지)

1. **폴더 구조 유지 셀렉** — 경쟁사가 못하는 본질적 차별점
2. **이벤트 자동 태깅** — 폴더명에서 만삭/베이비본/100일/돌 자동 분류 + 태그별 추천 장수
3. **중복 제거 — 과거 셀렉 기억하는 AI** — pHash 지문 이력 기반 ✅
4. **B급 정밀화 (v0.4.1 추가)** — 활짝 웃음 vs 진짜 눈감음 / 인물 아웃포커싱 vs 흔들림 / 저조도 노이즈 분리
5. **F18 인물 자동 클러스터링 + 주인공 선택 (v0.5.0 추가)** — 얼굴 임베딩 100% 브라우저 내 처리. 같은 임베딩이 다음 세션에서 감지되면 displayName 자동 부여 ("〈아기 지유〉 중심 셀렉")
6. **AI 보정 샘플 → 전체** — Phase 1 후순위, 별도 결제 모듈 (미시작)

---

## 기술 제약 (매 세션 반드시 숙지)

### Zustand 규칙

```
❌ useStore((s) => ({ a: s.a, b: s.b }))  → React Error #185 무한루프!
✅ const a = useStore((s) => s.a)          → 개별 셀렉터만 사용
```

### 빌드·배포 절차 (2026-04-29 보안사고 이후 확정)

> ⚠️ **dist/ 커밋 절대 금지** — Vite는 VITE_* 환경변수를 번들에 인라인한다. dist/를 커밋하면 API 키가 GitHub에 노출된다. 실제 사고 발생 이력 있음 (2026-04-29).

**올바른 배포 순서:**
```bash
# 1. 소스 파일만 스테이징 (dist/ 절대 포함 금지)
cd ~/Documents/Claude/Projects/"vibe coding"/ddalgak-picks
git add src/ public/ index.html vercel.json package.json supabase/

# 2. 커밋
git commit -m "feat: ..."

# 3. push + Vercel 소스 빌드 배포
git push && npx vercel --prod
```

**빌드(타입 체크·로컬 확인용):**
```bash
npx vite build --outDir /tmp/ddalgak-buildN   # N은 매번 증가. 현재 build11~12 권장
```

**사전 push 보안 게이트 (PRE_PUSH_SECURITY_CHECKLIST §8):**
```bash
git diff --staged | grep -E "VITE_|AIza|ya29"  # 출력 없어야 안전
```

자세한 8단계 체크리스트는 `PRE_PUSH_SECURITY_CHECKLIST.md`. 모든 push 전 반드시 통과.

### 환경변수

| 변수 | 용도 | 등록 위치 | 상태 |
|------|------|-----------|------|
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth | `.env` + Vercel | ✅ |
| `VITE_GOOGLE_API_KEY` | Google Picker / Drive API | `.env` + Vercel (도메인 제한) | ✅ |
| `VITE_SUPABASE_URL` | Supabase | Vercel | ⚠️ (값 미확정) |
| `VITE_SUPABASE_ANON_KEY` | Supabase Anon | Vercel | ⚠️ 미등록 |
| `VITE_ADSENSE_CLIENT_ID` | AdSense (`ca-pub-7332731589854643`) | Vercel | ✅ (재심사 대기) |
| `VITE_PORTONE_STORE_ID` | PortOne 결제 | Vercel | ⚠️ 미등록 (결제 비활성) |
| `VITE_PORTONE_CHANNEL_KEY` | PortOne 결제 | Vercel | ⚠️ 미등록 |
| `VITE_FEATURE_PAYMENT` | 결제 게이트 토글 | Vercel | `false` (dev bypass) |
| `VITE_FEATURE_PERSON_CLUSTERING` | F18 PersonSelect 토글 | Vercel | 토글 가능 |
| (미등록) `VITE_GA_MEASUREMENT_ID` | GA4 (Stage D1 §2-6 예정) | — | 미발급 |

### Vercel / 계정 정보

- **projectId:** `prj_5Z0q2wFkjWQgNnoHzwH9r3bdP1Gd`
- **teamId / orgId:** `team_QCXZxUDktkf2o1BPLrh0lVk7`
- **GitHub 계정:** IamMochaInSeoul
- **Google 계정:** jungmoca90@gmail.com
- **올바른 프로젝트 경로:** `~/Documents/Claude/Projects/"vibe coding"/ddalgak-picks`

---

## 구현 완료 기능 현황 (v0.5.0 + Stage D1 부분 진행)

### ✅ Stage A — 큐레이터 톤 디자인 (v0.4.0, 4ab93bd)

- **디자인 토큰** (`globals.css`): 다크 배경, 액센트 골드 #C9A961, 따뜻한 오프화이트 텍스트
- **세리프 디스플레이** + JetBrains Mono 수치 폰트 로드
- **Display / MonoNumber** 컴포넌트 도입 — 모든 큰 숫자·헤드라인은 이 컴포넌트로
- **이모지·느낌표 일괄 제거**, `messages/ko.json` 큐레이터 톤 카피 리라이트

### ✅ Stage B — 누락 기능 보완 1 (v0.4.1, 898ee6a)

#### F20 — 토스식 직관 UX 강제
- `src/components/ui/PrimaryButton.tsx` — 화면당 1개 룰, 액센트 골드
- `src/components/ui/SecondaryButton.tsx` — 보더만, 채움 없음
- `src/components/ui/TextLink.tsx` — secondary 색상 + 호버 밑줄
- 핵심 화면(Landing, StudioTypeSelect, FolderUpload, FolderGallery 등) 마이그레이션 완료

#### F3 강화 — 폴더별 추천 장수
- `src/lib/recommendedCount.ts` — 이벤트 태그별 추천 (만삭=10/신생아=15/100일=30/돌=50/웨딩=80…)
- 폴더 카드에 추천 장수 자동 적용 + 전체 합계 실시간 표시

#### F4 강화 — B급 정밀화
- 새 감점 코드: `EYE_SQUINT_SMILE`(웃음으로 가는 눈, 감점 없음) / `BLUR_AESTHETIC_BOKEH`(인물 아웃포커싱, 감점 없음) / `BLUR_NOISE`(저조도 노이즈, 경미한 감점)
- `src/lib/eye.ts` — EAR 시계열 + 입꼬리 각도 + 뺨 융기로 활짝 웃음 분류
- 얼굴 영역 Laplacian만 검사하여 인물 아웃포커싱 보호

#### F5 강화 — 유사컷 그룹 비교 모달
- `src/components/GroupCompareModal.tsx` — 그룹 5장을 격자로, 사용자가 베스트 교체
- `src/lib/sceneChange.ts` — 의상·배경 변화 감지 (색 히스토그램 + 픽셀 영역 변화율)

#### 닉네임 캡처 + 호명 (PERSONALIZATION §4)
- `src/components/NicknameCaptureModal.tsx` — 첫 ZIP 다운로드 시점에 1회 권유
- `src/components/UserAddress.tsx` — `"민협님"` 호명을 5곳에 자동 삽입 (랜딩, 분석 완료, 갤러리 헤더, 폴더 카드, ZIP 토스트)
- `src/lib/userProfile.ts` — IndexedDB 프로필 저장 + sessionCount 누적

### ✅ Stage C — F18 인물 클러스터링 + 주인공 선택 (v0.5.0, 673c92d)

- `src/lib/faceEmbedding.ts` — face-api.js 모델 로딩(`public/models/`) + 얼굴 임베딩 생성 (100% 브라우저 내)
- `src/lib/personClustering.ts` — 온라인 증분 클러스터링 + 헝가리안 폴더 간 통합 (성장앨범 핵심)
- `src/lib/gazeEstimation.ts` — iris landmark 기반 카메라 응시 추정
- `src/lib/heroScore.ts` — heroBonus 알고리즘
  - AND 모두 등장 +25 / OR 한 명 등장 +15 / 미등장 -10 (BLOCK 아님 — 가족컷 보호)
  - 면적 ≥10% +5 / 응시 +5 / 중앙 ±20% +3 / clamp(-10, 25)
- `src/components/PersonSelect.tsx` — 분석 직후 자동 진입, 인물별 대표 카드 + AND/OR 토글 + 이름 입력
- **이름 영속화:** `userProfile.heroPersonNames[personId]` IndexedDB 저장 → 다음 세션 자동 부여
- **결과 화면 결합 (43a0bec):** `"민협님의 〈아기 지유〉 중심 셀렉. 80장."`
- **개인정보처리방침 보강 (c797117):** "얼굴 임베딩은 브라우저에서만 처리됨" 항목 추가
- **토글:** `VITE_FEATURE_PERSON_CLUSTERING` 환경변수로 켜고 끔

### ✅ Stage D1 부분 진행 — 분석 스토리텔링 + Drive·ZIP 진행률

#### 분석 로딩 스토리텔링 (c077783, PHASE1_PLAN §1-1)
- `analyzer.ts`에 `onProgress(stage, payload)` 콜백 추가
- `AnalysisStage` 타입: `received|thumbnail|phash|burst_group|scene_cluster|face_detect|face_embed|person_cluster|gaze|scoring|selection|done`
- `StorySnapshot`: 누적 카운터 (eyeClosedFound, blurFound, sideFaceFound, pastDupeFound, personsFound, sCandidates 등)
- `Analysis.tsx` — 큐레이터 톤 누적 카운터 표 (모노 숫자 + 세리프 이탤릭 단계명)

#### Drive 통합 + ZIP 진행률 (1c68db8, PHASE1_PLAN §1-5 부분)
- Upload.tsx Drive 연동 (Flow A에도 Drive 진입 가능)
- ZIP 생성 진행률 표시 (`generateAsync` 콜백)

### ✅ 기존 자산 (v0.3.x 시점에 완성된 부분)

#### 랜딩 / 분기 / 업로드
- Landing 2카드 (사진만/스튜디오용) + SEO 최적화 (title·description·OG·`<noscript>` 한국어)
- StudioTypeSelect — "셀렉용 폴더 있어요" / "사진만 있어요"
- FolderUpload — 다중 폴더 드래그앤드롭(FileSystemEntry 재귀) + 이벤트 태그 자동·수동 + 목표 장수 프리셋 + maxPerGroup
- Google Drive 백그라운드 다운로드 (비블로킹 큐) + DriveDownloadBanner (전 화면 플로팅 + 브라우저 알림)

#### 갤러리
- FolderGallery — 폴더별 순차 분석(MediaPipe 메모리 충돌 방지), 탭 상태(⏳/✓/⚠️), 선택/제외/전체 3탭, 감점 사유 한국어 배지, **🔁 이전 배지**(과거 세션 사용)
- Gallery (Flow A) — 3탭 + 재추출 5회 + 줌 모달(1~500% 패닝) + 우클릭 컨텍스트 + 신뢰도 레이블

#### 과거 세션 중복 제거
- `pastSelectionStore.ts` — IndexedDB `ddalgak-dedupe`. pHash(BigInt→string) + filename + sessionId 저장 (원본 픽셀 미저장)
- `dedupe.ts` — `findPastDupes()` Hamming ≤ 8 매칭

#### 셀렉 엔진
- 인물 / 반려동물 / 혼합 3가지 모드 + 5단계 얼굴 감지 (FaceLandmarker×4 + BlazeFace)
- 인물 가중치: eyeOpen(35)/sharpness(30)/expression(20)/facing(15) + heroBonus(0~25)
- 반려동물: sharpness(55)/position(30)/eyeEstimate(15)
- maxPerGroup (1/2/3/5/무제한) + 필터 4종

#### 취향 재추출
- FeedbackMode — 카드 스와이프 20장 → 가중치 조정 → 즉시 재선별
- AI 기본 vs 내 취향 탭 비교 (현 시점 in-session만, 영속화는 Stage D2)

#### 세션 지속성
- beforeunload 경고 + IndexedDB 자동저장 3초 디바운스 (24h TTL) + 재방문 복구 배너

#### 결제 인프라 (비활성)
- `src/lib/payment.ts` — PortOne V2 requestPayment / verifyPayment
- `src/components/PaymentGate.tsx` — 모달 (싱글 4,900 / 패키지 15,000 임시값)
- `supabase/functions/verify-payment/index.ts` — Deno Edge Function 배포 완료
- **dev bypass:** `VITE_FEATURE_PAYMENT !== "true"` 시 결제 스킵, `isPaid=true` 진행

#### 워터마크 / 파일명 마스킹
- `src/lib/watermark.ts` — OffscreenCanvas 대각선 3개소, JPEG q0.88
- `src/lib/displayName.ts` — `"아기-001 빛나는 순간.jpg"` MOOD+MOMENT seed 기반

#### 수익화 인프라 (대기)
- AdSense `public/ads.txt` 배포 완료 (재심사 대기 1~2주)
- 개인정보처리방침 `/privacy` 페이지 (vercel.json rewrite)

#### 정확도 측정 (개발자용)
- `scripts/bench-b-grade.mjs` / `bench-person.mjs` / `bench-gaze.mjs`
- `npm run bench:all` — F1·FPR 게이트 fail 시 exit 1
- `data/benchmark/*/labels.json` 템플릿 (실제 라벨은 비어 있음)

---

## 주요 파일 구조 (실제 코드 기준)

```
src/
├── components/
│   ├── ui/
│   │   ├── PrimaryButton.tsx        ← Stage B: 화면당 1개 룰
│   │   ├── SecondaryButton.tsx
│   │   ├── TextLink.tsx
│   │   └── index.ts
│   ├── AppShell.tsx                 ← 스텝 라우팅 + 세션 자동저장 + 복구 배너 + ToastContainer + DriveDownloadBanner
│   ├── Landing.tsx                  ← 2카드 (사진만/스튜디오용) + SEO
│   ├── StudioTypeSelect.tsx         ← 셀렉용 폴더 有無 분기
│   ├── TypeSelect.tsx               ← Flow A 피사체 선택
│   ├── Upload.tsx                   ← Flow A 업로드 (Drive 연동 + ZIP 진행률)
│   ├── FolderUpload.tsx             ← 다중 폴더 드롭존 + Drive 백그라운드 다운로드
│   ├── DriveDownloadBanner.tsx      ← 전 화면 플로팅 다운로드 배너
│   ├── Analysis.tsx                 ← 분석 로딩 (Stage D1 스토리텔링 §1-1 적용 완료)
│   ├── PersonSelect.tsx             ← Stage C: 인물 클러스터링 후 주인공 선택 (F18)
│   ├── Gallery.tsx                  ← Flow A 메인 갤러리 + PaymentGate + 워터마크
│   ├── FolderGallery.tsx            ← 폴더별 탭 갤러리 + 선/제/전 + 감점배지 + 🔁 + ZIP
│   ├── PhotoCard.tsx
│   ├── PhotoModal.tsx               ← 줌·패닝 (Stage D1 §2-1 PhotoDetailModal 확장 예정)
│   ├── GroupCompareModal.tsx        ← Stage B: 유사컷 5장 격자 비교
│   ├── FeedbackMode.tsx             ← 카드 스와이프 취향 피드백
│   ├── AlbumContainer.tsx           ← 앨범 배치 + Flow C 폴백
│   ├── NicknameCaptureModal.tsx     ← Stage B: 닉네임 1회 권유
│   ├── UserAddress.tsx              ← Stage B: 호명 컴포넌트
│   ├── Display.tsx                  ← Stage A: 세리프 디스플레이 슬롯
│   ├── MonoNumber.tsx               ← Stage A: 모노 수치 슬롯
│   ├── PaymentGate.tsx              ← PortOne V2 모달 (비활성)
│   ├── Toast.tsx                    ← 글로벌 토스트 이벤트 버스
│   ├── LangToggle.tsx
│   └── ErrorBoundary.tsx
│
├── lib/
│   ├── types.ts                     ← AppState/Flow/EventTag/AnalysisStage/HeroConfig/PaymentSession 등
│   ├── albumTypes.ts                ← AlbumContainer 전용
│   ├── store.ts                     ← Zustand (driveQueue 전역 + 모든 액션)
│   ├── analyzer.ts                  ← 분석 파이프라인 (onProgress 콜백 추가)
│   ├── scorer.ts                    ← 채점 + 씬 다양성 그리디
│   ├── phash.ts                     ← pHash + Hamming + 씬 클러스터링
│   ├── laplacian.ts                 ← Laplacian variance
│   ├── eye.ts                       ← Stage B: EAR 시계열 + 활짝 웃음 분류
│   ├── sceneChange.ts               ← Stage B: 의상·배경 변화 감지
│   ├── recommendedCount.ts          ← Stage B: 이벤트 태그별 추천 장수
│   ├── faceEmbedding.ts             ← Stage C: face-api.js 임베딩
│   ├── personClustering.ts          ← Stage C: 온라인 클러스터링 + 헝가리안
│   ├── gazeEstimation.ts            ← Stage C: iris 응시 추정
│   ├── heroScore.ts                 ← Stage C: heroBonus 알고리즘
│   ├── eventTagger.ts               ← 폴더명·EXIF → EventTag
│   ├── pastSelectionStore.ts        ← IndexedDB 지문 저장
│   ├── dedupe.ts                    ← Hamming 기반 중복 감지
│   ├── feedbackLearning.ts          ← 취향 재추출 (in-session만)
│   ├── userProfile.ts               ← 닉네임·sessionCount·heroPersonNames IndexedDB
│   ├── useUserProfile.ts            ← React hook
│   ├── googleDrive.ts               ← GIS OAuth + Picker + Drive API (공용 lib)
│   ├── sessionPersist.ts            ← IndexedDB 세션 저장/복구
│   ├── displayName.ts               ← 파일명 마스킹 MOOD+MOMENT
│   ├── watermark.ts                 ← OffscreenCanvas 대각선
│   ├── payment.ts                   ← PortOne V2 (비활성)
│   └── i18n.ts
│
├── messages/
│   ├── ko.json                      ← 큐레이터 톤 카피 (코드 내 한국어 하드코딩 금지)
│   └── en.json
│
public/
├── ads.txt                          ← AdSense 인증
├── privacy.html                     ← 개인정보처리방침 (얼굴 임베딩 항목 포함)
└── models/                          ← face-api.js 모델 (Stage C)
│
supabase/
└── functions/verify-payment/index.ts  ← PortOne 검증 Edge Function (배포 완료)
│
scripts/
├── bench-b-grade.mjs / bench-person.mjs / bench-gaze.mjs
└── download-face-models.sh
│
PROJECT_STATUS.md / PHASE1_PLAN.md / DESIGN_DIRECTION.md /
PERSONALIZATION_PLAN.md / SECURITY.md / PRE_PUSH_SECURITY_CHECKLIST.md /
HANDOFF_2026-04-28.md / CLAUDE_CODE_PROMPT_v0.4.0_STAGE_A.md /
CLAUDE_CODE_PROMPT_MISSED_FEATURES.md / CLAUDE_CODE_PROMPT_REMAINING_WORK.md /
PRODUCT_STRATEGY_REVIEW_2026-04-23.md / docs/v3-plan/{PRD,TECH_SPEC,INITIAL_PROMPT,README}.md
```

---

## 보안 이력

### 2026-04-29 VITE_GOOGLE_API_KEY 노출 사고

- **원인:** `git add -f dist/` 포함 커밋 → GitHub 공개 저장소에 번들된 API 키 노출
- **조치:** GitGuardian 알림 → 기존 키 삭제 → 새 키 발급 + 도메인 제한 → Vercel 환경변수 교체 → SECURITY.md 작성
- **재발 방지:** `dist/` 커밋 절대 금지, 배포는 소스 파일만 커밋 + `npx vercel --prod`로 Vercel이 빌드. 모든 push 전 PRE_PUSH_SECURITY_CHECKLIST 통과 강제.

---

## 로드맵

### ✅ Phase 0 — 전부 완료 (v0.3.x)

랜딩 2카드 / StudioTypeSelect / FolderUpload / FolderGallery / 중복 제거 / Flow C 폴백 / Drive 백그라운드 + 배너 / AdSense ads.txt / 개인정보처리방침 / 보안 절차 확립.

### ✅ Phase 1 — Stage A·B·C 완료 (v0.4.0 → v0.5.0)

- **Stage A (v0.4.0)** — 큐레이터 톤 디자인 토큰·세리프·이모지 제거
- **Stage B (v0.4.1)** — F20 UX 강제 + F3 추천장수 + F4 B급 정밀화 + F5 그룹 비교 모달 + 닉네임 캡처/호명
- **Stage C (v0.5.0)** — F18 인물 클러스터링 + 주인공 선택 + 응시 추정 + heroBonus

### 🟡 Phase 1 — Stage D1 진행 중 (v0.5.1 목표)

> Stage D1 6묶음 중 2묶음만 main에 직접 푸시된 상태. 나머지 4묶음을 별도 브랜치로 정리해서 v0.5.1 태그 권장.

#### v0.5.1-pre · 디자인 v2 갭 패치 (선행 PR)

> **이 PR은 Stage D1 잔여보다 먼저** 머지된다. 이유: §9-1 갭(Landing.tsx 위반 5건)은 이후 모든 화면 작업의 기준이 되는 디자인 토큰·컬러·모바일 레이아웃 결정을 먼저 확정해야 하기 때문.
>
> **브랜치:** `feat/design-v2-gap-patch` / **태그:** `v0.5.0-design-stable`
> **작업 프롬프트:** `CLAUDE_CODE_PROMPT_DESIGN_V2_PATCH.md`
> **참조:** `DESIGN_DIRECTION.md` §9~§12 (v2 보강)

| # | 항목 | 출처 |
|---|------|------|
| 1 | 액센트 컬러 골드(#C9A961) → **잉크 블루 #2D4356** 교체 (tokens.css) | §9-2 |
| 2 | Landing.tsx 갭 5건 해소 (이모지·radius20·boxShadow·translateY·accentRgb 보라) | §9-1-A |
| 3 | `.badge-high` 형광 그린(#22c55e) → 차분한 그린(#6B8B5A) | §9-2-C |
| 4 | messages/ko.json AI 마케팅 금지어 grep + 정정 | §9-4-B |
| 5 | 모바일 Breakpoints + clamp 타이포 + iOS Safari safe-area + 100dvh | §10 |

이 PR이 머지되면 v0.5.1-pre 태그를 박고 Stage D1 잔여(사진 상세 모달·온보딩·재방문 배너·GA4)를 그 위에 얹어 v0.5.1 본 PR 진행.

#### v0.5.2 · 성능·영속·안내·가독·인물 인지 (배포 후 사용자 피드백 반영)

> **배경 (2026-05-04 사용자 피드백):** 배포 후 실사용에서 4가지 문제 + F18 기능 노출 누락 1건이 발견됨. 단일 PR로 5묶음 처리.
>
> **브랜치:** `feat/perf-persist-clarity-v0.5.2` / **태그:** `v0.5.1-stable` (직전 안정점)
> **작업 프롬프트:** `CLAUDE_CODE_PROMPT_v0.5.2_PERFORMANCE.md`
> **선행 조건:** v0.5.1-pre(디자인 v2 갭 패치) 머지 완료 후 진행

| # | 항목 | 핵심 변경 |
|---|------|----------|
| 1 | **Drive 다운로드 병렬화** | `FolderUpload.tsx`의 직렬 for 루프 → 동시성 8개 컨트롤러. 1,000장 다운로드 약 200초 → 약 25초로 단축 |
| 2 | **OPFS 사진 영속화** | `src/lib/opfsStore.ts` 신규. 폴더 세션의 원본 Blob을 OPFS에 자동 저장. 새로고침/재방문 시 ZIP 다운로드·재분석 가능 |
| 3 | **백그라운드 안내 + beforeunload + Notification** | DriveDownloadBanner 카피 보강("다른 화면 보셔도 됩니다"). 다운로드 중 페이지 떠나기 시 명시 경고. Notification 권한 권유 자동화 |
| 4 | **텍스트 명도 토큰 상향** | `--text-secondary: #A39B89 → #C5BBA5` (luma 158→190) / `--text-tertiary: #6B6555 → #8E8470` (luma 102→138). WCAG AA 안전 통과 |
| 5 | **F18 default-on + PersonSelect 가시성 보강 ★** | `Analysis.tsx:132` 환경변수 분기 → 기본 ON으로 전환 (`VITE_FEATURE_PERSON_CLUSTERING !== "false"`). PersonSelect UX 강화: 인물 1명만 감지돼도 "이 분이 주인공이에요?" 확인 1단계 / 진입 카피 강화 / 폴더별 인물 진척 표시 |

**중요:**
- F18 기능은 v0.5.0(673c92d)에 머지됐으나 `.env.example` 기본값이 `false`였고 Vercel에 명시 등록되지 않아 **배포 환경에서 한 번도 사용자에게 노출되지 않은 상태**였음. 이번 PR로 default-on 전환 + UX 보강.
- v0.5.2 머지 후 v0.5.2 태그 박고 즉시 프로덕션 배포 (사용자 체감 가장 큰 차이).

#### v0.5.3 · 사진 상세 모달 단독 PR (메인 타겟 누락 해소) ★

> **배경:** v0.5.2 작업 중 발견된 큰 누락. **Flow B/C(FolderGallery, 스튜디오 셀렉 메인 타겟)에서 사진 클릭이 즉시 토글로 가버려 큰 화면 상세 확인이 불가능한 상태**. Flow A(개인용)에는 PhotoModal이 있으나 가이드 v2 §4-4 NOTES 톤 미적용. 이 PR이 PHASE1_PLAN ⑥ + DESIGN_DIRECTION §4-4 통합 사양을 실제 구현으로 옮긴다.
>
> **브랜치:** `feat/photo-detail-modal-v0.5.3` / **태그:** `v0.5.2-stable` (직전 안정점)
> **작업 프롬프트:** `CLAUDE_CODE_PROMPT_v0.5.3_PHOTO_DETAIL_MODAL.md`
> **선행 조건:** v0.5.2 머지 + 프로덕션 배포 완료 후 진행
> **상위 사양:** PHASE1_PLAN.md ⑥ (사용자 명시 ⭐⭐⭐) + DESIGN_DIRECTION.md §4-4

| # | 항목 | 핵심 변경 |
|---|------|----------|
| 1 | **`src/lib/scoreBreakdown.ts` 신규** | `buildScoreBreakdown(photo): ScoreBreakdown` — 감점/가산점/heroBonus를 NOTES 표 데이터로 변환 |
| 2 | **`src/components/PhotoDetailModal.tsx` 신규** | 큐레이터 NOTES 톤. `IMG_2871 · 12 of 80` 헤더(모노) / SCORE 분수형 / NOTES 표 / 그룹 베스트 점프 / [빼기]·[유지] 액션 |
| 3 | **Flow A — 카드 클릭 의미 "토글" → "확인" 전환** | `Gallery.tsx`: 카드 바디 클릭 = 모달, 카드 우상단 ✕(선택됨)·✓(제외됨) 클릭 = 즉시 토글. `PhotoModal` → `PhotoDetailModal` 교체 |
| 4 | **Flow B/C — 모달 연결 ★ 핵심 누락 해소** | `FolderGallery.tsx`: `modalPhoto` 상태 추가 + 사진 카드 onClick 변경(바디=모달 / 우상단 ✕✓=토글) + PhotoDetailModal 호출. **메인 타겟 사용자가 처음으로 큰 화면 확인 가능해짐** |
| 5 | **그룹 베스트 점프** | 같은 pHash 그룹 1위 photoId로 모달 컨텍스트 점프. `"이 그룹의 최고점은 87점."` + `[그 컷 보기 →]` |
| 6 | **모바일 풀스크린 슬라이드업 시트 + 키보드 네비** | `<768px` 모달은 풀스크린 + safe-area-inset / `←·→·Space·Esc·+·-` 단축키 |

**중요:** 이 PR은 **단독 PR**(Stage D1 잔여 묶지 않음). 사용자 영향이 가장 큰 항목 단독 출시 → 회귀 위험 분리 + 머지 직후 즉시 프로덕션 배포 권장. Stage D1 나머지(온보딩 모달·재방문 배너·GA4·ZIP 24h 캐시)는 v0.5.4에서 별도 PR로 묶음 처리.

#### v0.5.4 · Stage D1 잔여 + 결제 무료 베타 카피 (E2 통합)

> **결정 (2026-05-04):** 사업자등록 전이므로 결제는 코드만 두고 "무료 베타" 명시. 결제 코드(payment.ts/PaymentGate.tsx/Edge Function)는 이미 dev bypass 동작 중이므로 **카피·배지·검증만** 추가.

| # | 항목 | 출처 |
|---|------|------|
| 1 | 온보딩 1-step 모달 | PHASE1_PLAN §3-2 |
| 2 | 재방문 배너 + 호명 5곳 추가 + 단골 인지 | PERSONALIZATION §4-2/4-5 |
| 3 | GA4 인스트루먼테이션 (PII 차단 검증) | PHASE1_PLAN §5-1 |
| 4 | ZIP 24h 재다운로드 캐시 마무리 | PHASE1_PLAN §1-5 (1c68db8에서 진행률만 했고 캐시 미완) |
| 5 | **결제 무료 베타 카피 + dev bypass 안정화 ★ 신규(E2)** | 사용자 결정 (2026-05-04) |

**브랜치:** `feat/v0.5.4-d1-rest-and-free-beta` / **태그:** `v0.5.3-stable`
**작업 프롬프트:** `CLAUDE_CODE_PROMPT_v0.5.4_FREE_BETA_AND_D1.md`

#### v0.5.5 · 디자인 마이그레이션 (v2.2 적용) ★ 신규

> **결정 (2026-05-14):** 큐레이터·다크 컨셉 폐기 → 라이트 메인 + Graphite 액센트로 전면 재설계. 소셜 로그인보다 먼저 진행. 사양 문서: `DESIGN_DIRECTION.md` v2.2 (§10-1 매트릭스 그대로).

| # | 항목 |
|---|------|
| 1 | `tokens.css` 전면 교체 (라이트 베이스 + Graphite 액센트) |
| 2 | `messages/ko.json` 어시스턴트 톤 (이미 적용됨) → 컴포넌트에서 신규 키 참조 |
| 3 | Landing 단일 드롭존 + 신규 헤드라인 |
| 4 | 갤러리 메타 패널 본문+모노 차분화 + 사진 그리드 갭 4px + 미세 라운드 |
| 5 | PhotoDetailModal `data-theme="dark"` (다크 보조) |
| 6 | 갤러리 [라이트│다크] 토글 + localStorage |
| 7 | WCAG AA 검증 grep 통과 |

**브랜치:** `feat/v0.5.5-design-v2.2` / **태그:** `v0.5.4-stable`
**가이드:** `DESIGN_DIRECTION.md` v2.2 §10-1

---

#### v0.6.0 · 소셜 로그인 (카카오·네이버·구글 3개) ★ 신규(E3)

> **결정 (2026-05-04):** 토스 제외, 3개 Provider만. 결제 회원구분 + 모바일 이어 작업(D4) + UUID 어뷰징 방지(E6)의 공통 전제가 되는 인프라 PR. Supabase Auth 활성화 필수.
> **결정 (2026-05-14):** 디자인 마이그레이션(v0.5.5) 이후 진행 — OAuth 버튼·로그인 UI가 v2.2 디자인 위에 얹혀야 작업 중복이 없음.

| # | 항목 |
|---|------|
| 1 | Supabase Auth 활성화 + RLS 기본 정책 |
| 2 | Google OAuth Provider 연결 (Supabase 표준 지원) |
| 3 | 카카오 OAuth Custom Provider (Supabase Auth Hook) |
| 4 | 네이버 OAuth Custom Provider (Supabase Auth Hook) |
| 5 | UserProfile 모델 확장 (provider/providerUserId/email/userId) — 기존 nickname/heroPersonNames 보존 |
| 6 | 로그인/로그아웃 UI + AppShell 헤더 우상단 사용자 영역 |
| 7 | **게스트 모드 호환 — 로그인 안 해도 셀렉은 가능 유지** (강제 로그인 X) |
| 8 | 결제 회원 구분 데이터(`auth.uid` 매핑) — 무료 베타 동안에도 추적 |
| 9 | UUID 어뷰징 방지 1차 인프라 — 같은 이메일 + Device Fingerprint 중복 가입 감지 (조용히 플래그, 차단 X) |

**브랜치:** `feat/v0.6.0-social-login` / **태그:** `v0.5.5-stable` (디자인 마이그레이션 머지 후)
**사전 액션 가이드:** `CLAUDE_CODE_PROMPT_v0.6.0_SOCIAL_LOGIN_PREP.md` — Supabase 프로젝트 활성화 + 카카오/네이버/구글 개발자 콘솔 앱 등록 + 환경변수 수집 (사용자가 직접)
**구현 프롬프트:** `CLAUDE_CODE_PROMPT_v0.6.0_SOCIAL_LOGIN_IMPL.md` (사전 액션 완료 후 정확한 값으로 갱신)

#### v0.7.0 · 모바일 이어 작업 (디바이스 간 동기화)

> v0.6.0 소셜 로그인 위에서 진행. v0.5.5(디자인)·v0.6.0(소셜 로그인) 출시 후 사용자 실제 반응 보고 옵션 결정.

옵션 비교:
- (A) Drive 메타 P2P (백엔드 0, Drive 사용자만)
- (B) Supabase Storage (백엔드, 로컬 폴더 사용자도 커버) — v0.6.0 Auth 위에 자연 결합
- (C) 하이브리드 — Drive 사용자는 A / 비-Drive 사용자는 B

상세 옵션 비교는 `CLAUDE_CODE_PROMPT_v0.5.2_PERFORMANCE.md` 부록 C.

#### 결제 활성화 — 사업자등록 후 (시점 미정)

> 코드는 모두 구현됨(payment.ts / PaymentGate.tsx / verify-payment Edge Function). 사업자등록 + PortOne 가맹·세금 신고 체계 갖춘 후 다음만:
>
> 1. Vercel 환경변수 등록: `VITE_PORTONE_STORE_ID` / `VITE_PORTONE_CHANNEL_KEY` / `VITE_FEATURE_PAYMENT=true`
> 2. Supabase Edge Function 시크릿: `PORTONE_API_SECRET`
> 3. PortOne 콘솔: 허용 도메인 + 카카오페이/토스페이 채널 연결
> 4. 결과 화면 카피 "무료 베타" → 정상 가격 표시로 자동 전환 (v0.5.4에서 환경변수 분기로 구현 예정)

| # | 항목 | 상태 |
|---|------|------|
| §2-1 | 사진 상세 모달 (NOTES + 그룹 베스트 점프) | 🔲 미진행 |
| §2-2 | 분석 로딩 스토리텔링 (실수치 카운터) | ✅ c077783 |
| §2-3 | ZIP UX (진척률 + 24h 재다운로드 캐시) | 🟡 1c68db8 부분 (진행률만, 재다운로드 캐시 미완) |
| §2-4 | 온보딩 1-step 모달 | 🔲 미진행 |
| §2-5 | 재방문 배너 + 호명 5곳 추가 + 단골 인지 | 🔲 미진행 (Stage B 닉네임은 진입점 5곳만) |
| §2-6 | GA4 인스트루먼테이션 (PII 차단 검증) | 🔲 미진행 (`VITE_GA_MEASUREMENT_ID` 미발급) |

### 🔲 Phase 1 — Stage D2 (v0.6.1+ 점진 적용)

> v0.6.0 = 소셜 로그인 묶음으로 결정됨에 따라, Stage D2(자동 분기·취향 영속화·Drive 썸네일)는 소셜 로그인 머지 후 v0.6.1+로 점진 적용.

| # | 항목 |
|---|------|
| §3-1 | 시스템 자동 분기 단계 1 (드롭 형태 감지로 StudioTypeSelect 스킵) |
| §1-2 | 취향 학습 영속화 — `preferenceProfile` IndexedDB + EventTag별 자동 적용 + Stage C hero 결합 |
| §⑦-6 | F23 Drive 썸네일 우선 다운로드 (분석=썸네일/ZIP=원본) |

### 🔲 Phase 1 — 후순위 (시점 미정)

- §1-4 AI 보정 (Replicate API + CodeFormer + GFPGAN, 샘플 → 전체)
- §3-1 단계 2 (랜딩 단일 드롭존 통합)

### 🟦 Phase 2 — 비즈니스 레이어 (이번 로드맵 명시 제외)

PortOne 결제 활성화 / 광고 배너(F10) / 무료 체험 워터마크(F11) / 파일명 가림(F19) / 어드민 페이지(F21) / 다중 라벨러 협업(F22) / 계정 시스템 / 서버 지문 동기화 / Supabase ANON 미등록.

> Phase 1 데이터(전환율·재방문률·정확도)가 충분히 쌓인 다음 별도 검토.

---

## 버전 히스토리

| 버전 | 내용 | 배포 상태 | 머지 커밋 |
|------|------|-----------|-----------|
| v0.1.1 | 초기 릴리즈: 사진 선별 + 취향 재추출 | ✅ 배포됨 | — |
| v0.1.2 | 세션 지속성 (beforeunload + IndexedDB) | ✅ 배포됨 | — |
| v0.1.3 | 앨범 기능 (피드백 + 다중폴더 + Google Drive) | ✅ 배포됨 | — |
| v0.1.4 | 랜딩 텍스트 + 업로드 폴더 버그 수정 + 드롭 안정화 | ✅ 배포됨 | — |
| v0.2.0 | Phase 0: Flow B/C 신규 (FolderUpload+FolderGallery+eventTagger) | ✅ 배포됨 | 17e9d99 |
| v0.2.1 | UX 플로우 재설계: 2카드 랜딩 + StudioTypeSelect 분기 | ✅ 배포됨 | — |
| v0.3.0 | FolderGallery 개선 + dedupe + Flow C 폴백 + SEO + AdSense + 보안 | ✅ 배포됨 | 17e9d99 |
| v0.3.1 | Drive 백그라운드 다운로드 + DriveDownloadBanner + 브라우저 알림 | ✅ 배포됨 | 83690dc |
| **v0.4.0** | **Stage A — 큐레이터 톤 (다크룸 디자인 토큰·세리프·이모지 제거)** | ✅ 배포됨 | **4ab93bd** |
| **v0.4.1** | **Stage B — F3 추천장수 / F4 B급 정밀화 / F5 그룹 비교 / F20 UX / 닉네임 캡처** | ✅ 배포됨 | **898ee6a** |
| **v0.5.0** | **Stage C — F18 인물 클러스터링 + 주인공 선택 + 응시 추정 + heroBonus** | ✅ 배포됨 | **673c92d** |
| **v0.5.0+** | **Hero 이름 결과 화면 결합 (PERSONALIZATION §2-7)** | ✅ 배포됨 | 43a0bec |
| **v0.5.1 (예정)** | Stage D1 — 사진 상세 모달 + 스토리텔링 + ZIP 캐시 + 온보딩 + 재방문 배너 + GA4 | 🟡 일부 main 푸시 (c077783, 1c68db8) | — |
| **v0.5.4-stable** | 무료 베타 카피 · OnboardingModal · ReturningBanner · ZIP 24h 캐시 · GA4 12 이벤트 | ✅ 배포됨 | main |
| **v0.5.5 (예정)** | **디자인 마이그레이션 v2.2 — 라이트 메인 + Graphite 액센트 + 어시스턴트 톤** | 🔲 미시작 | — |
| **v0.6.0 (예정)** | 소셜 로그인 (카카오·네이버·구글) | 🔲 미시작 | — |
| v0.6.1+ (예정) | Stage D2 — 자동 분기 + 취향 영속화 + Drive 썸네일 우선 (점진 적용) | 🔲 미시작 | — |
| v0.7.0 (예정) | 모바일 이어 작업 (디바이스 간 동기화) | 🔲 미시작 | — |

> ⚠️ `package.json`의 `version` 필드는 `0.3.0`에 머물러 있음. **v0.5.5 디자인 마이그레이션 PR 시점에 `0.5.5`로 일괄 갱신.**

---

## 다음 세션 시작 시 체크리스트

1. **상태 확인**
   ```bash
   git log --oneline -5
   git status
   git branch --show-current
   ```
   마지막 커밋이 `c077783` (분석 스토리텔링) 또는 그 이후인지 확인.

2. **배포 상태 확인**
   - https://ddalgak-picks.vercel.app 접속 → v0.5.0 화면 동작 (PersonSelect, NicknameCaptureModal, 큐레이터 톤)

3. **Stage D1 진입 결정**
   - 현재 main에 §2-2(스토리텔링)·§2-3(ZIP 진행률) 일부만 직접 푸시된 dirty 상태. 깔끔히 가려면:
     - (a) 잔여 4묶음(§2-1, §2-3 캐시, §2-4, §2-5, §2-6)을 새 브랜치 `feat/ux-expansion-stage-d1-rest`에서 마무리 → v0.5.1 머지
     - (b) 또는 §2-1 사진 상세 모달부터 우선 처리 (사용자 명시 요청 항목, ⭐⭐⭐ 최우선)
   - 작업 프롬프트: `CLAUDE_CODE_PROMPT_REMAINING_WORK.md` §3-1

4. **보안 체크**
   ```bash
   git diff --staged | grep -E "VITE_|AIza|ya29"  # 출력 없어야 안전
   ```

5. **Zustand 셀렉터 규칙**
   ```ts
   const a = useStore((s) => s.a)   // ✅
   ```

6. **빌드 번호:** 다음 빌드는 `/tmp/ddalgak-build12` 이상 사용

---

## 문서 인벤토리 (참조용)

| 문서 | 용도 |
|------|------|
| **PROJECT_STATUS.md** (이 문서) | 현재 상태·로드맵·기술 제약 한눈에 |
| `PHASE1_PLAN.md` | Phase 1 상세 기획 (§1~⑦) — 가격·KPI·F18 통합 |
| `DESIGN_DIRECTION.md` | 큐레이터 톤 디자인 명세 + **§9~§12 v2 보강 (2026-05-04)** — 가이드/코드 갭 / 골드 교체 / 전문성 5신호 / AI 묻은 기술 원칙 / 모바일 가이드 |
| `PERSONALIZATION_PLAN.md` | 닉네임·호명·재방문·hero displayName |
| `SECURITY.md` | 보안 정책 + 2026-04-29 사고 절차 |
| `PRE_PUSH_SECURITY_CHECKLIST.md` | push 전 8단계 게이트 |
| `HANDOFF_2026-04-28.md` | v0.3.0 시점 인수인계 (역사적 자료) |
| `CLAUDE_CODE_PROMPT_v0.4.0_STAGE_A.md` | Stage A 작업 프롬프트 (✅ 완료) |
| `CLAUDE_CODE_PROMPT_MISSED_FEATURES.md` | Stage B·C 작업 프롬프트 (✅ 완료) |
| `CLAUDE_CODE_PROMPT_REMAINING_WORK.md` | **Stage D1·D2 마스터 프롬프트** (다음 세션 진입점) |
| `PRODUCT_STRATEGY_REVIEW_2026-04-23.md` | 초기 전략 리뷰 (역사적 자료) |
| `docs/v3-plan/PRD.md / TECH_SPEC.md / INITIAL_PROMPT.md` | v3 병행 기획 트랙 (PHASE1_PLAN ⑦에서 통합됨) |
