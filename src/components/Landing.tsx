
import { useState, useEffect } from "react";
import { useT } from "../lib/i18n";
import { useStore } from "../lib/store";
import LangToggle from "./LangToggle";
import Display from "./Display";
import type { AppState, EventTag } from "../lib/types";
import { isFreeBeta, FREE_BETA_COPY } from "../lib/freeBetaConfig";
import ReturningBanner from "./ReturningBanner";
import {
  listFolderSessions,
  loadFolderSession,
  type OpfsSessionMeta,
} from "../lib/opfsStore";
import { getRecommendedCount } from "../lib/recommendedCount";
import { track } from "../lib/analytics";

// ─── Landing (v2.2 — 라이트 베이스 + Graphite + 어시스턴트 톤) ──────────────
// 카드 카피·라벨은 messages/ko.json 으로 일원화 (절대 규칙 — 하드코딩 금지)
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
    if (isFreeBeta()) track({ name: "free_beta_view" });
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
    track({ name: "flow_select", params: { flow: id } });
    if (id === "personal") {
      setFlow("A");
      setStep("typeSelect");
    } else {
      setFlow(null);           // 스튜디오 분기에서 결정
      setStep("studioSelect");
    }
  };

  // 2-카드 정의 — 카피는 i18n에서 가져옴 (v2.2)
  const CARDS = [
    {
      id: "personal" as const,
      tag: t("cardPersonalTag"),
      title: t("cardPersonalTitle"),
      desc: t("cardPersonalDesc"),
      cta: t("cardPersonalCta"),
    },
    {
      id: "studio" as const,
      tag: t("cardStudioTag"),
      title: t("cardStudioTitle"),
      desc: t("cardStudioDesc"),
      cta: t("cardStudioCta"),
      badge: t("cardStudioBadge"),
    },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg-base)",
      color: "var(--text-primary)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
    }}>

      {/* 헤더 — 라이트 반투명 (v2.2) */}
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "14px 28px",
        borderBottom: "1px solid var(--border-subtle)",
        background: "rgba(250, 250, 248, 0.92)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}>
        <span style={{
          fontSize: 17,
          fontWeight: 800,
          color: "var(--text-primary)",
          letterSpacing: "-0.03em",
        }}>
          딸깍픽스
        </span>
        <LangToggle />
      </header>

      {/* 히어로 — v2.2 헤드라인 톤 */}
      <div style={{ textAlign: "center", maxWidth: 640, padding: "120px 24px 0" }}>
        <div style={{
          display: "inline-flex", alignItems: "center",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-sm)",
          padding: "4px 10px",
          fontSize: "var(--text-2xs)",
          color: "var(--text-secondary)",
          fontFamily: "var(--font-mono)",
          fontWeight: 500,
          marginBottom: 28,
          letterSpacing: "var(--tracking-uppercase)",
          textTransform: "uppercase",
        }}>
          {isFreeBeta() ? FREE_BETA_COPY.badge : "BETA"}
        </div>

        <Display
          as="h1"
          size="xl"
          style={{
            fontSize: "var(--display-1)",
            lineHeight: "var(--leading-tight)",
            letterSpacing: "var(--tracking-tight)",
            marginBottom: 20,
            color: "var(--text-primary)",
            fontWeight: 800,
          }}
        >
          {t("headline")}
        </Display>
        <p style={{
          fontSize: "var(--text-md)",
          color: "var(--text-secondary)",
          lineHeight: "var(--leading-normal)",
          margin: 0,
        }}>
          {t("subheadline")}
        </p>
      </div>

      {/* 재방문 배너 (닉네임 있을 때만 노출) */}
      <ReturningBanner />

      {/* OPFS 복원 인라인 카드 */}
      {resumeCandidates.length > 0 && (
        <div style={{
          width: "100%", maxWidth: 700, padding: "20px 24px",
          margin: "32px 20px 0",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-xs)",
        }}>
          <div style={{
            fontSize: "var(--text-2xs)", color: "var(--text-secondary)",
            fontFamily: "var(--font-mono)", letterSpacing: "var(--tracking-uppercase)",
            textTransform: "uppercase", marginBottom: 10,
          }}>
            {t("resumeSection", { count: resumeCandidates.length })}
          </div>
          {resumeCandidates.slice(0, 3).map((m) => (
            <div key={m.sessionId} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 0", borderTop: "1px solid var(--border-subtle)",
            }}>
              <div>
                <div style={{ color: "var(--text-primary)", fontSize: "var(--text-base)" }}>
                  {m.folderName}
                </div>
                <div style={{
                  color: "var(--text-tertiary)",
                  fontSize: "var(--text-xs)",
                  fontFamily: "var(--font-mono)",
                  marginTop: 2,
                }}>
                  {t("resumeMeta", {
                    count: m.fileNames.length,
                    sizeMB: (m.totalBytes / 1024 / 1024).toFixed(1),
                  })}
                </div>
              </div>
              <button
                className="btn-secondary"
                style={{ padding: "6px 14px", fontSize: "var(--text-sm)" }}
                onClick={() => handleResume(m.sessionId)}
              >
                {t("resumeAction")}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 2-카드 — v2.2 톤 (라이트 카드 + 미세 그림자 + Apple ease 호버) */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: 20,
        width: "100%",
        maxWidth: 720,
        padding: "56px 20px 0",
      }}>
        {CARDS.map((card) => {
          const hasBadge = "badge" in card && typeof (card as { badge?: string }).badge === "string";
          return (
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
                boxShadow: "var(--shadow-xs)",
                cursor: "pointer",
                transition: "border-color var(--dur-base) var(--ease-standard), box-shadow var(--dur-base) var(--ease-standard)",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.borderColor = "var(--border-strong)";
                el.style.boxShadow = "var(--shadow-md)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.borderColor = "var(--border-subtle)";
                el.style.boxShadow = "var(--shadow-xs)";
              }}
            >
              {hasBadge && (
                <div style={{
                  position: "absolute", top: -1, right: 18,
                  background: "var(--accent)",
                  color: "var(--text-on-accent)",
                  fontSize: "var(--text-2xs)",
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: "0 0 var(--radius-sm) var(--radius-sm)",
                  letterSpacing: "0.03em",
                }}>
                  {(card as { badge: string }).badge}
                </div>
              )}

              <div style={{
                fontSize: "var(--text-2xs)",
                fontWeight: 600,
                marginBottom: 10,
                color: "var(--text-secondary)",
                letterSpacing: "var(--tracking-uppercase)",
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
              }}>
                {card.tag}
              </div>

              <div style={{
                fontSize: 22,
                fontWeight: 800,
                marginBottom: 10,
                letterSpacing: "var(--tracking-tight)",
                color: "var(--text-primary)",
              }}>
                {card.title}
              </div>

              <p style={{
                fontSize: "var(--text-sm)",
                color: "var(--text-secondary)",
                lineHeight: "var(--leading-normal)",
                flex: 1,
                marginBottom: 22,
                whiteSpace: "pre-line",
              }}>
                {card.desc}
              </p>

              <button style={{
                width: "100%",
                padding: "13px 0",
                borderRadius: "var(--radius-md)",
                border: "none",
                cursor: "pointer",
                background: "var(--accent)",
                color: "var(--text-on-accent)",
                fontSize: "var(--text-sm)",
                fontWeight: 700,
                letterSpacing: "-0.01em",
                pointerEvents: "none",
              }}>
                {card.cta}
              </button>
            </div>
          );
        })}
      </div>

      {/* How it works — 작동 방식 3단계 */}
      <div style={{
        display: "flex",
        gap: 14,
        flexWrap: "wrap",
        justifyContent: "center",
        maxWidth: 720,
        padding: "56px 20px 0",
      }}>
        {[
          { num: "01", title: t("step1"), desc: t("step1desc") },
          { num: "02", title: t("step2"), desc: t("step2desc") },
          { num: "03", title: t("step3"), desc: t("step3desc") },
        ].map((s) => (
          <div key={s.num} style={{
            flex: "1 1 200px",
            textAlign: "left",
            padding: "20px 18px",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
          }}>
            <div style={{
              fontSize: "var(--text-2xs)",
              fontFamily: "var(--font-mono)",
              color: "var(--text-tertiary)",
              marginBottom: 8,
              letterSpacing: "var(--tracking-uppercase)",
            }}>
              {s.num}
            </div>
            <div style={{
              fontSize: "var(--text-base)",
              fontWeight: 700,
              marginBottom: 6,
              color: "var(--text-primary)",
            }}>
              {s.title}
            </div>
            <div style={{
              fontSize: "var(--text-xs)",
              color: "var(--text-secondary)",
              lineHeight: "var(--leading-normal)",
            }}>
              {s.desc}
            </div>
          </div>
        ))}
      </div>

      <p style={{
        fontSize: "var(--text-2xs)",
        color: "var(--text-tertiary)",
        textAlign: "center",
        padding: "44px 20px 40px",
        letterSpacing: "0.02em",
        margin: 0,
      }}>
        {t("footerPrivacy")}
      </p>
    </div>
  );
}
