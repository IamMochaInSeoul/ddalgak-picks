
import { useState, useEffect } from "react";
import { useT } from "../lib/i18n";
import { useStore } from "../lib/store";
import LangToggle from "./LangToggle";
import Display from "./Display";
import type { AppState, EventTag } from "../lib/types";
import { isFreeBeta, FREE_BETA_COPY } from "../lib/freeBetaConfig";
import {
  listFolderSessions,
  loadFolderSession,
  type OpfsSessionMeta,
} from "../lib/opfsStore";
import { getRecommendedCount } from "../lib/recommendedCount";

// ─── 2-카드 정의 ─────────────────────────────────────────────────────────────
const CARDS = [
  {
    id: "personal" as const,
    tag: "돌잔치 · 여행 · 일상",
    title: "사진만 셀렉",
    desc: "수백~수천 장에서 베스트컷만 셀렉합니다.\n파일 또는 폴더를 넣으세요.",
    cta: "사진만 셀렉",
  },
  {
    id: "studio" as const,
    tag: "스튜디오 · 웨딩 · 돌스냅",
    title: "스튜디오용 셀렉",
    desc: "스튜디오 촬영본을 의상·배경별로 정리하고,\n앨범 배치까지 이어집니다.",
    cta: "스튜디오용 셀렉",
    badge: "스튜디오 추천",
  },
] as const;

// ─── Landing ─────────────────────────────────────────────────────────────────
export default function Landing() {
  const t                = useT("landing");
  const setStep          = useStore((s) => s.setStep) as (step: AppState["step"]) => void;
  const setFlow          = useStore((s) => s.setFlow);
  const addFolderSession = useStore((s) => s.addFolderSession);

  const [resumeCandidates, setResumeCandidates] = useState<OpfsSessionMeta[]>([]);

  useEffect(() => {
    listFolderSessions().then((metas) => {
      const inMemoryIds = new Set(useStore.getState().folderSessions.map((s) => s.id));
      setResumeCandidates(metas.filter((m) => !inMemoryIds.has(m.sessionId)));
    }).catch(() => {});
  }, []);

  async function handleResume(sessionId: string) {
    const restored = await loadFolderSession(sessionId);
    if (!restored) return;
    const tag = restored.meta.eventTag as EventTag;
    const session = {
      id: sessionId,
      folderName: restored.meta.folderName,
      eventTag: tag,
      files: restored.files,
      status: "pending" as const,
      progress: 0,
      stage: "",
      photos: new Map(),
      groups: [],
      targetCount: getRecommendedCount(tag),
      source: restored.meta.source,
    };
    addFolderSession(session);
    setResumeCandidates((prev) => prev.filter((m) => m.sessionId !== sessionId));
    setFlow("B");
    setStep("folderUpload");
  }

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
        borderBottom: "1px solid var(--border-subtle)",
        background: "rgba(13,15,18,0.92)",
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
          display: "inline-flex", alignItems: "center",
          background: "var(--accent-soft)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-sm)",
          padding: "4px 10px",
          fontSize: 11,
          color: "var(--text-secondary)",
          fontFamily: "var(--font-mono)",
          fontWeight: 500,
          marginBottom: 24,
          letterSpacing: "var(--tracking-uppercase)",
          textTransform: "uppercase",
        }}>
          {isFreeBeta() ? FREE_BETA_COPY.badge : "BETA"}
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

      {/* OPFS 복원 인라인 카드 */}
      {resumeCandidates.length > 0 && (
        <div style={{
          width: "100%", maxWidth: 700, padding: "16px 24px",
          margin: "32px 20px 0",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
        }}>
          <div style={{
            fontSize: 11, color: "var(--text-secondary)",
            fontFamily: "var(--font-mono)", letterSpacing: "var(--tracking-uppercase)",
            textTransform: "uppercase", marginBottom: 8,
          }}>
            미완료 세션 · {resumeCandidates.length}건
          </div>
          {resumeCandidates.slice(0, 3).map((m) => (
            <div key={m.sessionId} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 0", borderTop: "1px solid var(--border-subtle)",
            }}>
              <div>
                <div style={{ color: "var(--text-primary)", fontSize: 14 }}>
                  {m.folderName}
                </div>
                <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>
                  {m.fileNames.length}장 · {(m.totalBytes / 1024 / 1024).toFixed(1)}MB
                </div>
              </div>
              <button
                className="btn-secondary"
                style={{ padding: "6px 14px", fontSize: 13 }}
                onClick={() => handleResume(m.sessionId)}
              >
                이어서 하기
              </button>
            </div>
          ))}
        </div>
      )}

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
              padding: "var(--space-8) var(--space-6) var(--space-6)",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
              transition: "border-color var(--dur-base) var(--ease-standard), opacity var(--dur-base) var(--ease-standard)",
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLDivElement;
              el.style.borderColor = "var(--accent)";
              el.style.opacity = "0.95";
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLDivElement;
              el.style.borderColor = "var(--border-subtle)";
              el.style.opacity = "1";
            }}
          >
            {"badge" in card && (
              <div style={{
                position: "absolute", top: -1, right: 18,
                background: "var(--accent)", color: "var(--bg-base)",
                fontSize: 10, fontWeight: 700, padding: "4px 10px",
                borderRadius: "0 0 var(--radius-sm) var(--radius-sm)", letterSpacing: "0.03em",
              }}>
                {(card as { badge: string }).badge}
              </div>
            )}

            <div style={{
              fontSize: 11, fontWeight: 600, marginBottom: 8,
              color: "var(--text-secondary)", letterSpacing: "0.01em",
              fontFamily: "var(--font-mono)",
              textTransform: "uppercase",
            }}>
              {card.tag}
            </div>

            <div style={{ fontSize: 21, fontWeight: 800, marginBottom: 10, letterSpacing: "-0.025em" }}>
              {card.title}
            </div>

            <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, flex: 1, marginBottom: 22, whiteSpace: "pre-line" }}>
              {card.desc}
            </p>

            <button style={{
              width: "100%", padding: "13px 0",
              borderRadius: "var(--radius-sm)", border: "none", cursor: "pointer",
              background: "var(--accent)",
              color: "var(--bg-base)", fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em",
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
            background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)",
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
