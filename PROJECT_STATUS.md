# 딸깍픽스 (ddalgak-picks) — PROJECT STATUS

> **마지막 업데이트:** 2026-04-29
> **현재 버전:** v0.3.1 (배포 완료)
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
- **입력:** 폴더 여러 개 (만삭/, 베이비본/, 100일/, 돌/ 등) + Google Drive 폴더
- **처리:** 폴더별 독립 분석(이벤트 태그 자동 추정 → Flow A 동일 파이프라인)
- **출력:** 폴더 탭 UI → 선별 결과 → ZIP (폴더 구조 보존) → 앨범 배치로 이어가기
- **상태:** ✅ 구현 완료

#### Flow C · 스튜디오 폴더 셀렉 + ZIP만 (사진만 있는 경우)

- **대상:** 스튜디오 폴더 없이 촬영 사진만 있는 고객
- **입력:** 사진 파일 or 폴더 (직접 구분)
- **처리:** Flow B와 동일 파이프라인
- **출력:** 폴더 탭 UI → 선별 결과 → ZIP 저장 (앨범 배치 버튼 없음)
- **폴백:** AlbumContainer 파싱 실패 시 FolderGallery로 자동 전환 (구현 완료)
- **상태:** ✅ 구현 완료

#### 앨범 배치 (AlbumContainer) — Flow B 이후 단계

- **입력:** 템플릿 폴더(빈 액자/앨범 슬롯 구조) + 촬영 세션 폴더들
- **처리:** `parseTemplate()` 슬롯 배열 생성 → 세션 분석 → `autoAssign()` 슬롯 배치
- **출력:** 슬롯 편집 UI → 템플릿 폴더 구조 그대로 ZIP
- **상태:** ✅ v0.1.3 기구현, Flow B에서 연결됨

---

### 핵심 차별점 5가지

1. **폴더 구조 유지 셀렉** — 경쟁사가 못하는 본질적 차별점
2. **이벤트 자동 태깅** — 폴더명에서 만삭/베이비본/100일/돌 등 자동 분류
3. **중복 제거 — 과거 셀렉 기억하는 AI** — pHash 지문 이력 기반, 이미 쓴 컷 자동 제외 ✅ 구현완료
4. **AI 보정 샘플 → 전체** — Try Before Buy, Before/After 슬라이더 (Phase 1)
5. **100% 로컬 셀렉 + 선택적 서버 보정** — 사진 원본은 기본 브라우저에서만

---

## 기술 제약 (매 세션 반드시 숙지)

### Zustand 규칙
```
❌ useStore((s) => ({ a: s.a, b: s.b }))  → React Error #185 무한루프!
✅ const a = useStore((s) => s.a)          → 개별 셀렉터만 사용
```

### 빌드·배포 절차 (2026-04-29 보안사고 이후 확정)

> ⚠️ **dist/ 커밋 절대 금지** — Vite는 VITE_* 환경변수를 번들에 인라인한다.
> dist/를 커밋하면 API 키가 GitHub에 노출된다. 실제 사고 발생 이력 있음 (2026-04-29).

**올바른 배포 순서:**
```bash
# 1. 소스 파일만 스테이징 (dist/ 절대 포함 금지)
cd ~/Documents/Claude/Projects/"vibe coding"/ddalgak-picks
git add src/ public/ index.html vercel.json package.json ...

# 2. 커밋
git commit -m "feat: ..."

# 3. push + Vercel 소스 빌드 배포
git push && npx vercel --prod
```

**빌드가 필요할 때 (타입 체크, 로컬 확인 용도):**
```bash
npx vite build --outDir /tmp/ddalgak-buildN   # N은 매번 증가. 현재 build8까지 사용
```

**사전 push 보안 체크:**
```bash
git diff --staged | grep -E "VITE_|AIza|ya29"  # 출력 없어야 안전
```

### 환경변수

