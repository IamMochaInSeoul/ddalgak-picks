# Claude Code 작업 프롬프트 — v0.6.0 소셜 로그인 구현 (카카오·네이버·구글)

> **작성일:** 2026-05-04
> **기준 버전:** main (v0.5.4 머지 + 프로덕션 배포 완료 가정)
> **목표 태그:** `v0.5.4-stable` → `v0.6.0`
> **브랜치:** `feat/v0.6.0-social-login`
> **선행 조건:** **`CLAUDE_CODE_PROMPT_v0.6.0_SOCIAL_LOGIN_PREP.md` §7 체크리스트 모두 ✅ + 사용자 사전 액션 완료**
> **상위 문서:** `PROJECT_STATUS.md` v0.6.0 섹션 / `DESIGN_DIRECTION.md` (v2.2 전체) / `SECURITY.md`
>
> **이 문서의 목적:** Supabase Auth 활성화 + 카카오·네이버·구글 OAuth 연결 + 게스트 모드 호환 + UUID 어뷰징 방지 1차 인프라를 단일 PR로 처리.
>
> **사용 방법:** §"바로 시작 프롬프트" 코드블록 통째로 복사해 Claude Code 새 세션에 붙여넣기.

---

## 0. 이 PR의 작업 범위 한 줄 요약

> Supabase Auth + 3 Provider OAuth(Google·카카오·네이버) + 게스트 모드 호환 + UserProfile 확장 + 게스트→로그인 IndexedDB 마이그레이션 + Device Fingerprint 어뷰징 감지(조용히 플래그) + RLS 기본 정책.
>
> **새 lib 4개**(`supabaseClient.ts`, `useAuth.ts`, `authMigration.ts`, `deviceFingerprint.ts`), **새 컴포넌트 2개**(`AuthModal.tsx`, `UserMenu.tsx`), **새 라우트 1개**(`/auth/callback`), **새 의존성 2개**(`@supabase/supabase-js`, `@fingerprintjs/fingerprintjs`).

---

## 1. 보안 절대 룰

### 1-1. 필독 파일 (작업 시작 전, 순서대로)

1. `/SECURITY.md` — **§5 Supabase 시크릿 처리 + §6 사진 데이터 외부 송출 금지** 특히
2. `/PRE_PUSH_SECURITY_CHECKLIST.md`
3. `/PROJECT_STATUS.md` — **v0.6.0 섹션**
4. `/CLAUDE_CODE_PROMPT_v0.6.0_SOCIAL_LOGIN_PREP.md` — 사전 액션 결과 보고 (사용자가 메시지로 전달한 정보)
5. `/DESIGN_DIRECTION.md` — v2.2 전체

### 1-2. 절대 룰

- ❌ `dist/` 디렉토리 git 추가 금지
- ❌ **서버 시크릿(`SUPABASE_SERVICE_ROLE_KEY`·`NAVER_CLIENT_SECRET` 등)에 `VITE_` 접두사 부착 금지**
- ❌ `npx vercel --prod` 사용자 승인 전 절대 금지
- ❌ main 직접 커밋 금지
- ❌ PRE_PUSH §1~§8 통과 없이 push 금지
- ❌ **사용자 이메일·이름·소셜 ID를 GA4 이벤트나 외부 서비스로 송출 금지**
- ❌ **사진 원본·임베딩을 Supabase Storage 또는 어디든 업로드 금지** — v0.7.0 영역
- ❌ **로그인 강제 금지 — 게스트 모드 호환 필수.** 로그인 안 해도 셀렉 모든 기능 사용 가능해야 함
- ❌ 분석 파이프라인·Zustand 스토어 시그니처 변경 금지 (필드 추가는 OK)
- ❌ 결제 활성화 작업 시작 금지 (사업자등록 후 별도)

### 1-3. Zustand 셀렉터 규칙

```ts
❌ const { a, b } = useStore((s) => ({ a: s.a, b: s.b }))  // React Error #185
✅ const a = useStore((s) => s.a)
```

### 1-4. 디자인 v2 톤

이 PR의 모든 카피·아이콘은 가이드 v2 따름:
- 이모지 0 (Provider 로고 SVG는 OK)
- 액센트는 잉크 블루 `var(--accent)` 단일
- AI 마케팅 금지어 사전 준수
- 로그인 카피는 큐레이터 톤 (`"계속하시려면 로그인하세요"` 또는 `"로그인해 다음에도 이어서 셀렉하세요"`)

---

## 2. 사전 환경 확인

```bash
cd ~/Documents/Claude/Projects/"vibe coding"/ddalgak-picks

git status                  # 클린
git branch --show-current   # 'main' 출력 필수
git pull
git log --oneline -5        # v0.5.4 머지 흔적 확인
git tag -l "v0.5.4"         # v0.5.4 태그 존재 확인

# 환경변수 사전 점검 (사용자가 PREP 가이드 §7 완료했는지)
grep -E "VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY" .env 2>/dev/null && echo "로컬 .env에 SUPABASE 키 있음 (선택)"

# Vercel CLI로 프로덕션 환경변수 확인 (필요 시)
npx vercel env ls
# → VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_AUTH_REDIRECT_URL이 Production에 있어야 함
```

**다음 중 하나라도 미확인이면 작업 중단**:
- v0.5.4 머지·태그 없음
- `VITE_SUPABASE_URL`·`VITE_SUPABASE_ANON_KEY`·`VITE_AUTH_REDIRECT_URL` Vercel Production에 미등록
- Supabase Dashboard에서 Google·카카오·네이버 Provider 등록 안 됨

→ 사용자에게 보고 후 사전 액션 마무리 요청.

---

## 3. 롤백 안전장치

```bash
git checkout main && git pull
git tag -a v0.5.4-stable -m "Stable baseline before v0.6.0 social login"
git push origin v0.5.4-stable
git checkout -b feat/v0.6.0-social-login
```

---

## 4. 의존성 설치

```bash
npm install @supabase/supabase-js@^2 @fingerprintjs/fingerprintjs@^4
```

이 두 개는 OSS 무료. PRE_PUSH §6(npm audit)에서 고/심각 취약점 0인지 확인.

---

## 5. 작업 범위 (7묶음, 커밋 7개)

> **순서 중요:** 5-1(인프라) → 5-2(Auth Hook) → 5-3(UserProfile) → 5-4(UI) → 5-5(콜백) → 5-6(마이그레이션) → 5-7(어뷰징 방지). 각 커밋 독립 검증 가능하게.

---

### 5-1. Supabase 클라이언트 + RLS SQL (커밋 1)

#### 5-1-A. 신규 파일: `src/lib/supabaseClient.ts`

```typescript
/**
 * supabaseClient.ts — Supabase JS 클라이언트 싱글톤
 *
 * - ANON 키만 사용 (Public). Service Role은 절대 클라이언트에 포함 안 함
 * - 로컬 세션은 IndexedDB가 아니라 localStorage (Supabase 기본)
 * - 토큰 자동 갱신 활성화
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    console.warn("[supabase] env not set — auth disabled, guest mode only");
    return null;
  }
  if (client) return client;
  client = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,    // OAuth 콜백 자동 처리
      storageKey: "ddalgak-auth-v1",
    },
  });
  return client;
}

export function isAuthAvailable(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON);
}
```

