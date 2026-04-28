import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const PORTONE_API_SECRET = Deno.env.get("PORTONE_API_SECRET") ?? "";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  try {
    const { paymentId } = await req.json() as { paymentId: string; txId?: string };
    if (!paymentId) return json({ verified: false, error: "paymentId required" }, 400);

    // PortOne V2 서버 API로 결제 상태 조회
    const portoneRes = await fetch(
      `https://api.portone.io/payments/${encodeURIComponent(paymentId)}`,
      { headers: { Authorization: `PortOne ${PORTONE_API_SECRET}` } },
    );

    if (!portoneRes.ok) {
      const body = await portoneRes.text();
      console.error("[verify-payment] PortOne API error:", portoneRes.status, body);
      return json({ verified: false, error: "PortOne API error" }, 502);
    }

    const payment = await portoneRes.json();

    // 결제 완료 상태 확인 (V2 status: PAID)
    const verified = payment.status === "PAID";

    console.log(`[verify-payment] paymentId=${paymentId} status=${payment.status} verified=${verified}`);
    return json({ verified, status: payment.status });
  } catch (err) {
    console.error("[verify-payment] Error:", err);
    return json({ verified: false, error: String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
