/**
 * freeBetaConfig.ts — 결제 무료 베타 정책 분기
 *
 * - VITE_FEATURE_PAYMENT === "true" 일 때만 결제 활성화
 * - 그 외(미설정·"false")는 무료 베타 모드: PaymentGate 우회 + "무료 베타" 카피 노출
 * - 사업자등록 + PortOne 등록 후 환경변수만 켜면 자동 전환
 */

const PAYMENT_ON = import.meta.env.VITE_FEATURE_PAYMENT === "true";

/** 결제 모듈이 활성화돼 있는가 (사업자등록 후 true) */
export function isPaymentEnabled(): boolean {
  return PAYMENT_ON;
}

/** 무료 베타 모드인가 (현재 운영 상태) */
export function isFreeBeta(): boolean {
  return !PAYMENT_ON;
}

/** 무료 베타 카피 — 결과 화면·랜딩 헤더에서 사용 */
export const FREE_BETA_COPY = {
  // 작은 라벨 (랜딩 헤더 등)
  badge: "무료 베타",
  // 결과 화면 카피
  resultLine: "현재 무료 베타 — 모든 기능을 무료로 사용하실 수 있습니다.",
  // ZIP 다운로드 버튼 (정상 가격 자리)
  downloadButton: "원본 ZIP — 무료 베타",
  // 결과 화면 추가 안내 (1줄)
  helperLine: "정식 출시 시 유료 전환 예정입니다.",
} as const;

/** 결제 활성화 시 노출될 가격 (참고용 — 무료 베타에서는 보이지 않음) */
export const FUTURE_PRICING = {
  single: 2900,
  monthly: 9900,
  retouch10: 4900,
} as const;
