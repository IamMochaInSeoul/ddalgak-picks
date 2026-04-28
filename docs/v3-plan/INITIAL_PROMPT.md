# Claude Code 인계용 프롬프트 (통합 정리본)

> **버전:** 2026-04-27 6차 갱신 (Google Drive 연동 F23 추가)
> **사용법:** 아래 §1 메인 프롬프트를 복사해서 Claude Code 첫 세션에 붙여넣으세요. 한 번에 모든 결정 사항이 전달됩니다.

---

## 1. 메인 프롬프트 (첫 세션 — 한 번만 사용)

아래 박스 안 내용 전체를 복사해서 Claude Code에 붙여넣으세요.

```
안녕. 나는 비개발자 Minhyup이야. "딸깍픽스(ddalgak-picks)"라는 AI 사진 셀렉터 웹앱의 v3.0 출시를 너에게 맡길게.

## ⚠️ 작업 시작 전 반드시 읽을 문서 (이 순서로)

1. `PROJECT_STATUS.md` — 기존 v0.2.x 구현 현황과 빌드/배포 제약
2. `docs/v3-plan/README.md` — v3 문서 세트 안내 + 1~4차 누적 변경사항
3. `docs/v3-plan/PRD.md` — 제품 요구사항 (비즈니스·UX·KPI, 887줄)
4. `docs/v3-plan/TECH_SPEC.md` — 기술 명세 (B급 정의·인물·결제·UX·라벨링·어드민, 2558줄)

문서 분량이 많아 보이지만 v3.0의 모든 결정이 이 문서들에 다 들어있어. 임의 판단 금지, 문서 우선.

## ✅ 이미 확정된 결정 (다시 묻지 말 것)

### 비즈니스
- **타겟:** 스튜디오에서 1,000장+ 받는 고객, 특히 성장앨범 (만삭/베이비본/50일/100일/돌)
- **가격:**
  - 1회권 **₩4,900** (재추출 무한, 다운로드 1회, 24시간)
  - 패키지 **₩15,000** (모두 무한, 90일)
- **수익원:** 결제 (1회+패키지) + 광고 (모든 화면 비침해 디자인)
- **무료/유료 경계:** 무료는 워터마크 ZIP + 50장 제한, 결제 시 워터마크 제거 + 전체 다운

### 기술 스택
- **프론트:** Vite + React + TypeScript + Zustand + MediaPipe (기존 v0.2.x 유지·확장)
- **백엔드:** **Supabase 확정** (Edge Functions + Postgres + Auth + Storage)
- **결제 PG:** **포트원(PortOne) V2 통합 게이트웨이 확정** — 카카오페이/토스/카드 한 번에
  - 단계 1 (출시 전): `PG_PORTONE_MODE=sandbox` 로 완전 개발 (사업자 등록 없이 가능)
  - 단계 2 (출시 직전): 사업자등록 + 통판 신고 후 `PG_PORTONE_MODE=live` 환경변수만 변경
- **얼굴 임베딩:** PR 4 시작 시 face-api.js / TF.js MobileFaceNet 등 후보 3개 비교 후 결정
- **광고:** Google AdSense — **게시자 ID: ca-pub-7332731589854643** (이미 발급, 사이트 소유권 확인 필요 — 아래 §"즉시 작업" 참조)
- **Google Drive 연동:** 기존 v0.2.x AlbumContainer의 OAuth/Picker/Drive API 코드 재활용. `VITE_GOOGLE_CLIENT_ID`/`VITE_GOOGLE_API_KEY` 그대로 사용

### MVP 범위
- **PC 웹 전용** (모바일은 v3.1+ 미루기, 모바일 접속 시 "곧 지원" 안내)
- **비회원 결제** (이메일만 받음, 회원 시스템은 v3.2+)
- **다국어:** 한국어 우선, 영어는 Best Effort

### 신규 P0 기능 (v0.2.x 위에 추가)
- F18: 인물 자동 클러스터링 + 주인공 선택 (아이폰 "인물" 탭처럼)
- F19: 갤러리 파일명 가림 (`DDP-만삭-001` 가명, ZIP만 원본명)
- F20: 토스식 직관 UX 강제 (PrimaryButton 1개 룰 + ESLint)
- F21: 어드민 페이지 (대시보드/결제/계정/쿠폰/라벨링/감사로그/비상토글)
- F22: 다중 라벨러 협업 시스템 (초대 링크 + 합의 알고리즘)
- F23: Google Drive 폴더 연동 (썸네일로 분석 → 결제 후 선별 사진만 원본 다운)

### 계정 역할 4종
- **admin** — 모든 권한, ENV 비밀번호 (MVP 단일 어드민)
- **labeler** — 자기 라벨링만 read/write, 검증셋 사진은 signed URL view만
- **member** — v3.2+, 카카오/구글 소셜 로그인
- **guest** — MVP 디폴트, 분석·결제 (이메일만)

### 정확도 출시 게이트 (절대 통과 못 하면 출시 보류)
- B급 사진 검출: recall ≥ 92%, FPR ≤ 8%, F1 ≥ 0.85
- 인물 클러스터링: 동일인 매칭 ≥ 90%, 다른 인물 분리 ≥ 95%
- 카메라 응시: ≥ 80%
- 측정은 라벨링된 검증셋(B급 1,000장 + 인물 200세트 + 응시 60장)으로
- 라벨링은 운영자 + 동료 라벨러 N명이 분담 (F22)

## 🚫 절대 규칙

1. **기존 src/와 PROJECT_STATUS.md를 절대 덮어쓰지 마.** v3는 기존 위에 점진 확장. 신규 PR 단위로만 변경.
2. **TECH_SPEC.md의 정의를 강제 사양으로 따라.** PRD와 충돌 시 TECH_SPEC 우선.
3. **임의로 새 의존성 추가 금지.** 새 라이브러리 필요하면 후보 2~3개 비교해서 나에게 결정 받기.
4. **Zustand 셀렉터 룰 깨지 마.** `useStore((s) => s.a)` 만 OK. `useStore((s) => ({ a, b }))` 는 React Error #185 무한루프.
5. **빌드 명령:** `npx vite build --outDir /tmp/ddalgak-buildN --emptyOutDir` (N을 매번 증가, 현재 7부터 시작).
6. **결제 가맹·사업자 등록은 신경 쓰지 마.** Sandbox로만 개발하고, 실제 가맹 등록은 내가 출시 직전 별도 처리.
7. **클라이언트만으로 결제 검증 처리 금지.** 반드시 Supabase Edge Function에서 포트원 SDK로 거래 검증.
8. **라벨러 검증셋 사진은 signed URL 5분 유효로만.** 우클릭 차단 + 라벨링 전용 워터마크.

## 🔥 첫 세션에서 할 일 (순서)

### Step 1 — 문서 정독 + 작업 계획서 정리
- 위 4개 문서 모두 읽기
- `src/lib/types.ts`, `src/lib/store.ts`, `src/lib/scorer.ts`, `src/lib/phash.ts`, `src/lib/laplacian.ts` 파악
- 다 읽고 나면 "v3.0 작업 계획서"를 한국어로 정리해서 보여줘 (TECH_SPEC.md §A.3 PR 분리 17개 기준, 의문점·위험요소 포함)

### Step 2 — 즉시 작업 (Step 1 끝나면 내 OK 없이 바로 진행 OK)

**AdSense 사이트 소유권 확인 코드 삽입:**
- `dist/index.html` 의 `<head>` 안에 다음 한 줄 추가:
  ```html
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7332731589854643"
          crossorigin="anonymous"></script>
  ```
- `.env.example` 또는 환경변수 가이드에 `VITE_ADSENSE_CLIENT_ID=ca-pub-7332731589854643` 추가
- `/tmp/ddalgak-build7` 로 빌드 → `dist/` 갱신
- 마지막에 내가 터미널에서 실행할 명령(`git add ... && git commit ... && git push && npx vercel --prod`) 정리해서 출력
- 배포 끝나면 내가 AdSense 콘솔에서 "코드를 삽입했습니다" 체크 + 검토 요청 누름

### Step 3 — PR 1: docs/v3-plan/* 자체 커밋
- 첫 PR은 v3 문서 세트 자체를 깃 히스토리에 보존
- 커밋 메시지: "docs: v3.0 PRD + TECH_SPEC + INITIAL_PROMPT 신규 (Phase 0 출시 기획)"

### Step 4 — PR 2 ~ 16 순차 진행
TECH_SPEC.md §A.3 (라인 2072) 분리 그대로:

```
PR 1: docs/v3-plan/* 자체 커밋
PR 2: types.ts 신규 필드 (PaymentSession, PersonCluster, HeroConfig, displayName 등)
PR 3: §3 알고리즘 재구현 (scorer/laplacian/eye + isLaughingSquint + faceSharpness)
PR 4: 인물 임베딩 + §3.7 클러스터링 + 폴더 간 병합  ← 이때 임베딩 라이브러리 후보 3개 비교
PR 5: §3.8 응시 추정 + §3.9 heroBonus + selectBest 보강
PR 6: PersonSelect 화면 + AppStep 라우팅
PR 7: 분석 스토리텔링 UI + 인물 단계 메시지
PR 8: 결제 백엔드 (Supabase Edge Function + 포트원 V2 sandbox 연동)
PR 9: 워터마크 합성 + 50장 제한
PR 10: 광고 슬롯 (모든 화면 비침해 디자인) + 비노출 토글
PR 11: F19 파일명 가림 (displayName 생성 + UI 적용 + ZIP 가명 분기)
PR 12: F20 토스식 UX 강제 (PrimaryButton + ESLint 룰 + 마이크로카피 검증)
PR 13: §14.0 정확도 측정 스크립트 + 검증셋 Storage 구조
PR 14: F22 라벨링 협업 시스템 (라벨러 초대·UI·합의·라벨러 인증)  ← 가장 무거운 PR
PR 15: F21 어드민 페이지 (대시보드·결제·계정·쿠폰·감사로그·비상토글·라벨링관리)
PR 16: F23 Google Drive 연동 (FolderUpload·Upload 화면 확장 + 썸네일/원본 단계화 다운로드)
PR 17: 통합 회귀 테스트 + 베타 출시
```

각 PR마다:
1. 변경 의도와 영향 범위를 한국어로 요약 (3~5줄)
2. 변경 파일 목록 + 신규 파일 목록
3. 핵심 알고리즘·UI 결정 포인트가 있으면 나에게 먼저 물어보기 (디자인 시안·라이브러리 선택 등)
4. 내가 OK하면 구현 + 단위 테스트 + 빌드
5. 마지막에 커밋 명령 정리해서 출력
6. 비개발자가 이해할 수 있게 "이번 PR 한 줄 요약 / 사용자가 체감할 변화 / 다음 PR 미리보기 / 나에게 필요한 것" 4줄 정리

## 👤 비개발자인 내(Minhyup) 역할

내가 직접 해야 할 일은 다음 6가지뿐. 너는 적절한 시점에 명확히 요청해야 해:

1. **AdSense 사이트 소유권 확인 → 검토 신청** (Step 2 직후, 5분이면 끝)
2. **광고 단위 ID 입력** (AdSense 승인 후 광고 단위 5개 생성, ID를 너에게 전달 — PR 10 시점)
3. **얼굴 임베딩 라이브러리 선택** (PR 4 시작 시 너가 후보 3개 제시 → 내가 결정)
4. **워터마크·CTA·결제 버튼 디자인 시안 승인** (PR 9~12 진행 중 단계별)
5. **라벨링 작업** (PR 13~14 완성 후, 동료 라벨러 모집 + 각자 1~2시간씩 작업)
6. **Google OAuth 동의 화면 텍스트 승인 + Cloud Console origin 추가** (PR 16 시점 — TECH_SPEC §16.8 텍스트 검토)

내가 병렬로 처리할 외부 작업 (너에게 의존성 없음):
- 사업자등록 + 통신판매업 신고 (출시 직전까지)
- 포트원 가맹 등록 (사업자 등록 후)
- 베타 사용자 모집 (맘카페·인스타)

## 🛑 진행 중에 사용자(나) 결정이 필요한 시점

다음 결정에 도달하면 멈추고 나에게 물어봐:

- [ ] PR 4: 얼굴 임베딩 라이브러리 (face-api.js / TF.js MobileFaceNet / 기타) 후보 3개 비교
- [ ] PR 9: 워터마크 디자인 시안 2~3개 SVG로 제시
- [ ] PR 10: AdSense 광고 단위 5개 ID (랜딩/업로드/분석대기/갤러리/결제결과)
- [ ] PR 12: 메인 CTA·결제 버튼 디자인 미리 확인
- [ ] PR 13: 검증셋 사진 1,000장은 어디서 가져올지 (실제 성장앨범 사진 라벨링)
- [ ] PR 14: 라벨러 초대 이메일 템플릿 디자인
- [ ] PR 15: 어드민 대시보드 메인 화면 레이아웃
- [ ] PR 16: Google OAuth 동의 화면 텍스트 검수 (TECH_SPEC §16.8 참조) — Google 검수 통과 필요할 수 있음
- [ ] PR 16: VITE_GOOGLE_CLIENT_ID에 ddalgak-picks.vercel.app 도메인이 승인된 origin인지 사전 확인 (Google Cloud Console)
- [ ] PR 17 직전: 베타 테스터 50명 모집 채널 (맘카페 / 인스타)

## 🚦 출시 게이트 (PR 17 직전 체크)

다음 모두 통과해야 베타 출시:
- B급 검출 recall ≥ 92%, FPR ≤ 8%, F1 ≥ 0.85 (TECH_SPEC §14.0)
- 인물 클러스터링 동일인 ≥ 90%, 분리 ≥ 95%
- 카메라 응시 ≥ 80%
- TECH_SPEC §14.1 회귀 테스트 6개 모두 통과
- 1,000장 분석 5분 이내 (M1 MacBook Chrome)
- 결제 sandbox 모드 1탭 결제 성공률 98%+
- 어드민 페이지 8개 영역 모두 동작
- 라벨러 5명 동시 라벨링 정상 작동
- Google Drive 폴더 5개(약 4,700장) 분석·결제·원본 다운·ZIP 정상 종단간 작동

위 게이트 미달 시 절대 "출시 가능"이라고 말하면 안 돼.

## 시작

자, Step 1부터 시작해줘. 4개 문서 다 읽고 v3.0 작업 계획서를 정리해서 보여줘.
```

---

## 2. 후속 세션용 짧은 프롬프트 (매 세션 시작 시)

```
딸깍픽스 v3.0 개발 이어서 할게. 시작 전에:

1. `docs/v3-plan/PRD.md` `docs/v3-plan/TECH_SPEC.md` `docs/v3-plan/README.md` 빠르게 훑어줘
   (특히 README "누적 변경" 섹션으로 변경 이력 확인)
2. `PROJECT_STATUS.md` 최신 상태 확인
3. 마지막 PR 진행 상황 확인 (git log + dist/ 빌드 산출물)
4. 다음에 할 PR이 무엇인지 알려줘 (TECH_SPEC §A.3 PR 분리 17개 기준)

내가 진행 OK 하면 작업 시작.
```

---

## 3. 작업별 프롬프트 템플릿

### 3.1 PR 단위 작업 시작 시

```
PR {번호} 시작. 다음 단계로 진행해줘:

1. 변경 의도·영향 범위 한국어 요약 (3~5줄)
2. 변경 파일 목록 + 신규 파일 목록
3. 핵심 결정 포인트가 있으면 나에게 먼저 물어보기
4. 내가 OK하면 구현 + 단위 테스트 + 빌드
5. 마지막에 커밋 명령 정리해서 출력
6. 비개발자용 4줄 요약 (이번 PR / 체감 변화 / 다음 PR / 나에게 필요한 것)
```

### 3.2 PR 4 — 얼굴 임베딩 라이브러리 결정 시

```
PR 4 시작 전에, TECH_SPEC §3.7.1 "임베딩 추출"에 명시된 모델 후보를 비교해줘:

1. face-api.js (FaceRecognitionNet 128 dim)
2. TensorFlow.js MobileFaceNet (192~512 dim)
3. 기타 브라우저용 face embedding 라이브러리

각 후보별로:
- 가중치 파일 크기 (MB)
- 추출 속도 (M1 기준 얼굴당 ms)
- 동일인 매칭 정확도 (논문 또는 벤치마크)
- 라이선스
- 마지막 업데이트
- 우리 요구사항(§3.7.2 임계 0.42 코사인 유사도) 적합도

권장안과 그 이유를 마지막에 한 줄로. 내가 결정하면 통합 진행.
```

### 3.3 PR 13~14 — 라벨링 도구 시작 시

```
PR 13~14는 라벨링 인프라 + 협업 시스템이야.

PR 13에서 만들 것:
- Supabase Storage 버킷 구조 (`benchmark/b_grade/`, `benchmark/person_clustering/`, `benchmark/gaze/`)
- 검증셋 사진 업로드 도구 (어드민용 — 운영자가 사진 1,000장 한 번에 업로드)
- 자동 측정 스크립트 (`npm run bench:b-grade`, `npm run bench:person`, `npm run bench:gaze`)
- 게이트 통과/미달 리포트 (markdown 출력)

PR 14에서 만들 것:
- TECH_SPEC §14.0.5 데이터 모델 (labelers, benchmark_photos, labeling_assignments, labels, consensus_labels, labeler_invites)
- 라벨러 초대 토큰 시스템 (어드민이 발급, 24시간 유효)
- 라벨러 가입 화면 (이메일 + 닉네임)
- 라벨링 UI (블라인드 모드 + 키보드 단축키 1·2·3·Q·W·E·R·Space·←·→)
- 합의 알고리즘 자동 실행 (라벨 저장 직후 트리거)
- 분쟁 해결 큐 (어드민 페이지에서 1클릭 결정)
- 신호 보호 (signed URL 5분 + 우클릭 차단 + 라벨링 워터마크)

먼저 데이터 모델 SQL 마이그레이션 + Supabase RLS 정책부터 보여줘. 내가 검토하고 OK하면 UI 구현 시작.
```

### 3.4 PR 16 — Google Drive 연동 시작 시

```
PR 16은 Google Drive 폴더 연동이야 (PRD F23, TECH_SPEC §16).

먼저 다음 사전 점검:

1. 기존 v0.2.x AlbumContainer.tsx의 Google Drive 코드 (OAuth/Picker/Drive API) 분석
   → 어떤 함수·헬퍼를 FolderUpload·Upload에서 재활용 가능한지 정리
2. 기존 환경변수 (VITE_GOOGLE_CLIENT_ID, VITE_GOOGLE_API_KEY) 그대로 사용 가능한지 확인
3. Google Cloud Console에서 ddalgak-picks.vercel.app 도메인이 승인된 origin인지 확인 필요
   → 안 되어 있으면 나에게 추가 요청 (사용자가 직접 처리)

그 다음 구현:

1. TECH_SPEC §16.3 데이터 모델 확장 (FolderSession.source, PhotoEntry.driveFileId 등)
2. §16.4 OAuth + Picker 흐름 헬퍼 (lib/drive.ts 또는 기존 모듈 확장)
3. §16.5 다운로드 파이프라인 (썸네일 → 분석 → 결제 후 원본)
4. §16.9 UI 변경 (FolderUpload·Upload·FolderGallery·Paywall)
5. §16.10 에러 처리
6. 단위 테스트 (mock된 Drive API 응답으로)
7. 시나리오 6 (TECH_SPEC §14.1) 회귀 테스트 추가

OAuth 동의 화면 텍스트(§16.8)는 내가 직접 검토할 거니까 텍스트만 별도로 보여줘.
```

### 3.5 디자인 의사결정 필요할 때

```
다음 디자인 결정이 필요해:

[항목 — 예: 워터마크 디자인 / 메인 CTA 색상 / 인물 카드 레이아웃]

너가 시안 2~3개를 제시:
1. 각 시안 의도와 트레이드오프 한국어 설명
2. SVG 또는 간단한 이미지로 미리보기
3. 내가 선택하면 구현
```

### 3.6 막혔을 때

```
지금 작업 중 어려운 결정에 부딪쳤어. 다음 형식으로:

1. 무엇을 하려다 막혔는지 (1~2줄)
2. 가능한 선택지 2~4개 (장단점)
3. 너의 권장안 + 이유
4. 내가 결정하기 위해 알아야 할 핵심 질문 1개

결정 받기 전엔 임의로 진행 X.
```

---

## 4. 안전장치 프롬프트

### 4.1 큰 변경 전

```
이 작업은 여러 파일에 걸친 큰 변경이야. 시작 전에:

1. 변경 영향 범위 다이어그램
2. 롤백 계획
3. 단위 테스트 핵심 시나리오 3~5개
4. 단계 분리: 작은 PR 2~3개로 나누는 게 좋을지

위 4개 보여주고 OK하면 시작.
```

### 4.2 정확도 변동 의심 시

```
이 변경이 정확도 게이트(§14.0)에 영향 줄 수 있어. 변경 후:

1. `npm run bench:b-grade` 자동 실행
2. 변경 전후 메트릭 비교 표
3. recall이 1% 이상 하락하면 즉시 정지
4. FPR이 1% 이상 상승하면 즉시 정지
5. 정지 시 원인 분석 후 다음 액션 제시
```

### 4.3 PR 머지 전 체크

```
이 PR 머지 전에 모두 통과:

- TECH_SPEC §14.1 회귀 테스트 6개 (수동 + 자동)
- §14.0 정확도 게이트 (해당되는 경우)
- 빌드 성공 + 번들 사이즈 250KB 이하 (gzip)
- TypeScript 컴파일 에러 0
- ESLint 에러 0 (`no-explicit-any`, `one-primary-button-per-screen` 룰)

표로 정리. 미달 항목 있으면 PR 보류.
```

---

## 5. 비상시

```
지금 진행에 문제가 있는 것 같아:

1. 마지막 5개 변경 git diff 보여주기
2. 현재 빌드/테스트 상태
3. 내가 마지막으로 OK한 결정과 현재 작업의 차이점
4. 롤백 필요하면 그 명령어

작업 멈추고 위 내용부터 보여줘.
```

---

## 6. 참고 — 외부 리소스

- **AdSense 콘솔:** https://www.google.com/adsense/ (게시자 ID `ca-pub-7332731589854643`)
- **Google Cloud Console:** https://console.cloud.google.com (Drive 연동용 OAuth Client + 동의 화면 관리, 기존 v0.2.x 발급분 재사용)
- **Supabase:** https://supabase.com (프로젝트 생성 후 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 발급)
- **포트원 V2 콘솔:** https://admin.portone.io (sandbox 무료 계정 — 사업자 등록 없이 시작 가능)
- **Vercel:** https://vercel.com (현재 운영 중인 호스팅)
- **GitHub:** https://github.com/IamMochaInSeoul/ddalgak-picks (main 브랜치)

---

**END**
