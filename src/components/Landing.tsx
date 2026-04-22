
import { useT } from "../lib/i18n";
import { useStore } from "../lib/store";
import LangToggle from "./LangToggle";

export default function Landing() {
  const t = useT("landing");
  const setStep = useStore((s) => s.setStep);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "var(--bg)",
      }}
    >
      {/* Header */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 24px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg)",
          zIndex: 100,
        }}
      >
        <span
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "var(--accent2)",
            letterSpacing: "-0.02em",
          }}
        >
          딸깍픽스
        </span>
        <LangToggle />
      </div>

      {/* Hero */}
      <div style={{ textAlign: "center", maxWidth: 640 }}>
        <div
          style={{
            display: "inline-block",
            background: "var(--bg3)",
            border: "1px solid var(--border)",
            borderRadius: 20,
            padding: "6px 16px",
            fontSize: 13,
            color: "var(--accent2)",
            marginBottom: 24,
          }}
        >
          AI Photo Selector · Beta
        </div>

        <h1
          style={{
            fontSize: "clamp(32px, 6vw, 56px)",
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: "-0.03em",
            marginBottom: 20,
            background: "linear-gradient(135deg, #f0f0f8, #a89cff)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {t("headline")}
        </h1>

        <p
          style={{
            fontSize: 18,
            color: "var(--text2)",
            marginBottom: 40,
            lineHeight: 1.6,
          }}
        >
          {t("subheadline")}
        </p>

        <button
          className="btn-primary"
          style={{ fontSize: 18, padding: "14px 40px" }}
          onClick={() => setStep("typeSelect")}
        >
          {t("start")} →
        </button>
      </div>

      {/* How it works */}
      <div
        style={{
          display: "flex",
          gap: 24,
          marginTop: 80,
          flexWrap: "wrap",
          justifyContent: "center",
          maxWidth: 800,
        }}
      >
        {[
          {
            num: "01",
            title: t("step1"),
            desc: t("step1desc"),
            icon: "📁",
          },
          {
            num: "02",
            title: t("step2"),
            desc: t("step2desc"),
            icon: "🤖",
          },
          {
            num: "03",
            title: t("step3"),
            desc: t("step3desc"),
            icon: "✨",
          },
        ].map((s) => (
          <div
            key={s.num}
            className="card"
            style={{ flex: "1 1 200px", textAlign: "center" }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontSize: 11, color: "var(--accent2)", fontWeight: 700, marginBottom: 4 }}>
              {s.num}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{s.title}</div>
            <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.5 }}>{s.desc}</div>
          </div>
        ))}
      </div>

      {/* Note */}
      <p
        style={{
          marginTop: 40,
          fontSize: 12,
          color: "var(--text2)",
          textAlign: "center",
          opacity: 0.6,
        }}
      >
        모든 분석은 브라우저 내에서만 처리됩니다. 사진이 서버로 전송되지 않습니다. · All processing is local. Photos never leave your device.
      </p>
    </div>
  );
}