#### 5-1-B. 신규 파일: `supabase/migrations/20260504_v055_auth_init.sql`

```sql
-- v0.6.0 — 사용자 프로필 + RLS 정책

-- 1) user_profiles 테이블
create table if not exists public.user_profiles (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  nickname       text,
  honorific      text default '님',
  email          text,                  -- Provider 동의 시 채움
  provider       text,                  -- 'google' | 'kakao' | 'naver'
  provider_user_id text,                -- Provider별 식별자
  total_sessions int default 0,
  language       text default 'ko',
  hero_person_names jsonb default '{}'::jsonb,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- 2) user_devices 테이블 (UUID 어뷰징 방지 1차)
create table if not exists public.user_devices (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  fingerprint_hash text not null,       -- FingerprintJS OSS 해시
  first_seen_at  timestamptz default now(),
  last_seen_at   timestamptz default now()
);
create index if not exists user_devices_fp_idx on public.user_devices(fingerprint_hash);
create index if not exists user_devices_user_idx on public.user_devices(user_id);

-- 3) RLS 활성화
alter table public.user_profiles enable row level security;
alter table public.user_devices  enable row level security;

-- 4) RLS 정책 — 본인 데이터만 read/write
create policy "user_profiles_owner_select" on public.user_profiles
  for select using (auth.uid() = user_id);
create policy "user_profiles_owner_upsert" on public.user_profiles
  for insert with check (auth.uid() = user_id);
create policy "user_profiles_owner_update" on public.user_profiles
  for update using (auth.uid() = user_id);

create policy "user_devices_owner_select" on public.user_devices
  for select using (auth.uid() = user_id);
create policy "user_devices_owner_insert" on public.user_devices
  for insert with check (auth.uid() = user_id);

-- 5) updated_at 자동 갱신 트리거
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger user_profiles_touch
  before update on public.user_profiles
  for each row execute function public.touch_updated_at();
```

#### 5-1-C. 마이그레이션 적용

```bash
# Supabase CLI 사용 (로컬에서)
~/bin/supabase db push --project-ref <your-project-ref>

# 또는 Supabase Dashboard → SQL Editor에 위 파일 내용 붙여넣어 실행
```

> **수동 실행 권장:** Supabase CLI 인증·연결 문제 회피. SQL Editor가 가장 안전.

#### 5-1-D. 검증

```bash
# 클라이언트 코드 검증
grep -nE "SUPABASE_SERVICE_ROLE|service_role" src/
# → 출력 0 (Service Role은 클라이언트에 절대 포함 X)

# 의존성 추가 확인
grep "@supabase/supabase-js" package.json
```

#### 5-1-E. 커밋

```bash
git add src/lib/supabaseClient.ts supabase/migrations/20260504_v055_auth_init.sql package.json package-lock.json
git commit -m "feat(auth): Supabase client singleton + RLS migration (v0.6.0 base)"
```

---

### 5-2. useAuth Hook + 세션 상태 (커밋 2)

#### 5-2-A. 신규 파일: `src/lib/useAuth.ts`

```typescript
/**
 * useAuth — 클라이언트 인증 상태 React Hook
 *
 * - 게스트 모드: session === null 일 때. 모든 셀렉 기능 정상 동작
 * - 로그인 시: session.user.id를 user_profiles와 결합해 nickname·heroPersonNames 동기화
 * - logout: localStorage Supabase 토큰 제거 + 게스트 모드로 복귀 (IndexedDB 데이터는 보존)
 */

import { useEffect, useState, useCallback } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase, isAuthAvailable } from "./supabaseClient";

export type Provider = "google" | "kakao" | "naver";

export interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isGuest: boolean;
  isAuthAvailable: boolean;
  signInWithProvider: (provider: Provider) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
  const supa = getSupabase();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supa) {
      setLoading(false);
      return;
    }
    let mounted = true;

    // 초기 세션 로드
    supa.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setLoading(false);
      }
    });

    // 변화 구독
    const { data: sub } = supa.auth.onAuthStateChange((_event, newSession) => {
      if (mounted) setSession(newSession);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [supa]);

  const signInWithProvider = useCallback(async (provider: Provider): Promise<{ error?: string }> => {
    if (!supa) return { error: "Auth 비활성 — Supabase 설정이 필요합니다" };
    const redirectTo = (import.meta.env.VITE_AUTH_REDIRECT_URL as string)
                    + "/auth/callback";
    const { error } = await supa.auth.signInWithOAuth({
      provider: provider as "google" | "kakao",   // 카카오는 Supabase v2.39+ 표준 지원
      options: { redirectTo },
    });
    return error ? { error: error.message } : {};
  }, [supa]);

  const signOut = useCallback(async () => {
    if (!supa) return;
    await supa.auth.signOut();
    setSession(null);
  }, [supa]);

  return {
    session,
    user: session?.user ?? null,
    loading,
    isGuest: !session && !loading,
    isAuthAvailable: isAuthAvailable(),
    signInWithProvider,
    signOut,
  };
}
```

> **카카오 Provider 처리 — 두 가지 분기:**
>
> - **옵션 A (Supabase v2.39+ 기본 지원):** 위 코드 그대로 `provider: "kakao"` 전달
> - **옵션 B (Custom OIDC + Edge Function):** 부록 A-1의 대안 코드로 교체
>
> **사전 액션 보고에서 사용자가 어느 옵션 선택했는지 확인하고 적용.**

> **네이버 Provider 처리 (Supabase 미지원):**
>
> 네이버는 표준 OIDC 비완전 호환. Supabase Edge Function으로 OAuth 프록시 구현 필요. 부록 A-2 참조.

#### 5-2-B. 검증

```bash
# Hook export 확인
grep -nE "^export" src/lib/useAuth.ts
# → useAuth, AuthState, Provider 등 3개 이상

# Service Role 미참조
grep -n "service_role\|SUPABASE_SERVICE" src/lib/useAuth.ts
# → 출력 0
```

#### 5-2-C. 커밋

```bash
git add src/lib/useAuth.ts
git commit -m "feat(auth): useAuth hook with guest mode compat"
```

---

### 5-3. UserProfile 모델 확장 + Supabase 동기화 (커밋 3)

#### 5-3-A. 변경 파일: `src/lib/userProfile.ts`

기존 인터페이스 보존 + Supabase 동기화 필드 추가:

```typescript
export interface UserProfile {
  // ── 기존 필드 (보존) ──
  nickname: string | null;
  honorific: "님" | "씨" | null;
  firstVisitAt: number;
  totalSessions: number;
  totalPhotosProcessed: number;
  totalPhotosSelected: number;
  preferredFlowMode: "A" | "B" | "C" | null;
  language: "ko" | "en";
  nicknameDeferredUntilSession?: number;
  heroPersonNames?: Record<string, string>;

  // ── v0.6.0 신규 ──
  /** 로그인된 경우 Supabase auth.uid */
  userId?: string;
  /** 인증 Provider */
  provider?: "google" | "kakao" | "naver";
  /** Provider별 식별자 */
  providerUserId?: string;
  /** Provider 동의 시 이메일 */
  email?: string;
}
```

