
import { useT } from "../lib/i18n";
import { useStore } from "../lib/store";
import LangToggle from "./LangToggle";
import type { AppState } from "../lib/types";

// ─── Flow 카드 데이터 ────────────────────────────────────────────────────────
const FLOWS = [
  {
    id: "A" as const,
    emoji: "📷",
    tag: "돌잔치 · 여행 · 일상",
    title: "사진만 셀렉",
    desc: "수백~수천 장에서 베스트컷만 쏙쏙 골라드려요.\n파일 또는 폴더를 넣으면 AI가 알아서.",
    cta: "사진만 셀렉하기",
    accent: "var(--accent)",
    accentRgb: "108,99,255",
  },
  {
    id: "B" as const,
    emoji: "📁",
    tag: "스튜디오 · 웨딩 · 돌스냅",
    title: "폴더 묶음 셀렉",
    desc: "의상·배경별 폴더를 한꺼번에 드롭하면\n폴더 구조 그대로 ZIP으로 받아요.",
    cta: "폴더 묶음 셀렉하기",
    accent: "#7c6ff7",
    accentRgb: "124,111,247",
    badge: "★ 스튜디오 추천",
  },
  {
    id: "C" as const,
    emoji: "📖",
    tag: "포토북 · 스튜디오 앨범",
    title: "앨범 배치",
    desc: "선별한 사진을 앨범 템플릿 슬롯에\n자동으로 배치해 ZIP으로 드려요.",
    cta: "앨범 배치하기",
    accent: "#9b7ef7",
    accentRgb: "155,126,247",
  },
] as const;

// ─── Landing 컴포넌트 ────────────────────────────────────────────────────────
export default function Landing() {
  const t       = useT("landing");
  const setStep = useStore((s) => s.setStep) as (step: AppState["step"]) => void;
  const setFlow = useStore((s) => s.setFlow);

  const handleSelect = (id: "A" | "B" | "C") => {
    setFlow(id);
    if      (id === "A") setStep("typeSelect");
    else if (id === "B") setStep("folderUpload");
    else if (id === "C") setStep("album");
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column", alignItems: "center" }}>

      {/* ── 헤더 ── */}
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "14px 28px",
        borderBottom: "1px solid var(--border)",
        background: "rgba(13,13,18,0.85)",
        backdropFilter: "blur(12px)",
      }}>
        <span style={{ fontSize: 17, fontWeight: 800, color: "var(--accent2)", letterSpacing: "-0.03em" }}>
          딸깍픽스
        </span>
        <LangToggle />
      </header>

      {/* ── 히어로 ── */}
      <div style={{ textAlign: "center", maxWidth: 600, padding: "120px 24px 0" }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "rgba(108,99,255,0.12)",
          border: "1px solid rgba(108,99,255,0.3)",
          borderRadius: 20, padding: "5px 14px",
          fontSize: 12, color: "var(--accent2)", fontWeight: 600,
          marginBottom: 22, letterSpacing: "0.02em",
        }}>
          ✦ AI Photo Selector · Beta
        </div>

        <h1 style={{
          fontSize: "clamp(30px, 5.5vw, 52px)",
          fontWeight: 900,
          lineHeight: 1.12,
          letterSpacing: "-0.04em",
          marginBottom: 18,
          background: "linear-gradient(145deg, #eeeeff 30%, #a89cff 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}>
          {t("headline")}
        </h1>

        <p style={{ fontSize: 16, color: "var(--text2)", lineHeight: 1.75, marginBottom: 0 }}>
          {t("subheadline")}
        </p>
      </div>

      {/* ── 3-카드 그리드 ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 16,
        width: "100%",
        maxWidth: 980,
        padding: "48px 20px 0",
      }}>
        {FLOWS.map((flow) => (
          <FlowCard key={flow.id} flow={flow} onSelect={handleSelect} />
        ))}
      </div>

      {/* ── How it works ── */}
      <div style={{
        display: "flex", gap: 16, flexWrap: "wrap",
        justifyContent: "center", maxWidth: 820,
        padding: "52px 20px 0",
      }}>
        {[
          { num: "01", icon: "📁", title: t("step1"), desc: t("step1desc") },
          { num: "02", icon: "🤖", title: t("step2"), desc: t("step2desc") },
          { num: "03", icon: "✨", title: t("step3"), desc: t("step3desc") },
        ].map((s) => (
          <div key={s.num} style={{
            flex: "1 1 200px",
            textAlign: "center",
            padding: "22px 18px",
            background: "var(--bg2)",
            border: "1px solid var(--border)",
            borderRadius: 14,
          }}>
            <div style={{ fontSize: 26, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontSize: 10, color: "var(--accent2)", fontWeight: 700, marginBottom: 4, letterSpacing: "0.06em" }}>{s.num}</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 5 }}>{s.title}</div>
            <div style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.6 }}>{s.desc}</div>
          </div>
        ))}
      </div>

      {/* ── 개인정보 노트 ── */}
      <p style={{ fontSize: 11, color: "var(--text2)", textAlign: "center", opacity: 0.45, padding: "36px 20px 40px" }}>
        모든 분석은 브라우저에서만 처리됩니다. 사진이 서버로 전송되지 않아요.
        &nbsp;·&nbsp; All processing is local. Photos never leave your device.
      </p>
    </div>
  );
}

