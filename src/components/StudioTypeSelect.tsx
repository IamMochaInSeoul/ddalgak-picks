/**
 * StudioTypeSelect.tsx
 * 스튜디오용 셀렉 분기 화면
 * "셀렉용 폴더 받으셨나요?" → 있음(B: 폴더+앨범배치) / 없음(C: 폴더만 셀렉+ZIP)
 */
import { useStore } from "../lib/store";
import LangToggle from "./LangToggle";
import type { AppState } from "../lib/types";

const OPTIONS = [
  {
    flow: "B" as const,
    emoji: "📂",
    title: "셀렉용 폴더 있어요",
    desc: "스튜디오에서 의상·배경별로 정리된\n폴더를 받으셨나요?\n\n폴더 구조 그대로 셀렉 후,\n앨범 배치까지 이어서 진행합니다.",
    steps: ["폴더 업로드", "AI 셀렉", "앨범 배치"],
    cta: "폴더 올리고 앨범 배치까지",
    accentRgb: "108,99,255",
  },
  {
    flow: "C" as const,
    emoji: "🖼",
    title: "사진만 있어요",
    desc: "폴더 없이 촬영 사진만 있으신가요?\n\n의상·배경별로 직접 드롭하면\n셀렉 결과를 ZIP으로 받을 수 있어요.",
    steps: ["사진/폴더 업로드", "AI 셀렉", "ZIP 저장"],
    cta: "사진 올리고 셀렉만",
    accentRgb: "124,111,247",
  },
] as const;

export default function StudioTypeSelect() {
  const setStep = useStore((s) => s.setStep) as (step: AppState["step"]) => void;
  const setFlow = useStore((s) => s.setFlow);

  const handleSelect = (flow: "B" | "C") => {
    setFlow(flow);
    setStep("folderUpload");
  };

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg)",
      display: "flex", flexDirection: "column", alignItems: "center",
    }}>
      {/* 헤더 */}
      <header style={{
        position: "sticky", top: 0, zIndex: 100,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "14px 28px", width: "100%",
        borderBottom: "1px solid var(--border)",
        background: "rgba(13,13,18,0.9)",
        backdropFilter: "blur(12px)",
        boxSizing: "border-box",
      }}>
        <button className="btn-secondary" style={{ padding: "6px 14px", fontSize: 13 }}
          onClick={() => setStep("landing")}>
          ← 뒤로
        </button>
        <span style={{ fontSize: 15, fontWeight: 800, color: "var(--accent2)", letterSpacing: "-0.02em" }}>
          딸깍픽스
        </span>
        <LangToggle />
      </header>

      {/* 본문 */}
      <div style={{ width: "100%", maxWidth: 680, padding: "56px 20px 40px", textAlign: "center" }}>

        {/* 타이틀 */}
        <div style={{ marginBottom: 10, fontSize: 13, color: "var(--accent2)", fontWeight: 600, letterSpacing: "0.02em" }}>
          스튜디오용 셀렉
        </div>
        <h2 style={{ fontSize: "clamp(22px,4vw,32px)", fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 10 }}>
          스튜디오에서 셀렉용 폴더를<br />제공받으셨나요?
        </h2>
        <p style={{ fontSize: 14, color: "var(--text2)", marginBottom: 44, lineHeight: 1.7 }}>
          폴더 유무에 따라 셀렉 방식과 이후 단계가 달라집니다.
        </p>

        {/* 2-카드 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {OPTIONS.map((opt) => (
            <div
              key={opt.flow}
              onClick={() => handleSelect(opt.flow)}
              style={{
                display: "flex", flexDirection: "column",
                padding: "28px 22px 22px",
                background: "var(--bg2)",
                border: "1px solid var(--border)",
                borderRadius: 18, cursor: "pointer", textAlign: "left",
                transition: "transform 0.18s, box-shadow 0.18s, border-color 0.18s",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.transform = "translateY(-5px)";
                el.style.boxShadow = `0 20px 48px rgba(${opt.accentRgb},0.22)`;
                el.style.borderColor = `rgba(${opt.accentRgb},0.55)`;
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.transform = "";
                el.style.boxShadow = "";
                el.style.borderColor = "var(--border)";
              }}
            >
              {/* 아이콘 */}
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                background: `rgba(${opt.accentRgb},0.12)`,
                border: `1px solid rgba(${opt.accentRgb},0.25)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 26, marginBottom: 16,
              }}>
                {opt.emoji}
              </div>

              {/* 제목 */}
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10, letterSpacing: "-0.025em" }}>
                {opt.title}
              </div>

              {/* 설명 */}
              <p style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.7, whiteSpace: "pre-line", flex: 1, marginBottom: 20 }}>
                {opt.desc}
              </p>

              {/* 단계 흐름 */}
              <div style={{
                display: "flex", alignItems: "center", gap: 4,
                marginBottom: 20, flexWrap: "wrap",
              }}>
                {opt.steps.map((step, i) => (
                  <span key={step} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 20,
                      background: `rgba(${opt.accentRgb},0.12)`,
                      color: `rgba(${opt.accentRgb},1)`,
                    }}>
                      {step}
                    </span>
                    {i < opt.steps.length - 1 && (
                      <span style={{ fontSize: 10, color: "var(--text2)" }}>→</span>
                    )}
                  </span>
                ))}
              </div>

              {/* CTA */}
              <button style={{
                width: "100%", padding: "12px 0", borderRadius: 10, border: "none", cursor: "pointer",
                background: `linear-gradient(135deg, rgba(${opt.accentRgb},0.85), rgba(${opt.accentRgb},1))`,
                color: "#fff", fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em",
                pointerEvents: "none",
              }}>
                {opt.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
