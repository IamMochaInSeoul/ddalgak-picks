# v0.6.0 소셜 로그인 — 사전 액션 가이드 (사용자 직접 수행)

> **작성일:** 2026-05-04
> **이 문서의 목적:** v0.6.0 소셜 로그인 PR의 **클로드코드 구현 프롬프트는 사용자 사전 액션 완료 후 별도 작성**한다. 이유: Supabase·카카오·네이버·구글 개발자 콘솔에서 직접 받아야 할 키와 콜백 URL을 사용자가 등록해야 정확한 프롬프트가 가능. 본 문서는 사용자가 1~2시간 안에 끝낼 수 있는 사전 액션 체크리스트.
>
> **결정 (2026-05-04):** 카카오·네이버·구글 3개 Provider. **토스 제외**.

---

## 0. 왜 사전 액션이 먼저인가

소셜 로그인 작업은 **외부 서비스 등록 + Vercel 환경변수 9개 + Supabase 콘솔 설정**의 합산이다. 이걸 클로드코드가 코드로 만들 수는 있어도, **각 Provider Console에서 발급받아야 할 키와 콜백 URL은 사용자만 받을 수 있다**. 키가 없으면 코드만 있고 실제 동작 안 함.

**순서:**
```
사전 액션 (이 문서) ─── 사용자가 직접 1~2시간
   ↓
환경변수 9개 Vercel에 등록
   ↓
사용자가 "준비 완료"라고 알려줌
   ↓
v0.6.0 구현 클로드코드 프롬프트 작성 (정확한 콜백 URL·Provider ID 기반)
   ↓
클로드코드가 v0.6.0 PR 진행
```

---

## 1. 작업 전 결정 — 도메인 확정

소셜 로그인 콜백 URL은 한 번 등록하면 바꾸기 까다로움. 다음 도메인을 먼저 확정.

| 환경 | 도메인 | 콜백 URL 패턴 |
|------|--------|---------------|
| 프로덕션 | `https://ddalgak-picks.vercel.app` | `{도메인}/auth/callback` |
| 프리뷰 | Vercel 자동 (`https://ddalgak-picks-XXX.vercel.app`) | 필요 시 추가 등록 |
| 로컬 | `http://localhost:5173` | 개발 중에만 |

**결정 사항:**
- [ ] 프로덕션 도메인을 `ddalgak-picks.vercel.app` 그대로 갈지, 자체 도메인(`ddalgak.app` 등) 구매할지
- [ ] 자체 도메인 구매 예정이면 **이 PR 시작 전에 확정**. 안 그러면 콜백 URL을 두 번 등록해야 함

> **권장:** v0.6.0 시작 시점에는 `ddalgak-picks.vercel.app` 그대로. 자체 도메인은 사업자등록·결제 활성화 시점에 함께.

---

## 2. Supabase 프로젝트 활성화 (15분)

### 2-1. 기존 Supabase 프로젝트 확인

`PROJECT_STATUS.md`에 다음이 명시돼 있음:
- `VITE_SUPABASE_URL` (Vercel — ⚠️ 값 미확정)
- `VITE_SUPABASE_ANON_KEY` (Vercel — ⚠️ 미등록)
- `verify-payment` Edge Function 배포됨

**먼저 사용자가 확인할 것:**
```bash
# 로컬 .env 파일에 SUPABASE 키가 있다면 어떤 프로젝트인지 확인
cd ~/Documents/Claude/Projects/"vibe coding"/ddalgak-picks
grep SUPABASE .env  # 또는 .env.example과 비교
```

기존 프로젝트가 있고 Edge Function 배포된 상태라면 그대로 사용. 없거나 새로 만들고 싶다면:

### 2-2. 새 Supabase 프로젝트 만들기 (필요 시)

1. https://supabase.com/dashboard 접속 (구글 계정 권장)
2. **New Project** 클릭
3. 프로젝트 정보:
   - Name: `ddalgak-picks`
   - Database Password: **강력한 비밀번호 생성 후 1Password 등에 저장**
   - Region: **Northeast Asia (Seoul)**
   - Pricing Plan: Free (무료 베타 동안 충분)