| 변수 | 용도 | 등록 위치 |
|------|------|-----------|
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth | `.env` + Vercel |
| `VITE_GOOGLE_API_KEY` | Google Picker / Drive API | `.env` + Vercel (도메인 제한 설정 완료) |
| `VITE_PORTONE_STORE_ID` | PortOne 결제 | Vercel (미등록 — 결제 비활성) |
| `VITE_PORTONE_CHANNEL_KEY` | PortOne 결제 | Vercel (미등록 — 결제 비활성) |
| `VITE_SUPABASE_URL` | Supabase | Vercel (미등록) |
| `VITE_SUPABASE_ANON_KEY` | Supabase | Vercel (미등록) |

### Vercel 프로젝트 정보

- **projectId:** `prj_5Z0q2wFkjWQgNnoHzwH9r3bdP1Gd`
- **teamId / orgId:** `team_QCXZxUDktkf2o1BPLrh0lVk7`
- **GitHub 계정:** IamMochaInSeoul
- **Google 계정:** jungmoca90@gmail.com
- **올바른 프로젝트 경로:** `~/Documents/Claude/Projects/"vibe coding"/ddalgak-picks`

---

## 구현 완료 기능 현황 (v0.3.1 기준)

### ✅ 랜딩
- 2카드: "사진만 셀렉" (개인용) / "스튜디오용 셀렉"
- SEO 최적화 (title, description, OG 태그, `<noscript>` 한국어 콘텐츠)

### ✅ StudioTypeSelect
- "셀렉용 폴더 있어요" (flow B) / "사진만 있어요" (flow C)
- 각 옵션에 단계 흐름 배지로 시각화

### ✅ FolderUpload (v0.3.1 개선)
- 다중 폴더 드래그앤드롭 (FileSystemEntry API 재귀 읽기)
- 폴더별 이벤트 태그 자동 추론 (eventTagger.ts) + 수동 변경 가능
- 폴더별 목표 장수 개별 설정 (10/20/30/50 프리셋 + 직접 입력)
- 유사 사진 최대 허용 (maxPerGroup) 전역 설정
- **Google Drive 연동** (GIS OAuth + Picker + Drive API)
  - 폴더 선택 즉시 백그라운드 다운로드 시작 (비블로킹)
  - 다운로드 중에도 Drive 버튼 재클릭 → 추가 폴더 선택 가능
  - 완료 시 브라우저 Notification API로 OS 알림

### ✅ DriveDownloadBanner (v0.3.1 신규)
- 모든 화면 하단에 항상 떠있는 플로팅 배너
- driveQueue가 Zustand 전역 스토어 → 다른 화면 이동 후에도 다운로드 지속
- 폴더별 현재/전체 장수 + 전체 진행 바 시각화
- 완료 후 "🚀 분석 시작하러 가기" 버튼 / 에러 항목 개별 닫기

### ✅ FolderGallery (v0.3.0 개선)
- 폴더별 순차 분석 (MediaPipe 메모리 충돌 방지)
- 탭 바: 각 탭에 상태(⏳/✓/⚠️) + 선별 장수 배지
- **갤러리 뷰 탭:** 선택됨 / 제외됨 / 전체 3탭 (폴더 탭 하위)
- **감점 사유 배지:** 눈 감음 / 흔들림 / 옆모습 / 저화질 등 한국어 표시
- **🔁 이전 배지:** 과거 세션에서 사용한 사진 표시
- 하단 고정 바: ZIP 저장 + flow B일 때만 "앨범 배치하기 →" 버튼
- ZIP 저장 시 pHash 지문 IndexedDB에 저장 (다음 세션 중복 감지용)

### ✅ 과거 세션 중복 제거 (v0.3.0 신규)
- `src/lib/pastSelectionStore.ts` — IndexedDB `ddalgak-dedupe` DB
  - pHash(bigint→string) + filename + sessionId + savedAt 저장
  - 원본 사진 픽셀 미저장 (개인정보 안전)
  - `savePastSelections()` / `loadPastHashes()` / `clearOldHashes(30일)`
- `src/lib/dedupe.ts`
  - `hammingDistance(a, b)` — XOR 비트 카운트
  - `findPastDupes(photos, pastRecords, threshold=8)` — Hamming ≤ 8 매칭
  - 매칭 시 `DupeMatch { matchedFilename, matchedSessionId, distance }` 반환