#### 5-3-B. 신규 함수: `syncWithSupabase`

기존 `userProfile.ts` 끝에 추가:

```typescript
import { getSupabase } from "./supabaseClient";
import type { User } from "@supabase/supabase-js";

/**
 * 로그인 직후 호출. localStorage 프로필을 Supabase user_profiles와 동기화.
 * - 처음 로그인: localStorage → Supabase 업로드
 * - 재로그인: Supabase가 우선 (다른 디바이스 변경 반영) + heroPersonNames 머지
 */
export async function syncWithSupabase(user: User): Promise<void> {
  const supa = getSupabase();
  if (!supa) return;

  const local = loadProfile();

  // 1) Supabase에서 가져옴
  const { data: remote, error } = await supa
    .from("user_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.warn("[userProfile] Supabase fetch failed:", error);
    return;
  }

  if (!remote) {
    // 첫 로그인 — localStorage → Supabase 업로드
    const provider = (user.app_metadata?.provider ?? null) as UserProfile["provider"];
    const providerUserId = user.user_metadata?.sub ?? user.user_metadata?.provider_id ?? null;

    await supa.from("user_profiles").insert({
      user_id: user.id,
      nickname: local.nickname,
      honorific: local.honorific ?? "님",
      email: user.email ?? null,
      provider,
      provider_user_id: providerUserId,
      total_sessions: local.totalSessions,
      language: local.language,
      hero_person_names: local.heroPersonNames ?? {},
    });

    saveProfile({
      userId: user.id,
      provider,
      providerUserId: providerUserId ?? undefined,
      email: user.email ?? undefined,
    });
    return;
  }

  // 재로그인 — Supabase 우선 + heroPersonNames 머지
  const mergedHeroNames = {
    ...(remote.hero_person_names ?? {}),
    ...(local.heroPersonNames ?? {}),
  };

  saveProfile({
    nickname: remote.nickname ?? local.nickname,
    honorific: (remote.honorific as "님" | "씨") ?? "님",
    totalSessions: Math.max(remote.total_sessions ?? 0, local.totalSessions),
    language: (remote.language as "ko" | "en") ?? local.language,
    heroPersonNames: mergedHeroNames,
    userId: user.id,
    provider: remote.provider as UserProfile["provider"],
    providerUserId: remote.provider_user_id ?? undefined,
    email: remote.email ?? user.email ?? undefined,
  });

  // 머지 결과를 다시 Supabase에 업로드 (heroPersonNames만 갱신)
  await supa.from("user_profiles")
    .update({ hero_person_names: mergedHeroNames })
    .eq("user_id", user.id);
}
```

#### 5-3-C. 검증

```bash
grep -n "syncWithSupabase\|userId\|providerUserId" src/lib/userProfile.ts
# 새 export·필드 모두 추가됨

# 타입체크
npx tsc --noEmit
```

#### 5-3-D. 커밋

```bash
git add src/lib/userProfile.ts
git commit -m "feat(profile): extend UserProfile with auth fields + Supabase sync"
```

---

### 5-4. AuthModal + UserMenu + AppShell 헤더 통합 (커밋 4)

#### 5-4-A. 신규 파일: `src/components/AuthModal.tsx`

```tsx
import { useState } from "react";
import { useAuth, type Provider } from "../lib/useAuth";
import { isFreeBeta } from "../lib/freeBetaConfig";

interface Props {
  open: boolean;
  onClose: () => void;
  /** 안내 카피 — 어디서 호출됐는지에 따라 다른 톤 */
  reason?: "save_session" | "resume_other_device" | "default";
}

export default function AuthModal({ open, onClose, reason = "default" }: Props) {
  const { signInWithProvider, isAuthAvailable } = useAuth();
  const [pending, setPending] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const reasonCopy: Record<string, string> = {
    save_session: "이 세션을 저장하면 다른 기기에서도 이어서 작업할 수 있습니다.",
    resume_other_device: "다른 기기에서 이어서 셀렉하시려면 로그인하세요.",
    default: "로그인하면 셀렉 기록이 안전하게 보관됩니다.",
  };

  const handle = async (provider: Provider) => {
    setPending(provider);
    setError(null);
    const { error } = await signInWithProvider(provider);
    if (error) {
      setError(error);
      setPending(null);
    }
    // 성공 시 OAuth 리다이렉트 → 콜백 처리
  };

  return (
    <div
      role="dialog" aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9700,
        background: "rgba(14, 13, 11, 0.92)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "var(--space-6)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 420, width: "100%",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-12) var(--space-8)",
        }}
      >
        <h2 style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-xl)",
          color: "var(--text-primary)",
          marginTop: 0, marginBottom: "var(--space-3)",
          fontWeight: 400,
        }}>
          로그인
        </h2>

        <p style={{
          fontSize: "var(--text-base)",
          color: "var(--text-secondary)",
          marginBottom: "var(--space-8)",
          lineHeight: "var(--leading-base)",
        }}>
          {reasonCopy[reason]}
        </p>

        {!isAuthAvailable && (
          <p style={{
            color: "var(--critical)",
            fontSize: "var(--text-sm)",
            marginBottom: "var(--space-4)",
          }}>
            인증 서비스가 비활성 상태입니다. 게스트 모드로 계속 사용하실 수 있습니다.
          </p>
        )}

        {(["google", "kakao", "naver"] as Provider[]).map((p) => (
          <button
            key={p}
            onClick={() => handle(p)}
            disabled={pending !== null || !isAuthAvailable}
            style={{
              width: "100%",
              padding: "14px",
              marginBottom: "var(--space-3)",
              background: "transparent",
              color: "var(--text-primary)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-sm)",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-md)",
              cursor: pending !== null ? "default" : "pointer",
              opacity: pending !== null ? 0.5 : 1,
              touchAction: "manipulation",
            }}
          >
            {pending === p ? "이동 중..."
              : p === "google" ? "Google로 계속"
              : p === "kakao" ? "카카오로 계속"
              : "네이버로 계속"}
          </button>
        ))}

        {error && (
          <p style={{
            color: "var(--critical)",
            fontSize: "var(--text-sm)",
            marginTop: "var(--space-4)",
          }}>
            {error}
          </p>
        )}

        {isFreeBeta() && (
          <p style={{
            fontSize: "var(--text-xs)",
            color: "var(--text-tertiary)",
            fontFamily: "var(--font-display)",
            fontStyle: "italic",
            marginTop: "var(--space-6)",
            textAlign: "center",
          }}>
            현재 무료 베타 — 결제 없이 모든 기능 사용 가능합니다.
          </p>
        )}

        <button
          onClick={onClose}
          style={{
            width: "100%",
            padding: "10px",
            marginTop: "var(--space-4)",
            background: "transparent",
            color: "var(--text-tertiary)",
            border: "none",
            cursor: "pointer",
            fontSize: "var(--text-sm)",
          }}
        >
          나중에 (게스트로 계속)
        </button>
      </div>
    </div>
  );
}
```