4. 생성 완료 (약 2분 대기)
5. **Settings → API** 메뉴에서:
   - **Project URL** 복사 (`https://xxxxxxxxxx.supabase.co`)
   - **anon public** 키 복사 (긴 JWT)

**Vercel 환경변수에 등록:**
- Vercel → Project → Settings → Environment Variables
- `VITE_SUPABASE_URL` = 위 Project URL
- `VITE_SUPABASE_ANON_KEY` = 위 anon public 키
- 적용 환경: Production, Preview, Development 모두 체크

### 2-3. Auth 설정 켜기

- Supabase Dashboard → **Authentication** → **Providers**
- **Email** Provider는 기본 켜져 있음 (그대로 둠 — 매직링크 폴백 옵션)
- 다음 §3·§4·§5에서 카카오·네이버·구글 추가

---

## 3. Google OAuth 설정 (15분)

> Supabase 표준 지원이라 가장 쉬움.

### 3-1. Google Cloud Console에서 OAuth Client 만들기

1. https://console.cloud.google.com 접속 (`jungmoca90@gmail.com`)
2. **기존 프로젝트 사용**: PROJECT_STATUS의 Drive API용 프로젝트 (`VITE_GOOGLE_CLIENT_ID` 발급한 것) 그대로 사용 권장. 새로 만들 필요 없음.
3. **APIs & Services → OAuth consent screen** 설정 (이미 했으면 스킵)
   - User Type: External
   - App name: 딸깍픽스
   - User support email: `jungmoca90@gmail.com`
   - Authorized domains: `vercel.app`, `supabase.co`
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Name: `Ddalgak-Picks Auth`
   - Authorized JavaScript origins:
     - `https://ddalgak-picks.vercel.app`
     - `https://<your-project>.supabase.co`
     - `http://localhost:5173` (개발용)
   - Authorized redirect URIs:
     - `https://<your-project>.supabase.co/auth/v1/callback`
     - (자체 도메인 결정되면 그것도 추가)
5. **Client ID** 복사 (`xxxxx.apps.googleusercontent.com`)
6. **Client Secret** 복사

### 3-2. Supabase에 등록

- Supabase Dashboard → **Authentication → Providers → Google**
- Enabled: ON
- Client ID: 위에서 복사한 것
- Client Secret: 위에서 복사한 것
- Save

### 3-3. 테스트 (선택)

Supabase Dashboard → **Authentication → Users** 화면에서 Google 로그인 시도 가능. 실제 로그인되면 OK.

---

## 4. 카카오 OAuth 설정 (30분)

> Supabase가 표준 지원 안 하므로 **Supabase Auth Hook**으로 Custom Provider 등록. 단계가 좀 많음.

### 4-1. 카카오 개발자 콘솔에서 앱 만들기

1. https://developers.kakao.com 접속 → 카카오 계정 로그인
2. **내 애플리케이션 → 애플리케이션 추가하기**
   - 앱 이름: `딸깍픽스`
   - 사업자명: 개인 (사업자등록 후 변경 가능)
   - 카테고리: 라이프스타일
3. 앱 생성 후 **앱 키** 메뉴:
   - **REST API 키** 복사 (이게 Client ID 역할)
   - **Native App 키**는 무시 (모바일 앱용)
4. **플랫폼 → Web 플랫폼 등록**
   - 사이트 도메인: `https://ddalgak-picks.vercel.app`, `https://<supabase-project>.supabase.co`
5. **카카오 로그인 → 활성화 설정 ON**
6. **카카오 로그인 → Redirect URI 등록:**
   - `https://<your-project>.supabase.co/auth/v1/callback`
   - (자체 도메인 결정 시 추가)
7. **카카오 로그인 → 동의항목**:
   - 닉네임 (필수)
   - 카카오계정(이메일) (필수, 비즈니스 인증 후 가능 — 일단 선택으로 시작)
   - 프로필 사진 (선택)
8. **보안 → Client Secret 생성** 후 활성화 설정 ON
9. **Client Secret 코드** 복사