### ✅ Flow C 폴백 (v0.3.0 신규)
- AlbumContainer: 템플릿 파싱 성공했으나 슬롯이 0개일 때
- "← ZIP 셀렉으로 돌아가기" 버튼 → `setStep("folderGallery")`

### ✅ eventTagger.ts
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

### ✅ 세션 지속성
- beforeunload 경고 (분석 중/갤러리/folderGallery)
- IndexedDB 자동저장 3초 디바운스 (24h TTL)
- 재방문 복구 배너

### ✅ 앨범 배치 (AlbumContainer) — v0.1.3
- 스튜디오 템플릿 폴더 파싱
- AI 자동 배치(`autoAssign`) + 수동 배치
- ZIP 다운로드 (템플릿 폴더 구조 그대로)

### ✅ 수익화 인프라
- **Google AdSense:** `public/ads.txt` 배포 완료 (재심사 대기 1~2주)
- **개인정보처리방침:** `/privacy` 페이지 (vercel.json rewrite 설정)
- **PortOne 결제:** 코드 구현 완료, 환경변수 미등록으로 비활성 상태

---

## 주요 파일 구조 (v0.3.1 기준)

```
src/
├── components/
│   ├── AppShell.tsx            ← 스텝 라우팅 + 세션 자동저장 + 복구 배너 + DriveDownloadBanner
│   ├── DriveDownloadBanner.tsx ← Drive 백그라운드 다운로드 플로팅 배너 (v0.3.1 신규)
│   ├── Landing.tsx             ← 2카드 (사진만/스튜디오용)
│   ├── StudioTypeSelect.tsx    ← 셀렉용 폴더 有無 분기
│   ├── FolderUpload.tsx        ← 다중 폴더 드롭존 + Drive 백그라운드 다운로드
│   ├── FolderGallery.tsx       ← 폴더별 탭 갤러리 + 선택/제외/전체 뷰 + 감점배지 + ZIP
│   ├── TypeSelect.tsx          ← Flow A 피사체 선택
│   ├── Upload.tsx              ← Flow A 파일/폴더 업로드
│   ├── Analysis.tsx            ← Flow A 분석 진행 화면
│   ├── Gallery.tsx             ← Flow A 메인 갤러리
│   ├── FeedbackMode.tsx        ← 카드 스와이프 취향 피드백
│   ├── PhotoCard.tsx
│   ├── PhotoModal.tsx          ← 줌·패닝 모달
│   ├── AlbumContainer.tsx      ← 앨범 배치 (Flow B 이후 단계) + Flow C 폴백 버튼
│   ├── Toast.tsx               ← 토스트 알림
│   ├── LangToggle.tsx
│   └── ErrorBoundary.tsx
├── lib/
│   ├── types.ts                ← 전체 타입 (DriveQueueItem 추가)
│   ├── store.ts                ← Zustand (driveQueue 전역 상태 + CRUD 액션 추가)
│   ├── eventTagger.ts          ← 폴더명 → EventTag 자동 추론
│   ├── pastSelectionStore.ts   ← IndexedDB pHash 지문 저장 (v0.3.0 신규)
│   ├── dedupe.ts               ← Hamming 거리 기반 과거 세션 중복 감지 (v0.3.0 신규)
│   ├── googleDrive.ts          ← GIS OAuth + Picker + Drive API
│   ├── analyzer.ts             ← 분석 파이프라인 진입점
│   ├── scorer.ts               ← 채점 + 씬 다양성 선별
│   ├── phash.ts                ← pHash + Hamming + 씬 클러스터링
│   ├── laplacian.ts            ← Laplacian variance
│   ├── feedbackLearning.ts     ← 취향 재추출 알고리즘
│   ├── sessionPersist.ts       ← IndexedDB 세션 저장/복구
│   ├── albumTypes.ts           ← Flow C(앨범 배치) 전용 타입
│   ├── payment.ts              ← PortOne 결제 (비활성)
│   └── i18n.ts
├── messages/
│   ├── ko.json
│   └── en.json
public/
│   ├── ads.txt                 ← Google AdSense 인증 (v0.3.0 신규)
│   └── privacy.html            ← 개인정보처리방침 (v0.3.0 신규)
index.html                      ← SEO 메타태그 + OG + noscript 한국어 콘텐츠
vercel.json                     ← buildCommand + /privacy rewrite 규칙
SECURITY.md                     ← 보안 지침 + 사고 이력 + 키 교체 절차
```