#### 5-4-B. 신규 파일: `src/components/UserMenu.tsx`

```tsx
import { useState } from "react";
import { useAuth } from "../lib/useAuth";
import { loadProfile } from "../lib/userProfile";

export default function UserMenu() {
  const { user, isGuest, signOut, isAuthAvailable } = useAuth();
  const [openLogin, setOpenLogin] = useState(false);
  const profile = loadProfile();

  if (!isAuthAvailable) return null;

  if (isGuest) {
    return (
      <>
        <button
          onClick={() => setOpenLogin(true)}
          style={{
            background: "transparent",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-secondary)",
            padding: "6px 14px",
            fontSize: "var(--text-sm)",
            fontFamily: "var(--font-sans)",
            cursor: "pointer",
            touchAction: "manipulation",
          }}
        >
          로그인
        </button>
        {/* AuthModal은 lazy import 권장 — 일단 인라인 */}
      </>
    );
  }

  // 로그인 상태
  const displayName = profile.nickname ?? user?.email?.split("@")[0] ?? "회원";

  return (
    <details style={{ position: "relative" }}>
      <summary
        style={{
          listStyle: "none",
          cursor: "pointer",
          background: "transparent",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-sm)",
          color: "var(--text-primary)",
          padding: "6px 14px",
          fontSize: "var(--text-sm)",
          fontFamily: "var(--font-sans)",
          touchAction: "manipulation",
        }}
      >
        {displayName}
      </summary>
      <div style={{
        position: "absolute", right: 0, top: "calc(100% + 4px)",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-sm)",
        minWidth: 180,
        padding: "var(--space-3)",
        zIndex: 100,
      }}>
        <div style={{
          fontSize: "var(--text-xs)",
          color: "var(--text-tertiary)",
          padding: "0 var(--space-3) var(--space-3)",
          borderBottom: "1px solid var(--border-subtle)",
          marginBottom: "var(--space-3)",
        }}>
          {user?.email ?? "로그인됨"}
        </div>
        <button
          onClick={() => signOut()}
          style={{
            width: "100%",
            padding: "8px var(--space-3)",
            background: "transparent",
            border: "none",
            color: "var(--text-secondary)",
            textAlign: "left",
            fontSize: "var(--text-sm)",
            cursor: "pointer",
            touchAction: "manipulation",
          }}
        >
          로그아웃
        </button>
      </div>
    </details>
  );
}
```

#### 5-4-C. 변경 파일: `src/components/Landing.tsx`

기존 헤더 영역에 UserMenu 추가:

```tsx
import UserMenu from "./UserMenu";
import AuthModal from "./AuthModal";

// 헤더 우측 (LangToggle 옆)
<header style={{
  position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "14px 28px",
  borderBottom: "1px solid var(--border-subtle)",
  background: "rgba(14, 13, 11, 0.85)",
  backdropFilter: "blur(12px)",
}}>
  <span style={{ /* 로고 */ }}>딸깍픽스</span>
  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
    <LangToggle />
    <UserMenu />
  </div>
</header>
```

UserMenu 내부에서 AuthModal을 lazy로 띄우도록 정리(또는 Landing 레벨에서 modal state 관리). 본 PR에서는 AuthModal을 UserMenu 안에 합쳐도 OK.

#### 5-4-D. 검증

```bash
ls src/components/AuthModal.tsx src/components/UserMenu.tsx

# 게스트 모드 호환 — 로그인 안 해도 진행 가능
grep -n "isGuest\|nullable" src/lib/useAuth.ts src/components/AuthModal.tsx
```

#### 5-4-E. 커밋

```bash
git add src/components/AuthModal.tsx src/components/UserMenu.tsx \
        src/components/Landing.tsx
git commit -m "feat(auth): AuthModal + UserMenu + header integration"
```

---

### 5-5. OAuth 콜백 라우트 + 세션 동기화 (커밋 5)

#### 5-5-A. 신규 파일: `src/components/AuthCallback.tsx`

```tsx
import { useEffect, useState } from "react";
import { getSupabase } from "../lib/supabaseClient";
import { syncWithSupabase } from "../lib/userProfile";
import { recordDeviceFingerprint } from "../lib/deviceFingerprint";

export default function AuthCallback() {
  const [status, setStatus] = useState<"processing" | "done" | "error">("processing");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const supa = getSupabase();
    if (!supa) {
      setStatus("error");
      setErrorMsg("인증 서비스 연결 실패");
      return;
    }

    (async () => {
      try {
        // Supabase가 detectSessionInUrl: true로 자동 처리
        const { data: { session }, error } = await supa.auth.getSession();
        if (error || !session) throw new Error(error?.message ?? "세션 없음");

        // 프로필 동기화 (localStorage ↔ Supabase)
        await syncWithSupabase(session.user);

        // Device Fingerprint 기록 (어뷰징 방지)
        await recordDeviceFingerprint(session.user.id).catch(() => {});

        setStatus("done");

        // 1초 후 홈으로
        setTimeout(() => {
          window.location.href = "/";
        }, 600);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "알 수 없는 오류";
        console.error("[auth/callback] failed:", e);
        setErrorMsg(msg);
        setStatus("error");
      }
    })();
  }, []);

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "var(--bg-base)",
      padding: "var(--space-8)",
      textAlign: "center",
    }}>
      {status === "processing" && (
        <p style={{
          fontFamily: "var(--font-display)",
          fontStyle: "italic",
          color: "var(--text-secondary)",
          fontSize: "var(--text-md)",
        }}>
          로그인 처리 중입니다.
        </p>
      )}
      {status === "done" && (
        <p style={{
          color: "var(--text-primary)",
          fontSize: "var(--text-md)",
        }}>
          완료. 잠시 후 홈으로 이동합니다.
        </p>
      )}
      {status === "error" && (
        <>
          <p style={{ color: "var(--critical)", fontSize: "var(--text-md)" }}>
            로그인 실패
          </p>
          <p style={{
            color: "var(--text-tertiary)",
            fontSize: "var(--text-sm)",
            marginTop: "var(--space-3)",
          }}>
            {errorMsg}
          </p>
          <button
            onClick={() => window.location.href = "/"}
            style={{
              marginTop: "var(--space-6)",
              padding: "10px 20px",
              background: "var(--accent)",
              color: "var(--bg-base)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              fontSize: "var(--text-md)",
            }}
          >
            홈으로
          </button>
        </>
      )}
    </div>
  );
}
```

#### 5-5-B. 변경 파일: `src/components/AppShell.tsx`

콜백 경로 분기 추가:

```tsx
import AuthCallback from "./AuthCallback";

// AppShell 안 라우팅 분기 (window.location.pathname 기반)
const isCallbackRoute = typeof window !== "undefined"
  && window.location.pathname.startsWith("/auth/callback");

if (isCallbackRoute) {
  return <AuthCallback />;
}

// 기존 step 라우팅
return (...);
```

#### 5-5-C. 변경 파일: `vercel.json`

SPA 클라이언트 라우팅을 위한 rewrite 확인. 기존 `/privacy` 처럼:

```json
{
  "rewrites": [
    { "source": "/privacy", "destination": "/privacy.html" },
    { "source": "/auth/callback", "destination": "/index.html" }
  ]
}
```