### 4-2. Supabase에 카카오 Custom Provider 등록

> Supabase Auth UI에는 카카오가 기본 목록에 없음. 다음 둘 중 하나:

#### 옵션 A — Supabase가 최근 추가한 Kakao Provider 사용 (권장 — 2024년 이후 지원)

- Supabase Dashboard → **Authentication → Providers**
- 목록에 **Kakao**가 있는지 확인
- 있으면 ON → REST API 키 + Client Secret 입력 → Save

#### 옵션 B — Custom OIDC Provider로 등록 (옵션 A 미지원 시)

- Supabase Dashboard → **Authentication → Providers → Custom**
- 기술 명세는 v0.6.0 구현 프롬프트에서 처리

### 4-3. 환경변수 정리

`VITE_KAKAO_CLIENT_ID` 같은 별도 환경변수는 **불필요**. Supabase가 OAuth를 모두 대행. 클라이언트 코드는 `supabase.auth.signInWithOAuth({ provider: 'kakao' })`만 호출.

---

## 5. 네이버 OAuth 설정 (30분)

> 카카오와 동일한 패턴. Supabase가 기본 지원 안 하므로 Custom OIDC.

### 5-1. 네이버 개발자 센터에서 앱 만들기

1. https://developers.naver.com 접속 → 네이버 로그인
2. **Application → 애플리케이션 등록**
3. 신청 정보:
   - 애플리케이션 이름: `딸깍픽스`
   - 사용 API: **네이버 로그인** 선택
4. 제공 정보 선택:
   - 회원이름 (선택)
   - 이메일 주소 (필수)
   - 프로필 사진 (선택)
5. 환경 추가 → **PC웹**
   - 서비스 URL: `https://ddalgak-picks.vercel.app`
   - 네이버 로그인 Callback URL: `https://<supabase-project>.supabase.co/auth/v1/callback`
6. 등록 완료 후:
   - **Client ID** 복사
   - **Client Secret** 복사

### 5-2. Supabase에 네이버 Custom OIDC Provider 등록

> 네이버는 OIDC 표준 부분 지원이라 v0.6.0 구현 프롬프트에서 다음 엔드포인트로 처리:
>
> - Authorization endpoint: `https://nid.naver.com/oauth2.0/authorize`
> - Token endpoint: `https://nid.naver.com/oauth2.0/token`
> - UserInfo endpoint: `https://openapi.naver.com/v1/nid/me`
>
> Supabase Auth Hook (또는 Edge Function 프록시)으로 처리. 구체 구현은 v0.6.0 프롬프트에서.

---

## 6. Vercel 환경변수 최종 점검

### 6-1. 현재 등록되어 있어야 할 환경변수

```
VITE_GOOGLE_CLIENT_ID         ✅ (Drive API용 — 이미 등록)
VITE_GOOGLE_API_KEY           ✅ (Drive API용 — 이미 등록)
VITE_SUPABASE_URL             ⏳ 이번 PR에서 등록 (위 §2-2)
VITE_SUPABASE_ANON_KEY        ⏳ 이번 PR에서 등록 (위 §2-2)
VITE_FEATURE_PERSON_CLUSTERING ✅ (true 또는 미설정)
VITE_FEATURE_PAYMENT          ✅ (false 또는 미설정 — 무료 베타)
VITE_GA_MEASUREMENT_ID        ⚪ 선택 (v0.5.4에서 추가)
VITE_ADSENSE_CLIENT_ID        ✅ (재심사 대기)
```

### 6-2. v0.6.0 추가 환경변수 (이 PR에서)

```
VITE_AUTH_REDIRECT_URL        = https://ddalgak-picks.vercel.app
   # 소셜 로그인 후 돌아올 URL (자체 도메인 결정 시 변경)
```

> Provider별 Client ID·Secret은 Supabase Dashboard에 등록되므로 Vercel 환경변수에는 필요 없음.

### 6-3. Supabase Edge Function 시크릿 (필요 시)

네이버 Custom Provider를 Edge Function 프록시로 처리할 경우:

```bash
~/bin/supabase secrets set NAVER_CLIENT_ID=xxx --project-ref <ref>
~/bin/supabase secrets set NAVER_CLIENT_SECRET=xxx --project-ref <ref>
```

이 부분은 v0.6.0 구현 프롬프트에서 정확한 명령 안내.

---

## 7. 사전 액션 체크리스트 (사용자가 직접)

작업 진행 전 다음을 모두 ✅로 만든다. 하나라도 ❌면 v0.6.0 구현 프롬프트 작성 보류.

### Supabase
- [ ] Supabase 프로젝트 활성 (Free 플랜 OK)
- [ ] Project URL + Anon Key Vercel 등록
- [ ] Authentication → Providers 화면에 접근 가능
- [ ] Database 비밀번호 안전한 곳에 저장

### Google
- [ ] Google Cloud Console OAuth Client 생성 (Web application)
- [ ] Authorized JavaScript origins 등록 (Vercel + Supabase)
- [ ] Authorized redirect URI 등록 (Supabase 콜백)
- [ ] Supabase Dashboard에서 Google Provider ON + Client ID/Secret 입력
- [ ] (선택) Supabase Users 화면에서 Google 로그인 테스트 성공

### 카카오
- [ ] 카카오 개발자 콘솔에서 앱 등록 (`딸깍픽스`)
- [ ] 카카오 로그인 활성화 ON
- [ ] Redirect URI 등록 (Supabase 콜백)
- [ ] 동의 항목 — 닉네임 (필수) + 이메일 (선택, 사업자등록 후 필수 가능)
- [ ] Client Secret 생성 및 활성화 ON
- [ ] Supabase에 카카오 Provider 등록 (옵션 A 또는 B 결정)

### 네이버
- [ ] 네이버 개발자 센터에서 앱 등록
- [ ] 사용 API: 네이버 로그인
- [ ] PC웹 환경 추가, 서비스 URL + Callback URL 등록
- [ ] Client ID/Secret 확보
- [ ] (Custom OIDC 처리 방식은 v0.6.0 구현 프롬프트에서)

### 일반
- [ ] 프로덕션 도메인 확정 (`ddalgak-picks.vercel.app` 또는 자체 도메인)
- [ ] 자체 도메인이면 콜백 URL을 모든 Provider에 추가 등록
- [ ] Vercel 환경변수 모두 적용 (Production·Preview·Development)
- [ ] PROJECT_STATUS.md "환경변수" 표 갱신 (등록 상태 업데이트)

---

## 8. 사전 액션 완료 후 사용자가 알려줄 것

다음 정보를 정리해서 다음 세션의 Claude(또는 클로드코드)에게 전달:

```
v0.6.0 소셜 로그인 사전 액션 완료. 다음 정보 확인:

1. Supabase 프로젝트
   - URL: https://xxxxxxxxxx.supabase.co
   - 카카오 Provider 등록 방식: [옵션 A — Supabase 기본 지원 / 옵션 B — Custom OIDC]
   - 네이버 Provider 등록 방식: [Custom OIDC via Edge Function / 기타]

2. 등록 완료된 환경변수
   - VITE_SUPABASE_URL: ✅
   - VITE_SUPABASE_ANON_KEY: ✅
   - VITE_AUTH_REDIRECT_URL: ✅ (값: https://...)

3. 도메인 확정
   - 프로덕션: ddalgak-picks.vercel.app (또는 자체 도메인)
   - 콜백 URL 패턴: https://<supabase>/auth/v1/callback

4. 테스트 결과
   - Google 로그인: 동작 확인 ✅ / 실패 ❌
   - 카카오 로그인: 동작 확인 ✅ / 실패 ❌
   - 네이버 로그인: 동작 확인 ✅ / 실패 ❌

문제 있는 항목: [있다면 명시]

이 정보로 v0.6.0 구현 프롬프트를 작성해줘.
```

이 메시지를 받으면 다음 응답으로 `CLAUDE_CODE_PROMPT_v0.6.0_SOCIAL_LOGIN_IMPL.md` 신규 작성 → 클로드코드에 던질 수 있는 상태로.

---

## 9. v0.6.0 구현 프롬프트가 다룰 작업 (미리보기)