---

## 보안 이력

### 2026-04-29 VITE_GOOGLE_API_KEY 노출 사고

- **원인:** `git add -f dist/` 포함 커밋 → GitHub 공개 저장소에 번들된 API 키 노출
- **조치:** GitGuardian 알림 → 기존 키 삭제 → 새 키 발급 + 도메인 제한 설정 → Vercel 환경변수 교체 → SECURITY.md 작성
- **재발 방지:** `dist/` 커밋 절대 금지, 배포는 소스 파일만 커밋 + `npx vercel --prod`로 Vercel이 빌드

---

## 로드맵

### ✅ Phase 0 — 전부 완료 (v0.3.0~v0.3.1)

- [x] 랜딩 2카드 리디자인
- [x] StudioTypeSelect 분기 화면
- [x] FolderUpload — 다중 폴더 드롭존 + 이벤트 태그 설정
- [x] FolderGallery — 선택/제외/전체 뷰 + 감점 사유 배지 + 중복 배지
- [x] 과거 세션 중복 제거 (pastSelectionStore + dedupe)
- [x] Flow C 폴백 (AlbumContainer 파싱 실패 시 FolderGallery 복귀)
- [x] Google Drive 백그라운드 다운로드 (비블로킹 큐)
- [x] DriveDownloadBanner — 전 화면 플로팅 배너 + 브라우저 알림
- [x] AdSense ads.txt 배포
- [x] 개인정보처리방침 페이지 (/privacy)
- [x] SECURITY.md + 보안 배포 절차 확립

### 🔲 Phase 1 — 프리미엄 업셀 + 재방문 엔진

- [ ] 분석 로딩 스토리텔링 ("눈 감은 컷 N장 제외..." 실수치 단계별 노출)
- [ ] 취향 학습 영속화 (이벤트 태그별 가중치 IndexedDB 저장)
- [ ] 워터마크 프리뷰 + 저장 방지
- [ ] AI 보정 (Replicate API + CodeFormer + GFPGAN)
- [ ] ZIP UX 개선 (진척률 + 완료 토스트 + 재다운로드)

### 🔲 Phase 2 — 비즈니스 레이어

- PortOne 결제 활성화 (환경변수 등록 필요)
- 계정 시스템 / 서버 지문 동기화 / 알림톡 CRM
- Supabase 연동 (환경변수 등록 필요)

---

## 버전 히스토리

| 버전 | 내용 | 배포 상태 |
|------|------|-----------|
| v0.1.1 | 초기 릴리즈: 사진 선별 + 취향 재추출 | ✅ 배포됨 |
| v0.1.2 | 세션 지속성 (beforeunload + IndexedDB) | ✅ 배포됨 |
| v0.1.3 | 앨범 기능 (피드백 + 다중폴더 + Google Drive) | ✅ 배포됨 |
| v0.1.4 | 랜딩 텍스트 + 업로드 폴더 버그 수정 + 드롭 안정화 | ✅ 배포됨 |
| v0.2.0 | Phase 0: Flow B/C 신규 (FolderUpload+FolderGallery+eventTagger) | ✅ 배포됨 |
| v0.2.1 | UX 플로우 재설계: 2카드 랜딩 + StudioTypeSelect 분기 | ✅ 배포됨 |
| v0.3.0 | FolderGallery 개선 + dedupe + Flow C 폴백 + SEO + AdSense + 보안 | ✅ 배포됨 |
| v0.3.1 | Drive 백그라운드 다운로드 + DriveDownloadBanner + 브라우저 알림 | ✅ 배포됨 |

---

## 다음 세션 시작 시 체크리스트

1. `git log --oneline -5` 로 마지막 커밋 확인
2. `npx vercel ls` 또는 배포 URL 접속으로 배포 상태 확인
3. Phase 1 남은 항목 중 우선순위 결정
4. **보안 체크:** `git diff --staged | grep -E "VITE_|AIza|ya29"` 출력 없어야 안전
