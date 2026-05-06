import { useState } from "react";
import { useStore } from "../lib/store";
import { requestPayment, verifyPayment, PRODUCTS, type ProductCode } from "../lib/payment";
import { showToast } from "./Toast";

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export default function PaymentGate({ onClose, onSuccess }: Props) {
  const setPayment = useStore((s) => s.setPayment);
  const setWatermarkEnabled = useStore((s) => s.setWatermarkEnabled);

  const [selected, setSelected] = useState<ProductCode>("single");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const featureOn = import.meta.env.VITE_FEATURE_PAYMENT === "true";

  async function handlePay() {
    if (!email.includes("@")) { setError("올바른 이메일을 입력해주세요."); return; }
    setError(null);
    setLoading(true);
    try {
      const { paymentId, txId } = await requestPayment(selected, email);
      const verified = await verifyPayment(paymentId, txId);
      if (!verified) throw new Error("결제 검증 실패 — 고객센터에 문의해주세요.");
      setPayment({ isPaid: true, paymentSessionId: paymentId, receiptEmail: email });
      setWatermarkEnabled(false);
      showToast("결제 완료. ZIP을 생성합니다.", "✓", 4000);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "결제 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  // 개발 모드: 결제 플래그 꺼져있으면 바로 통과
  function handleDevBypass() {
    setPayment({ isPaid: true, paymentSessionId: "dev-bypass", receiptEmail: "dev@local" });
    setWatermarkEnabled(false);
    showToast("결제 완료. ZIP을 생성합니다.", "✓", 4000);
    onSuccess();
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10000,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "var(--bg2)", borderRadius: "var(--radius-sm)", 
        border: "1px solid var(--border)",
        width: "100%", maxWidth: 440,
        padding: "28px 24px",
      }}>
        {/* 헤더 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, marginBottom: 4 }}>
              무제한 다운로드 🚀
            </h2>
            <p style={{ fontSize: 13, color: "var(--text2)", margin: 0 }}>
              워터마크 없이 원본 품질로 저장하세요
            </p>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text2)", fontSize: 20, padding: 4, lineHeight: 1,
          }}>✕</button>
        </div>

        {/* 상품 선택 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          {(Object.keys(PRODUCTS) as ProductCode[]).map((key) => {
            const p = PRODUCTS[key];
            const isSelected = selected === key;
            return (
              <button key={key} onClick={() => setSelected(key)} style={{
                padding: "14px 16px", borderRadius: "var(--radius-lg)",  cursor: "pointer",
                border: isSelected ? "2px solid var(--accent)" : "1.5px solid var(--border)",
                background: isSelected ? "rgba(139,92,246,0.08)" : "var(--bg)",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                transition: "all 0.15s",
                textAlign: "left",
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>
                    {isSelected && <span style={{ color: "var(--accent)", marginRight: 6 }}>✓</span>}
                    {p.label}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text2)" }}>{p.desc}</div>
                </div>
                <div style={{
                  fontSize: 17, fontWeight: 800,
                  color: isSelected ? "var(--accent)" : "var(--text)",
                  whiteSpace: "nowrap", marginLeft: 12,
                }}>
                  {p.price.toLocaleString()}원
                </div>
              </button>
            );
          })}
        </div>

        {/* 이메일 */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: "var(--text2)", display: "block", marginBottom: 6 }}>
            영수증 받을 이메일
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="hello@example.com"
            style={{
              width: "100%", padding: "10px 12px", borderRadius: "var(--radius-md)", 
              border: "1.5px solid var(--border)", background: "var(--bg)",
              color: "var(--text)", fontSize: 14, outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* 에러 */}
        {error && (
          <p style={{ fontSize: 13, color: "#ef4444", marginBottom: 12 }}>{error}</p>
        )}

        {/* CTA */}
        <button
          onClick={featureOn ? handlePay : handleDevBypass}
          disabled={loading}
          style={{
            width: "100%", padding: "13px 0", borderRadius: "var(--radius-lg)",  border: "none",
            cursor: loading ? "wait" : "pointer",
            background: "linear-gradient(135deg, var(--accent), var(--accent2))",
            color: "#fff", fontWeight: 800, fontSize: 16,
            opacity: loading ? 0.7 : 1,
            transition: "opacity 0.15s",
          }}
        >
          {loading ? "결제 중..." : featureOn
            ? `${PRODUCTS[selected].price.toLocaleString()}원 결제하기`
            : "개발 모드 — 바로 통과"}
        </button>

        <p style={{ fontSize: 11, color: "var(--text2)", textAlign: "center", marginTop: 12 }}>
          카카오페이 · 토스페이 · 카드 결제 지원 · 결제 즉시 적용
        </p>
      </div>
    </div>
  );
}