사전 액션 완료 후 작성할 클로드코드 프롬프트는 다음 9가지를 처리:

| # | 작업 |
|---|------|
| 1 | Supabase 클라이언트 초기화 (`src/lib/supabaseClient.ts`) |
| 2 | Auth 상태 관리 (`src/lib/useAuth.ts`) — 게스트 모드 호환 |
| 3 | 로그인 화면 (`src/components/AuthModal.tsx`) — 카카오·네이버·구글 3버튼 + 게스트 진입 |
| 4 | 콜백 처리 라우트 (`/auth/callback`) — 토큰 교환 + 프로필 동기화 |
| 5 | AppShell 헤더 우상단 사용자 영역 (로그인/로그아웃 버튼·아바타) |
| 6 | UserProfile 모델 확장 — `provider`/`providerUserId`/`email` 필드 추가 + 기존 `nickname`/`heroPersonNames` 보존 |
| 7 | 게스트 → 로그인 전환 시 IndexedDB 데이터 마이그레이션 (OPFS·중복지문·취향) |
| 8 | UUID 어뷰징 방지 1차 — Device Fingerprint 수집(FingerprintJS OSS) + 같은 이메일 다중 fingerprint 감지 (조용히 플래그, 차단 X) |
| 9 | RLS 기본 정책 — `user_profiles` 테이블 본인만 read/write |

**구현 시간 추정:** 1~2주. 외부 OAuth 연결 디버깅에 따라 변동.

---

## 10. 자주 묻는 질문 (사전 액션 단계)

**Q1. 무료 베타인데 왜 로그인부터 만드나요?**
A. (1) 사업자등록 + 결제 활성화 시점에 회원 ID 매핑이 필요. (2) 모바일 이어 작업(D4)·UUID 어뷰징 방지(E6)의 공통 전제. (3) 게스트 모드 호환이라 로그인 안 해도 셀렉은 가능 유지.

**Q2. 카카오 비즈니스 인증 안 하면 이메일 못 받나요?**
A. 초기에는 닉네임만으로 시작 가능. 사업자등록 + 비즈니스 인증 후 이메일 동의항목 필수로 전환. 그 동안은 `provider_user_id`(카카오 회원번호)로 식별.

**Q3. 토스 인증을 정말 안 넣어도 괜찮나요?**
A. UUID 어뷰징 방지(E6) 1차는 Device Fingerprint로 충분. 토스 본인인증은 결제 활성화 + 할인 어뷰징이 실제 문제로 떠올랐을 때 도입. v0.7+ 영역.

**Q4. 도메인을 자체 도메인으로 바꾸면 어떻게 되나요?**
A. 모든 Provider 콘솔(카카오·네이버·구글)에 콜백 URL 추가 등록 + Supabase Site URL 갱신. 약 30분 작업. 가급적 사전 액션 단계에서 결정.

**Q5. Supabase Free 플랜으로 충분한가요?**
A. 무료 베타 단계는 충분. MAU 50,000 / DB 500MB / Storage 1GB / Edge Function 500K 호출/월. 사용자 1,000명 이상 되거나 사진 동기화(v0.7.0 옵션 B) 도입 시 Pro 검토.

---

## 11. 다음 단계

1. **이 문서 §7 체크리스트 모두 ✅로** (사용자 직접, 1~2시간)
2. **§8 양식대로 사전 액션 결과를 다음 세션에 보고**
3. **다음 세션의 Claude가 `CLAUDE_CODE_PROMPT_v0.6.0_SOCIAL_LOGIN_IMPL.md` 작성**
4. **클로드코드 새 세션에 그 프롬프트 던져 v0.6.0 PR 진행**
5. **머지 + 배포 → 사용자 게스트/로그인 양쪽 동작 확인**
6. **v0.7.0 모바일 이어 작업 옵션 결정 (계정 위에서)**

---

> **이 문서는 사용자 작업 가이드다.** 코드 변경 0. 외부 콘솔 등록만 다룸. 사전 액션 진행 중 의문점 있으면 다음 세션에서 질문하면 됨.
