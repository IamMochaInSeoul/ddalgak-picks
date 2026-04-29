
import { useT } from "../lib/i18n";
import { useStore } from "../lib/store";
import LangToggle from "./LangToggle";
import Display from "./Display";
import type { AppState } from "../lib/types";

// ─── 2-카드 정의 ─────────────────────────────────────────────────────────────
const CARDS = [
  {
    id: "personal" as const,
    emoji: "📷",
    tag: "돌잔치 · 여행 · 일상",
    title: "사진만 셀렉",
    desc: "수백~수천 장에서 베스트컷만 쏙쏙 골라드려요.\n파일 또는 폴더를 넣으면 AI가 알아서.",
    cta: "사진만 셀렉하기",
    accentRgb: "108,99,255",
  },
  {
    id: "studio" as const,
    emoji: "📁",
    tag: "스튜디오 · 웨딩 · 돌스냅",
    title: "스튜디오용 셀렉",
    desc: "스튜디오 촬영 사진을 의상·배경별로 정리하고,\n앨범 배치까지 한번에.",
    cta: "스튜디오용 셀렉하기",
    accentRgb: "124,111,247",
    badge: "★ 스튜디오 추천",
  },
] as const;

// ─── Landing ─────────────────────────────────────────────────────────────────
export default function Landing() {
  const t       = useT("landing");
  const setStep = useStore((s) => s.setStep) as (step: AppState["step"]) => void;
  const setFlow = useStore((s) => s.setFlow);

  const handleSelect = (id: "personal" | "studio") => {
    if (id === "personal") {
      setFlow("A");
      setStep("typeSelect");
    } else {
      setFlow(null);           // 스튜디오 분기에서 결정
      setStep("studioSelect");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column", alignItems: "center" }}>

      {/* 헤더 */}
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

      {/* 히어로 */}
      <div style={{ textAlign: "center", maxWidth: 580, padding: "120px 24px 0" }}>
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

        <Display
          as="h1"
          size="xl"
          style={{
            fontSize: "clamp(26px, 4.5vw, 48px)",
            marginBottom: 16,
            color: "var(--text-primary)",
          }}
        >
          {t("headline")}
        </Display>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.75 }}>
          {t("subheadline")}
        </p>
      </div>

      {/* 2-카드 */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: 18,
        width: "100%",
        maxWidth: 700,
        padding: "48px 20px 0",
      }}>
        {CARDS.map((card) => (
          <div
            key={card.id}
            onClick={() => handleSelect(card.id)}
            style={{
              position: "relative",
              display: "flex", flexDirection: "column",
              padding: "28px 24px 24px",
              background: "var(--bg2)",
              border: "1px solid var(--border)",
              borderRadius: 20, cursor: "pointer",
              transition: "transform 0.18s, box-shadow 0.18s, border-color 0.18s",
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLDivElement;
              el.style.transform = "translateY(-5px)";
              el.style.boxShadow = `0 20px 48px rgba(${card.accentRgb},0.22)`;
              el.style.borderColor = `rgba(${card.accentRgb},0.55)`;
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLDivElement;
              el.style.transform = "";
              el.style.boxShadow = "";
              el.style.borderColor = "var(--border)";
            }}
          >
            {"badge" in card && (
              <div style={{
                position: "absolute", top: -1, right: 18,
                background: `rgba(${card.accentRgb},0.9)`, color: "#fff",
                fontSize: 10, fontWeight: 700, padding: "4px 10px",
                borderRadius: "0 0 10px 10px", letterSpacing: "0.03em",
              }}>
                {(card as { badge: string }).badge}
              </div>
            )}

            <div style={{
              width: 54, height: 54, borderRadius: 14,
              background: `rgba(${card.accentRgb},0.12)`,
              border: `1px solid rgba(${card.accentRgb},0.25)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 28, marginBottom: 16,
            }}>
              {card.emoji}
            </div>

            <div style={{
              fontSize: 11, fontWeight: 600, marginBottom: 8,
              color: `rgba(${card.accentRgb},0.9)`, letterSpacing: "0.01em",
            }}>
              {card.tag}
            </div>

            <div style={{ fontSize: 21, fontWeight: 800, marginBottom: 10, letterSpacing: "-0.025em" }}>
              {card.title}
            </div>

            <p style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.7, flex: 1, marginBottom: 22, whiteSpace: "pre-line" }}>
              {card.desc}
            </p>

            <button style={{
              width: "100%", padding: "13px 0", borderRadius: 10, border: "none", cursor: "pointer",
              background: `linear-gradient(135deg, rgba(${card.accentRgb},0.85), rgba(${card.accentRgb},1))`,
              color: "#fff", fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em",
              pointerEvents: "none",
            }}>
              {card.cta}
            </button>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div style={{
        display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center",
        maxWidth: 700, padding: "48px 20px 0",
      }}>
        {[
          { num: "01", title: t("step1"), desc: t("step1desc") },
          { num: "02", title: t("step2"), desc: t("step2desc") },
          { num: "03", title: t("step3"), desc: t("step3desc") },
        ].map((s) => (
          <div key={s.num} style={{
            flex: "1 1 180px", textAlign: "center", padding: "20px 16px",
            background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 14,
          }}>
            <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--accent)", marginBottom: 8, letterSpacing: "var(--tracking-uppercase)" }}>{s.num}</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 5 }}>{s.title}</div>
            <div style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.6 }}>{s.desc}</div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 11, color: "var(--text-tertiary)", textAlign: "center", padding: "36px 20px 40px", letterSpacing: "0.02em" }}>
        모든 분석은 브라우저에서만 처리됩니다. 사진이 서버로 전송되지 않습니다.
      </p>
    </div>
  );
}