#### 5-5-D. 검증

```bash
# 콜백 라우트 처리 확인
grep -n "/auth/callback" src/components/AppShell.tsx vercel.json
# 양쪽에 있어야 함

# Supabase detectSessionInUrl 옵션
grep -n "detectSessionInUrl" src/lib/supabaseClient.ts
# true이어야 함
```

#### 5-5-E. 커밋

```bash
git add src/components/AuthCallback.tsx src/components/AppShell.tsx vercel.json
git commit -m "feat(auth): /auth/callback route + session sync after OAuth"
```

---

### 5-6. 게스트 → 로그인 전환 시 IndexedDB 데이터 마이그레이션 (커밋 6)

#### 5-6-A. 신규 파일: `src/lib/authMigration.ts`

```typescript
/**
 * authMigration.ts — 게스트 모드에서 쌓인 IndexedDB 데이터를 로그인 후에도 보존
 *
 * - OPFS 폴더 세션: 그대로 유지 (origin 단위라 자동 보존)
 * - pastSelectionStore (중복 지문): 그대로 유지
 * - preferenceProfile (취향 가중치): 그대로 유지
 * - localStorage userProfile: syncWithSupabase가 처리 (heroPersonNames 머지)
 *
 * 즉, 마이그레이션은 "데이터를 옮긴다"가 아니라
 * "기존 데이터에 user_id 라벨을 붙여 다음 디바이스 동기화 준비를 한다"
 *
 * 본 PR(v0.6.0)에서는 동기화 자체는 안 함 (v0.7.0 영역).
 * 단, 라벨링과 호환성 보장을 여기서 미리.
 */

import { listFolderSessions } from "./opfsStore";
import { loadProfile, saveProfile } from "./userProfile";

export interface MigrationReport {
  folderSessionCount: number;
  hasNickname: boolean;
  hasPreferences: boolean;
  message: string;
}

export async function reportMigrationStatus(): Promise<MigrationReport> {
  const profile = loadProfile();
  const sessions = await listFolderSessions().catch(() => []);

  return {
    folderSessionCount: sessions.length,
    hasNickname: !!profile.nickname,
    hasPreferences: !!profile.heroPersonNames && Object.keys(profile.heroPersonNames).length > 0,
    message: sessions.length > 0
      ? `${sessions.length}개의 미완료 세션이 보존됩니다.`
      : "보존할 세션이 없습니다.",
  };
}

/**
 * 로그인 직후 호출. localStorage 프로필에 user_id 추가 + 게스트 흔적 정리
 */
export function tagGuestDataWithUser(userId: string): void {
  saveProfile({ userId });
}
```

#### 5-6-B. 변경 파일: `src/components/AuthCallback.tsx`

성공 처리에 `tagGuestDataWithUser(session.user.id)` 호출 추가:

```typescript
import { tagGuestDataWithUser } from "../lib/authMigration";

// syncWithSupabase 직후
tagGuestDataWithUser(session.user.id);
```

#### 5-6-C. 변경 파일: `src/components/AuthModal.tsx`

`save_session` reason일 때 진행 전에 마이그레이션 보고서 노출:

```tsx
import { reportMigrationStatus, type MigrationReport } from "../lib/authMigration";

const [migration, setMigration] = useState<MigrationReport | null>(null);

useEffect(() => {
  if (open && reason === "save_session") {
    reportMigrationStatus().then(setMigration);
  }
}, [open, reason]);

// 모달 안에 추가
{migration && reason === "save_session" && (
  <p style={{
    fontSize: "var(--text-sm)",
    color: "var(--text-secondary)",
    marginBottom: "var(--space-4)",
    fontFamily: "var(--font-display)",
    fontStyle: "italic",
  }}>
    {migration.message}
  </p>
)}
```

#### 5-6-D. 검증

```bash
grep -n "tagGuestDataWithUser\|reportMigrationStatus" src/
# AuthCallback + AuthModal에서 사용
```

#### 5-6-E. 커밋

```bash
git add src/lib/authMigration.ts src/components/AuthCallback.tsx \
        src/components/AuthModal.tsx
git commit -m "feat(auth): guest→login migration tagging (v0.6 device sync prep)"
```

---

### 5-7. UUID 어뷰징 방지 1차 — Device Fingerprint (커밋 7)

#### 5-7-A. 신규 파일: `src/lib/deviceFingerprint.ts`

```typescript
/**
 * deviceFingerprint.ts — UUID 어뷰징 방지 1차 인프라
 *
 * - FingerprintJS OSS로 브라우저 fingerprint 해시 생성
 * - 같은 fingerprint가 여러 user_id에 매핑되면 user_devices 테이블에 누적
 * - **차단은 안 함** — 운영자 대시보드에서만 식별 가능 (조용히 플래그)
 * - 결제 활성화 + 할인 어뷰징 실제 문제로 떠올랐을 때 차단 정책 도입
 *
 * 보안:
 * - fingerprint는 단방향 해시. 원본 데이터 미저장
 * - PII 아님 (브라우저 + OS + Canvas hash 조합)
 */

import FingerprintJS from "@fingerprintjs/fingerprintjs";
import { getSupabase } from "./supabaseClient";

let cachedHash: string | null = null;

async function getFingerprintHash(): Promise<string> {
  if (cachedHash) return cachedHash;
  const fp = await FingerprintJS.load();
  const result = await fp.get();
  cachedHash = result.visitorId;   // 단방향 해시
  return cachedHash;
}

/**
 * 로그인 직후 호출. 현재 디바이스 fingerprint를 user_devices에 기록.
 * 같은 fingerprint가 다른 user_id로 이미 등록돼 있어도 그냥 추가 (운영자가 후속 분석).
 */
export async function recordDeviceFingerprint(userId: string): Promise<void> {
  const supa = getSupabase();
  if (!supa) return;

  try {
    const fingerprint = await getFingerprintHash();
    await supa.from("user_devices").upsert({
      user_id: userId,
      fingerprint_hash: fingerprint,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "user_id,fingerprint_hash" });
  } catch (e) {
    console.warn("[deviceFingerprint] record failed:", e);
  }
}

/**
 * 같은 fingerprint를 사용한 다른 사용자가 있는지 확인.
 * 본 PR에서는 운영자 디버깅용 — UI 노출 안 함.
 */
export async function detectSiblingAccounts(userId: string): Promise<number> {
  const supa = getSupabase();
  if (!supa) return 0;
  try {
    const fingerprint = await getFingerprintHash();
    const { data, error } = await supa
      .from("user_devices")
      .select("user_id")
      .eq("fingerprint_hash", fingerprint)
      .neq("user_id", userId);
    if (error) return 0;
    return new Set((data ?? []).map((r) => r.user_id)).size;
  } catch {
    return 0;
  }
}
```

> **주의 — `user_devices` 스토어 onConflict 제약:** 위 upsert가 작동하려면 `user_devices`에 `(user_id, fingerprint_hash)` unique constraint 필요. SQL 마이그레이션(§5-1-B)에 추가 또는 별도 ALTER TABLE.

