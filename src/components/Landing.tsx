
import { useT } from "../lib/i18n";
import { useStore } from "../lib/store";
import LangToggle from "./LangToggle";
import type { AppState } from "../lib/types";

// ─── Flow 카드 정의 ─────────────────────────────────────────────────────────
const FLOWS = [
  {
    id: "A" as const,
    icon: "📷",
    badge: "돌잔치 · 여행 · 일상",
    title: "사진만 셀렉",
    desc: "수백~수천 장에서 베스트컷만 골라드려요. 파일이나 폴더 통째로 넣으면 AI가 알아서 선별합니다.",
    cta: "사진만 셀렉하기",
    comingSoon: false,
  },
  {
    id: "B" as const,
    icon: "📁",
    badge: "스튜디오 · 웨딩 · 돌스냅",
    title: "폴더 묶음 셀렉",
    desc: "의상·배경별 폴더를 한꺼번에 드롭하면, 폴더 구조 그대로 셀렉 결과를 ZIP으로 받아요.",
    cta: "폴더 묶음 셀렉하기",
    comingSoon: false,
  },
  {
    id: "C" as const,
    icon: "📖",
    badge: "포토북 · 스튜디오 앨범",
    title: "앨범 배치",
    desc: "선별한 사진을 앨범 템플릿에 자동으로 배치해 슬롯별 ZIP을 드려요.",
    cta: "앨범 배치하기",
    comingSoon: true,
  },
] as const;

// ─── Landing 컴포넌트 ────────────────────────────────────────────────────────
export default function Landing() {
  const t = useT("landing");
  const setStep = useStore((s) => s.setStep) as (step: AppState["step"]) => void;
  const setFlow = useStore((s) => s.setFlow);

  // flow를 설정하고 step을 이동하는 핸들러
  const handleFlowSelect = (flowId: "A" | "B" | "C") => {
    setFlow(flowId);
    if (flowId === "A") {
      setStep("typeSelect");
    } else if (flowId === "B") {
      setStep("folderUpload");
    }
    // C: Coming Soon — no action
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "80px 24px 40px",
      background: "var(--bg)",
    }}>
      {/* ── 헤더 ── */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "16px 24px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg)", zIndex: 100,
      }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: "var(--accent2)", letterSpacing: "-0.02em" }}>
          딸깍픽스
        </span>
        <LangToggle />
      </div>

      {/* ── 히어로 ── */}
      <div style={{ textAlign: "center", maxWidth: 640, marginBottom: 56 }}>
        <div style={{
          display: "inline-block",
          background: "var(--bg3)",
          border: "1px solid var(--border)",
          borderRadius: 20,
          padding: "6px 16px",
          fontSize: 13,
          color: "var(--accent2)",
          marginBottom: 24,
        }}>
          AI Photo Selector · Beta
        </div>

        <h1 style={{
          fontSize: "clamp(28px, 5vw, 48px)",
          fontWeight: 800,
          lineHeight: 1.15,
          letterSpacing: "-0.03em",
          marginBottom: 16,
          background: "linear-gradient(135deg, #f0f0f8, #a89cff)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}>
          {t("headline")}
        </h1>

        <p style={{ fontSize: 16, color: "var(--text2)", lineHeight: 1.7 }}>
          {t("subheadline")}
        </p>
      </div>

      {/* ── 3-카드 Flow 선택 ── */}
      <div style={{
        display: "flex",
        gap: 20,
        flexWrap: "wrap",
        justifyContent: "center",
        width: "100%",
        maxWidth: 960,
        marginBottom: 48,
      }}>
        {FLOWS.map((flow) => (
          <div
            key={flow.id}
            className="card"
            style={{
              flex: "1 1 260px",
              maxWidth: 300,
              display: "flex",
              flexDirection: "column",
              padding: "28px 24px 24px",
              position: "relative",
              opacity: flow.comingSoon ? 0.6 : 1,
              transition: "transform 0.15s, box-shadow 0.15s",
              cursor: flow.comingSoon ? "default" : "pointer",
            }}
            onMouseEnter={(e) => {
              if (!flow.comingSoon) {
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(-4px)";
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 16px 40px rgba(108,99,255,0.2)";
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
              (e.currentTarget as HTMLDivElement).style.boxShadow = "";
            }}
            onClick={() => !flow.comingSoon && handleFlowSelect(flow.id)}
          >
            {/* Coming Soon 배지 */}
            {flow.comingSoon && (
              <div style={{
                position: "absolute", top: 14, right: 14,
                background: "var(--bg3)",
                border: "1px solid var(--border)",
                borderRadius: 20,
                padding: "3px 10px",
                fontSize: 11,
                color: "var(--text2)",
                fontWeight: 600,
              }}>
                Coming Soon
              </div>
            )}

            {/* 아이콘 */}
            <div style={{ fontSize: 36, marginBottom: 14 }}>{flow.icon}</div>

            {/* 이런 분에게 배지 */}
            <div style={{
              display: "inline-block",
              background: "rgba(108,99,255,0.12)",
              borderRadius: 20,
              padding: "4px 10px",
              fontSize: 11,
              color: "var(--accent2)",
              fontWeight: 600,
              marginBottom: 10,
              alignSelf: "flex-start",
            }}>
              이런 분에게 · {flow.badge}
            </div>

            {/* 제목 */}
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, letterSpacing: "-0.02em" }}>
              {flow.title}
            </div>

            {/* 설명 */}
            <p style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.65, flex: 1, marginBottom: 20 }}>
              {flow.desc}
            </p>

            {/* CTA */}
            {!flow.comingSoon ? (
              <button
                className="btn-primary"
                style={{ width: "100%", fontSize: 14, padding: "11px 0", pointerEvents: "none" }}
              >
                {flow.cta}
              </button>
            ) : (
              <div style={{
                width: "100%", fontSize: 14, padding: "11px 0",
                textAlign: "center", borderRadius: 10,
                background: "var(--bg3)", color: "var(--text2)",
                border: "1.5px solid var(--border)", fontWeight: 600,
              }}>
                준비 중
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── How it works ── */}
      <div style={{
        display: "flex", gap: 20, flexWrap: "wrap",
        justifyContent: "center", maxWidth: 800, marginBottom: 40,
      }}>
        {([
          { num: "01", title: t("step1"), desc: t("step1desc"), icon: "📁" },
          { num: "02", title: t("step2"), desc: t("step2desc"), icon: "🤖" },
          { num: "03", title: t("step3"), desc: t("step3desc"), icon: "✨" },
        ] as const).map((s) => (
          <div key={s.num} className="card" style={{ flex: "1 1 180px", textAlign: "center", padding: "20px 16px" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontSize: 11, color: "var(--accent2)", fontWeight: 700, marginBottom: 4 }}>{s.num}</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{s.title}</div>
            <div style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.5 }}>{s.desc}</div>
          </div>
        ))}
      </div>

      {/* ── 개인정보 노트 ── */}
      <p style={{ fontSize: 12, color: "var(--text2)", textAlign: "center", opacity: 0.6 }}>
        모든 분석은 브라우저 내에서만 처리됩니다. 사진이 서버로 전송되지 않습니다.
        &nbsp;·&nbsp; All processing is local. Photos never leave your device.
      </p>
    </div>
  );
}
