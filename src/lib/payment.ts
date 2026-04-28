import * as PortOne from "@portone/browser-sdk/v2";

export const PRODUCTS = {
  single: { code: "single" as const, label: "싱글 패스", price: 4900, desc: "이번 세션 1회 무제한 다운로드" },
  package: { code: "package" as const, label: "패키지 패스", price: 15000, desc: "90일 동안 무제한 사용" },
} as const;

export type ProductCode = keyof typeof PRODUCTS;

const STORE_ID = import.meta.env.VITE_PORTONE_STORE_ID as string;
const CHANNEL_KEY = import.meta.env.VITE_PORTONE_CHANNEL_KEY as string;

export interface PaymentResult {
  paymentId: string;
  txId: string;
}

export async function requestPayment(
  product: ProductCode,
  email: string,
): Promise<PaymentResult> {
  const p = PRODUCTS[product];
  const paymentId = `ddp-${product}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const response = await PortOne.requestPayment({
    storeId: STORE_ID,
    channelKey: CHANNEL_KEY,
    paymentId,
    orderName: `딸깍픽스 ${p.label}`,
    totalAmount: p.price,
    currency: "KRW",
    payMethod: "EASY_PAY",
    customer: { email },
  });

  if (response?.code) {
    throw new Error(response.message ?? "결제가 취소되었습니다.");
  }

  return { paymentId, txId: response?.txId ?? "" };
}

export async function verifyPayment(paymentId: string, txId: string): Promise<boolean> {
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  const res = await fetch(`${base}/functions/v1/verify-payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paymentId, txId }),
  });
  if (!res.ok) throw new Error("결제 검증에 실패했습니다.");
  const data = await res.json();
  return data.verified === true;
}