#### 5-7-B. 추가 SQL: 같은 마이그레이션 파일에

```sql
-- §5-7 unique constraint
alter table public.user_devices
  add constraint user_devices_user_fp_unique unique (user_id, fingerprint_hash);
```

> 이미 `20260504_v055_auth_init.sql`에 5-1-B 내용이 있으면 같은 파일에 ALTER 추가. 새 마이그레이션 파일로 분리해도 OK.

#### 5-7-C. 변경 파일: `src/components/AuthCallback.tsx`

OAuth 성공 후 fingerprint 기록 (이미 5-5-A에서 추가됨, 검증):

```typescript
await recordDeviceFingerprint(session.user.id).catch(() => {});
```

#### 5-7-D. 검증

```bash
# FingerprintJS 의존성
grep "@fingerprintjs/fingerprintjs" package.json

# fingerprint hash 외부 송출 — Supabase user_devices 외 0
grep -rn "getFingerprintHash\|cachedHash" src/ | grep -E "fetch|axios|sendBeacon"
# 출력 0

# 차단 코드 없는지 확인 (조용히 플래그만)
grep -rn "block\|deny\|forbid" src/lib/deviceFingerprint.ts
# 출력 0
```

#### 5-7-E. 커밋

```bash
git add src/lib/deviceFingerprint.ts supabase/migrations/20260504_v055_auth_init.sql \
        package.json package-lock.json
git commit -m "feat(abuse): device fingerprint recording (silent flag, no blocking)"
```

---

## 6. 검증 절차

### 6-1. 타입체크 + 빌드

```bash
npx tsc --noEmit
npx vite build --outDir /tmp/ddalgak-build17
```

### 6-2. 회귀 + 신규 시나리오 (모두 ✅)

#### A) 회귀

1. **게스트 모드:** 로그인 안 한 상태에서 Flow A/B/C 분석 → 갤러리 → ZIP 모두 정상
2. PhotoDetailModal·OPFS·F18·NicknameCaptureModal 정상
3. 무료 베타 카피 정상

#### B) v0.6.0 신규 — 로그인

4. **Google 로그인:** 헤더 "로그인" → AuthModal → "Google로 계속" → OAuth 리다이렉트 → 콜백 → 홈으로 자동 복귀 → 헤더에 닉네임/이메일 노출
5. **카카오 로그인:** 동일 흐름 (Supabase v2.39+ 표준 또는 Custom OIDC, 부록 A-1)
6. **네이버 로그인:** 동일 흐름 (Custom OIDC + Edge Function, 부록 A-2)
7. **로그아웃:** UserMenu → "로그아웃" → 게스트 모드로 복귀 → IndexedDB 데이터(OPFS·중복지문) 보존 확인

#### C) Supabase 동기화

8. **첫 로그인:** Supabase Dashboard → user_profiles에 row 생성 + nickname·heroPersonNames 정확히 업로드
9. **재로그인:** 다른 디바이스에서 같은 계정 로그인 → localStorage 프로필이 Supabase 값으로 머지 (heroPersonNames 중복 머지 검증)

#### D) 게스트→로그인 마이그레이션

10. 게스트로 폴더 세션 1개 + 닉네임 등록 → 로그인 → 데이터 보존 확인 + Supabase에 nickname 업로드 확인

#### E) Device Fingerprint

11. **첫 디바이스 로그인:** Supabase user_devices에 row 1개
12. **같은 디바이스에서 다른 계정 가입:** user_devices에 같은 fingerprint_hash로 다른 user_id row 생성 (차단 없이)
13. **운영자 dashboard 검증:** SQL `select user_id from user_devices where fingerprint_hash = ? group by ...`로 sibling 식별 가능

#### F) RLS 정책

14. 본인 user_profiles row만 SELECT/UPDATE 가능 (다른 user_id row 접근 시 0 row 반환)

### 6-3. PRE_PUSH + v0.6.0 추가 검증

```bash
# (a) Service Role 키 클라이언트 포함 여부
grep -rn "SUPABASE_SERVICE_ROLE\|service_role" src/
# 출력 0

# (b) Provider Client Secret 클라이언트 포함 여부
grep -rnE "(KAKAO_CLIENT_SECRET|NAVER_CLIENT_SECRET|GOOGLE_CLIENT_SECRET)" src/
# 출력 0 (Supabase Dashboard에만 존재해야 함)

# (c) 사용자 PII GA4 송출 (회귀)
grep -rnE "track\(.*email|track\(.*nickname|track\(.*provider_user" src/
# 출력 0

# (d) fingerprint 외부 송출 (Supabase user_devices만)
grep -rn "fingerprint_hash\|getFingerprintHash" src/ | grep -E "fetch|axios|sendBeacon"
# 출력 0

# (e) 사진 데이터 외부 송출 (Auth 도입으로도 변하면 안 됨)
grep -rn "photo.file\|photo.thumbnail" src/lib/supabaseClient.ts src/lib/useAuth.ts \
       src/lib/authMigration.ts src/lib/deviceFingerprint.ts
# 출력 0

# (f) RLS 정책 SQL 존재
grep -nE "row level security|create policy" supabase/migrations/20260504_v055_auth_init.sql
# 정책 6개 이상

# (g) 게스트 모드 호환 — 로그인 강제 패턴 없음
grep -rnE "if\s*\(\s*!session\s*\)\s*\{[^}]*setStep.*login|requireAuth|forceLogin" src/
# 출력 0
```

(a)~(g) 7개 grep 모두 결과 정상이면 push 가능.

⛔ 1건이라도 위반이면 **push 중단**.

---

## 7. 푸시 + 프리뷰

```bash
git push -u origin feat/v0.6.0-social-login
npx vercel    # 프리뷰만. --prod 절대 금지
```

프리뷰 URL에서 핵심 검증:
- 게스트 모드: 로그인 안 해도 모든 셀렉 기능 동작
- 3 Provider 로그인 모두 정상
- 로그아웃 후 데이터 보존
- Supabase user_profiles·user_devices 테이블에 정확히 row 생성

---

## 8. 작업 완료 보고 (이 양식 그대로)

