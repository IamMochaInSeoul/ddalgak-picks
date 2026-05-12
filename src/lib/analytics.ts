/**
 * analytics.ts — GA4 이벤트 송출 (PII 차단 포함)
 *
 * - VITE_GA_MEASUREMENT_ID 미설정 또는 "G-" 미시작 시 전량 noop
 * - 이벤트 파라미터에서 이메일·전화번호·주민등록번호 패턴 자동 제거
 * - GA4 스크립트는 첫 track() 호출 시 동적 로드 (레이지)
 * - index.html에 window.dataLayer / window.gtag stub 초기화 필요
 */

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID ?? "";
const ENABLED = MEASUREMENT_ID.startsWith("G-");

// ─── PII 스크러버 ────────────────────────────────────────────────────────────
const PII_RE: RegExp[] = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,  // e-mail
  /\b010[-\s]?\d{3,4}[-\s]?\d{4}\b/g,               // KR 휴대폰
  /\b\d{2,3}[-\s]?\d{3,4}[-\s]?\d{4}\b/g,           // 일반 전화
  /\b\d{6}-\d{7}\b/g,                                // 주민등록번호
];

function scrubPII(v: string): string {
  return PII_RE.reduce((s, re) => s.replace(re, "[PII]"), v);
}

function sanitize(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(params)) {
    out[k] = typeof val === "string" ? scrubPII(val) : val;
  }
  return out;
}

// ─── GA4 초기화 (최초 1회) ───────────────────────────────────────────────────
let ready = false;

function initGA4() {
  if (!ENABLED || ready) return;
  ready = true;

  // dataLayer stub은 index.html에서 미리 선언됨
  const s = document.createElement("script");
  s.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  s.async = true;
  document.head.appendChild(s);

  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID, {
    send_page_view: true,
    cookie_flags: "SameSite=None;Secure",
  });
}

// ─── 이벤트 타입 (12종) ──────────────────────────────────────────────────────
export type TrackEvent =
  | { name: "app_open";             params: { free_beta: boolean } }
  | { name: "flow_select";          params: { flow: "personal" | "studio" } }
  | { name: "free_beta_view" }
  | { name: "zip_download_attempt"; params: { photo_count: number } }
  | { name: "zip_download_complete";params: { photo_count: number; size_mb: number } }
  | { name: "zip_redownload";       params: { size_mb: number } }
  | { name: "photo_modal_open" }
  | { name: "photo_toggle";         params: { action: "select" | "deselect" } }
  | { name: "reextract_start";      params: { attempt: number } }
  | { name: "onboarding_shown" }
  | { name: "onboarding_dismiss";   params: { permanent: boolean } }
  | { name: "session_restored" };

// ─── 공개 API ────────────────────────────────────────────────────────────────
export function track(event: TrackEvent): void {
  if (!ENABLED) return;
  if (!ready) initGA4();
  const rawParams = (event as { params?: Record<string, unknown> }).params ?? {};
  window.gtag("event", event.name, sanitize(rawParams));
}