// ─── FlowCard 서브컴포넌트 ───────────────────────────────────────────────────
type FlowDef = typeof FLOWS[number];

function FlowCard({ flow, onSelect }: { flow: FlowDef; onSelect: (id: FlowDef["id"]) => void }) {
  return (
    <div
      onClick={() => onSelect(flow.id)}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        padding: "26px 22px 22px",
        background: "var(--bg2)",
        border: "1px solid var(--border)",
        borderRadius: 18,
        cursor: "pointer",
        transition: "transform 0.18s, box-shadow 0.18s, border-color 0.18s",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform = "translateY(-5px)";
        el.style.boxShadow = `0 20px 48px rgba(${flow.accentRgb},0.22)`;
        el.style.borderColor = `rgba(${flow.accentRgb},0.55)`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform = "translateY(0)";
        el.style.boxShadow = "";
        el.style.borderColor = "var(--border)";
      }}
    >
      {/* 추천 배지 */}
      {"badge" in flow && flow.badge && (
        <div style={{
          position: "absolute", top: -1, right: 16,
          background: `rgba(${flow.accentRgb},0.9)`,
          color: "#fff",
          fontSize: 10, fontWeight: 700,
          padding: "4px 10px",
          borderRadius: "0 0 10px 10px",
          letterSpacing: "0.03em",
        }}>
          {(flow as { badge: string }).badge}
        </div>
      )}

      {/* 아이콘 */}
      <div style={{
        width: 52, height: 52, borderRadius: 14,
        background: `rgba(${flow.accentRgb},0.12)`,
        border: `1px solid rgba(${flow.accentRgb},0.25)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 26, marginBottom: 16,
      }}>
        {flow.emoji}
      </div>

      {/* 태그 */}
      <div style={{
        fontSize: 11, fontWeight: 600,
        color: `rgba(${flow.accentRgb},0.9)`,
        marginBottom: 8, letterSpacing: "0.01em",
      }}>
        {flow.tag}
      </div>

      {/* 제목 */}
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 10, letterSpacing: "-0.025em" }}>
        {flow.title}
      </div>

      {/* 설명 */}
      <p style={{
        fontSize: 13, color: "var(--text2)", lineHeight: 1.7,
        flex: 1, marginBottom: 22,
        whiteSpace: "pre-line",
      }}>
        {flow.desc}
      </p>

      {/* CTA 버튼 */}
      <button
        style={{
          width: "100%", padding: "12px 0",
          borderRadius: 10, border: "none", cursor: "pointer",
          background: `linear-gradient(135deg, rgba(${flow.accentRgb},0.85), rgba(${flow.accentRgb},1))`,
          color: "#fff",
          fontSize: 14, fontWeight: 700,
          letterSpacing: "-0.01em",
          pointerEvents: "none",
        }}
      >
        {flow.cta}
      </button>
    </div>
  );
}