```
## v0.6.0 소셜 로그인 구현 완료

### 변경 요약 (커밋 7개)
- 커밋 1 — supabaseClient.ts + RLS 마이그레이션
- 커밋 2 — useAuth Hook (게스트 모드 호환)
- 커밋 3 — UserProfile 확장 + Supabase 동기화
- 커밋 4 — AuthModal + UserMenu + Landing 헤더 통합
- 커밋 5 — /auth/callback 라우트 + 세션 동기화
- 커밋 6 — 게스트→로그인 IndexedDB 라벨링
- 커밋 7 — Device Fingerprint 어뷰징 감지 (조용히 플래그)

### 신규 파일
- src/lib/supabaseClient.ts
- src/lib/useAuth.ts
- src/lib/authMigration.ts
- src/lib/deviceFingerprint.ts
- src/components/AuthModal.tsx
- src/components/UserMenu.tsx
- src/components/AuthCallback.tsx
- supabase/migrations/20260504_v055_auth_init.sql

### 신규 의존성
- @supabase/supabase-js@^2
- @fingerprintjs/fingerprintjs@^4

### 새 환경변수
- VITE_SUPABASE_URL (사전 등록 완료)
- VITE_SUPABASE_ANON_KEY (사전 등록 완료)
- VITE_AUTH_REDIRECT_URL (사전 등록 완료)

### Supabase Dashboard 작업 (사용자 확인 필요)
- Authentication → Providers → Google ON ✅
- Authentication → Providers → Kakao ON ✅ (옵션 A 또는 B)
- Authentication → Providers → Naver Custom OIDC ✅
- SQL Editor → 20260504_v055_auth_init.sql 실행 ✅

### PRE_PUSH 결과
§1~§8: ✅ ✅ ✅ ✅ ✅ ✅ ✅ (npm audit 의존성 추가 시 검토) ✅
v0.6.0 추가:
  (a) Service Role 클라 포함:    ✅
  (b) Provider Secret 클라 포함: ✅
  (c) GA4 PII 송출:              ✅
  (d) Fingerprint 외부 송출:     ✅
  (e) 사진 외부 송출:            ✅
  (f) RLS 정책 6개 이상:         ✅
  (g) 게스트 모드 호환:          ✅

### 회귀 + 신규 시나리오
1~14 모두 ✅

### Supabase 동작 확인
- user_profiles row 생성·heroPersonNames 머지: ✅
- user_devices fingerprint 기록: ✅
- RLS 본인 row만 접근: ✅

### 프리뷰 URL
https://ddalgak-picks-XXX.vercel.app

### 비교
프로덕션: v0.5.4
프리뷰:  v0.6.0 후보

### 인지된 이슈 (다음 PR로)
- 모바일 이어 작업 (디바이스 간 사진 동기화) — v0.7.0
- 결제 회원 ID 매핑 (사업자등록 후 자동 활성화)
- 단골 고객 어뷰징 차단 정책 — 실제 사례 발견 시 도입

### 롤백 / 머지

A) 롤백:
   git checkout main && git branch -D feat/v0.6.0-social-login
   git push origin --delete feat/v0.6.0-social-login
   # Supabase 마이그레이션 롤백:
   # supabase/migrations에 20260504_v055_auth_init_DOWN.sql 작성 후 실행

B) 머지:
   git checkout main
   git merge --no-ff feat/v0.6.0-social-login
   git tag -a v0.6.0 -m "v0.6.0 — social login (Google·Kakao·Naver) + abuse fingerprint"
   git push origin main && git push origin v0.6.0
   npx vercel --prod
```

---

## 9. 절대 하지 말 것

- ❌ `npx vercel --prod` 사용자 승인 전
- ❌ main 직접 커밋
- ❌ `dist/` 추가
- ❌ Service Role / Provider Client Secret 클라이언트 포함
- ❌ 로그인 강제 (게스트 모드 호환 깨면 안 됨)
- ❌ 사진 원본·임베딩 Supabase Storage 업로드 (v0.7.0 영역)
- ❌ GA4 이벤트에 이메일·닉네임·소셜 ID 포함
- ❌ Device Fingerprint로 사용자 차단 (조용히 플래그만)
- ❌ 분석 파이프라인 변경
- ❌ Stage D1 잔여·결제 활성화·v0.6 모바일 동기화 시작

---

## 10. 결정이 애매할 때

DESIGN_DIRECTION §7 + §12 + 본 PR 특화:

1. 이게 라이트룸 같은가, 카카오톡 같은가?
2. 큐레이터가 이렇게 말할까?
3. 이모지/느낌표 0인가?
4. **로그인 안 해도 같은 화면 진행 가능한가?** — 안 되면 게스트 모드 호환 깨짐
5. **사용자 PII가 외부 서비스로 송출되는가?** — 절대 X
6. **Supabase RLS 정책으로 본인 데이터만 접근되는가?** — 검증 필수

---

# 부록 A. Provider별 분기 코드

## A-1. 카카오 — 옵션 A (Supabase 표준 지원)

위 §5-2 코드 그대로. `provider: "kakao"` 전달.

## A-2. 카카오 — 옵션 B (Custom OIDC + Edge Function 프록시)

사전 액션 보고에서 사용자가 옵션 B를 선택했다면:

#### B-1. 신규 Edge Function: `supabase/functions/auth-kakao-callback/index.ts`

```typescript
// Deno Edge Function — 카카오 OAuth 콜백 프록시
// 클라이언트 → 카카오 OAuth → 이 Function → JWT 발급 → 클라이언트
//
// 환경변수 (Supabase secrets):
//   KAKAO_REST_API_KEY
//   KAKAO_CLIENT_SECRET
//   SUPABASE_SERVICE_ROLE_KEY (서버 전용)
//
// 단순 가정 코드 — 실 사용 시 보안 강화 필수
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const KAKAO_API_KEY = Deno.env.get("KAKAO_REST_API_KEY")!;
const KAKAO_SECRET  = Deno.env.get("KAKAO_CLIENT_SECRET")!;
const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return new Response("missing code", { status: 400 });

  // 1) 카카오 토큰 교환
  const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: KAKAO_API_KEY,
      client_secret: KAKAO_SECRET,
      code,
      redirect_uri: `${SUPABASE_URL}/functions/v1/auth-kakao-callback`,
    }),
  });
  const { access_token } = await tokenRes.json();

  // 2) 카카오 사용자 정보
  const meRes = await fetch("https://kapi.kakao.com/v2/user/me", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const me = await meRes.json();
  const kakaoId = String(me.id);
  const email = me.kakao_account?.email ?? null;

  // 3) Supabase Admin API로 사용자 생성·로그인
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // (실제 구현은 Supabase Admin generateLink 또는 createUser 사용)
  // 가정 — 사용자 생성 후 magic link 발급

  // 4) 클라이언트로 redirect (자동 로그인)
  return Response.redirect("/auth/callback?from=kakao", 302);
});
```

> **주의:** 옵션 B는 보안 검토 + Service Role 키 관리 + 카카오 정책 준수가 추가 필요. 옵션 A 가능하면 우선.

## A-3. 네이버 — Custom OIDC

네이버는 OIDC 표준 부분 호환. 옵션 B와 유사한 Edge Function 프록시 패턴 사용:

엔드포인트:
- Authorization: `https://nid.naver.com/oauth2.0/authorize`
- Token: `https://nid.naver.com/oauth2.0/token`
- UserInfo: `https://openapi.naver.com/v1/nid/me`

코드는 옵션 B(A-2)와 동일 패턴, 엔드포인트만 교체.

---

# 부록 B. RLS 추가 정책 (필요 시)

본 PR은 user_profiles·user_devices만 다룸. v0.7.0 모바일 이어 작업에서 사진 메타·세션 동기화 테이블 추가 시 동일 패턴으로 RLS 추가.

---

# 바로 시작 프롬프트 (Claude Code에 붙여넣기)

```
딸깍픽스 v0.6.0 소셜 로그인 작업이야. 단일 PR로 7묶음 처리.
v0.5.4 머지·프로덕션 배포 + CLAUDE_CODE_PROMPT_v0.6.0_SOCIAL_LOGIN_PREP.md §7 사전 액션 모두 완료된 상태에서만 진행.

# 0. 마스터 작업 지시서 정독
/Users/mocha.bun/Documents/Claude/Projects/vibe coding/ddalgak-picks/CLAUDE_CODE_PROMPT_v0.6.0_SOCIAL_LOGIN_IMPL.md

# 1. 보안·기획 정독 (순서대로)
1. /Users/mocha.bun/Documents/Claude/Projects/vibe coding/ddalgak-picks/SECURITY.md  ← §5/§6 특히
2. /Users/mocha.bun/Documents/Claude/Projects/vibe coding/ddalgak-picks/PRE_PUSH_SECURITY_CHECKLIST.md
3. /Users/mocha.bun/Documents/Claude/Projects/vibe coding/ddalgak-picks/PROJECT_STATUS.md  ← v0.6.0 섹션
4. /Users/mocha.bun/Documents/Claude/Projects/vibe coding/ddalgak-picks/CLAUDE_CODE_PROMPT_v0.6.0_SOCIAL_LOGIN_PREP.md  ← 사용자 사전 액션 결과 보고
5. /Users/mocha.bun/Documents/Claude/Projects/vibe coding/ddalgak-picks/DESIGN_DIRECTION.md  ← v2.2 전체 (큐레이터 톤 폐기 후 라이트 베이스)

# 2. 사전 환경 확인
```bash
cd ~/Documents/Claude/Projects/"vibe coding"/ddalgak-picks
git status
git branch --show-current   # main
git pull
git log --oneline -5        # v0.5.4 머지 흔적 필수
git tag -l "v0.5.4"
npx vercel env ls           # SUPABASE 환경변수 등록 확인
```
하나라도 미충족이면 작업 중단 + 사용자 보고.

# 3. 롤백 안전장치
```bash
git tag -a v0.5.4-stable -m "Stable baseline before v0.6.0"
git push origin v0.5.4-stable
git checkout -b feat/v0.6.0-social-login
```

# 4. 의존성 설치
```bash
npm install @supabase/supabase-js@^2 @fingerprintjs/fingerprintjs@^4
```

# 5. 작업 7묶음 (커밋 7개, 순서대로)
§5-1 ~ §5-7 그대로. 임의 판단 금지.

  5-1. supabaseClient.ts + RLS SQL 마이그레이션 [커밋 1]
  5-2. useAuth Hook + 게스트 모드 호환 [커밋 2]
  5-3. UserProfile 확장 + Supabase 동기화 [커밋 3]
  5-4. AuthModal + UserMenu + Landing 헤더 [커밋 4]
  5-5. AuthCallback 라우트 + Vercel rewrite [커밋 5]
  5-6. authMigration.ts (게스트 라벨링) [커밋 6]
  5-7. deviceFingerprint.ts (어뷰징 플래그) [커밋 7]

카카오는 사전 액션 보고에 따라 옵션 A(부록 A-1) 또는 옵션 B(부록 A-2).
네이버는 Custom OIDC + Edge Function (부록 A-3).

# 6. 검증
§6의 모든 항목. 회귀 3개 + 신규 11개 + PRE_PUSH §1~§8 + 추가 (a)~(g).

⛔ 1건이라도 위반이면 push 중단 + 사용자 보고.

특히 게스트 모드 호환(검증 (g)) — 로그인 안 해도 셀렉 모든 기능 동작해야 함.

# 7. 푸시 + 프리뷰
```bash
git push -u origin feat/v0.6.0-social-login
npx vercel    # --prod 절대 금지
```

# 8. 보고 양식
§8 그대로 출력. 3 Provider 로그인 동작 결과 반드시 포함.

# 9. 보안 절대 룰
- ❌ npx vercel --prod 금지
- ❌ main 직접 커밋 금지
- ❌ dist/ 추가 금지
- ❌ Service Role / Provider Secret 클라이언트 포함 금지
- ❌ 사진/임베딩 Supabase 업로드 금지 (v0.7.0 영역)
- ❌ 로그인 강제 금지 (게스트 모드 호환 필수)
- ❌ Device Fingerprint로 사용자 차단 금지 (조용히 플래그만)
- ❌ Stage D1 잔여 / 결제 활성화 / v0.6 모바일 동기화 시작 금지

# 10. 작업 시작
지금부터 §0~§9 순서대로 진행.
```

---

# 부록 C. 사용자(Minhyup)용 사용법

## C-1. 사전 조건
이 프롬프트를 클로드코드에 던지기 전에 반드시:
1. `CLAUDE_CODE_PROMPT_v0.6.0_SOCIAL_LOGIN_PREP.md` §7 체크리스트 모두 ✅
2. Vercel 환경변수 `VITE_SUPABASE_URL`·`VITE_SUPABASE_ANON_KEY`·`VITE_AUTH_REDIRECT_URL` 등록
3. Supabase Dashboard에서 Google·카카오·네이버 Provider 등록·테스트 완료

## C-2. 클로드코드 새 세션
"바로 시작 프롬프트" ``` 안 텍스트 통째로 복사 → 클로드코드 새 세션에 붙여넣기.

## C-3. 머지 전 핵심 검증 4가지
프리뷰 URL에서:
1. **게스트 모드:** 로그인 안 한 상태에서 Flow A/B/C 셀렉 → ZIP 정상 (회귀 0)
2. **3 Provider 로그인:** Google·카카오·네이버 모두 OAuth 성공 → 콜백 → 홈 복귀
3. **로그아웃:** 데이터 보존 (OPFS·중복지문) 확인
4. **Supabase Dashboard:** user_profiles·user_devices에 row 정상 생성

4가지 모두 ✅면 머지:
```
git checkout main
git merge --no-ff feat/v0.6.0-social-login
git tag -a v0.6.0 -m "v0.6.0 — social login"
git push origin main && git push origin v0.6.0
npx vercel --prod
```

## C-4. 머지 후 다음 단계
- v0.6.0 안정성 1주 모니터링 (Supabase Dashboard에서 가입 추이 관찰)
- v0.7.0 진입 — 모바일 이어 작업 (옵션 A·B·C 결정 후 별도 프롬프트 작성)
- 사업자등록 완료 시 → `VITE_FEATURE_PAYMENT=true` 켜서 결제 활성화 (코드 변경 0)

---

# 부록 D. 머지 후 상태

```
v0.6.0 머지 시점:

  ✅ Supabase Auth 활성화 + RLS 정책 (본인 데이터만)
  ✅ Google·카카오·네이버 OAuth 로그인
  ✅ 게스트 모드 호환 (로그인 강제 0)
  ✅ UserProfile Supabase 동기화 (heroPersonNames 머지)
  ✅ Device Fingerprint 어뷰징 감지 (조용히 플래그)
  ✅ 결제 회원 매핑 준비 (사업자등록 후 자동 활성화)

  → v0.7.0 모바일 이어 작업의 전제(계정 시스템) 완성.
    사업자등록 완료 시 결제 즉시 활성화 가능.
```

> 이 PR 범위 밖 결정은 v0.7.0(모바일 동기화) / 결제 활성화 / Provider 어뷰징 차단 정책으로 미룬다.
