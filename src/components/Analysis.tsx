import { useEffect, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { analyzePhotos, serializeError } from "../lib/analyzer";

// ── 단계별 스토리텔링 메시지 ────────────────────────────────────────────
const STAGE_STORIES: Record<string, string[]> = {
  loadingModel: [
    "AI가 눈을 뜨고 있어요 👁",
    "머신러닝 모델을 깨우는 중이에요",
    "잠깐만요, 준비 중이에요 ✨",
  ],
  grouping: [
    "비슷한 순간들을 찾아내고 있어요",
    "연속 컷을 묶어보는 중이에요 📸",
    "같은 장면끼리 모아보는 중이에요",
  ],
  scoring: [
    "한 장 한 장 꼼꼼히 보고 있어요",
    "눈을 잘 떴는지 확인 중이에요 👀",
    "표정이 자연스러운지 보고 있어요",
    "초점이 맞는지 살펴보는 중이에요 🔍",
    "가장 빛나는 순간을 찾고 있어요 ✨",
    "흔들리지 않은 사진을 고르는 중이에요",
  ],
  selecting: [
    "최고의 사진들을 추리고 있어요",
    "당신의 베스트컷을 정하는 중이에요 🏆",
    "거의 다 됐어요!",
  ],
  done: ["완성됐어요! 🎉"],
};

const TIPS = [
  "💡 이 화면을 벗어나거나 탭을 전환하면 분석 속도가 크게 느려져요.",
  "📸 사진이 많을수록 더 정확하게 골라드려요.",
  "👥 인물이 많은 사진도 표정을 개별로 확인해요.",
  "🔍 초점, 흔들림, 눈 뜸 여부를 모두 체크하고 있어요.",
  "☕ 잠깐 커피 한 모금 하고 오세요 — 이 창만 열어두면 돼요!",
  "🏆 점수가 비슷하면 구도가 더 좋은 사진을 선택해요.",
];

function useRotatingText(texts: string[], intervalMs = 3000) {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (texts.length <= 1) return;
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % texts.length);
        setVisible(true);
      }, 350);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [texts, intervalMs]);

  return { text: texts[idx], visible };
}

export default function Analysis() {
  const photoType = useStore((s) => s.photoType);
  const targetCount = useStore((s) => s.targetCount);
  const weights = useStore((s) => s.weights);
  const petWeights = useStore((s) => s.petWeights);
  const filters = useStore((s) => s.filters);
  const maxPerGroup = useStore((s) => s.maxPerGroup);
  const setPhotos = useStore((s) => s.setPhotos);
  const setGroups = useStore((s) => s.setGroups);
  const setGroupScoresWithScene = useStore((s) => s.setGroupScoresWithScene);
  const setPersonClusters = useStore((s) => s.setPersonClusters);
  const setStep = useStore((s) => s.setStep);
  const setAnalysisProgress = useStore((s) => s.setAnalysisProgress);
  const progress = useStore((s) => s.analysisProgress);
  const stage = useStore((s) => s.analysisStage);

  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const started = useRef(false);

  const storyTexts = STAGE_STORIES[stage] ?? STAGE_STORIES.loadingModel;
  const story = useRotatingText(storyTexts, 2800);
  const tip = useRotatingText(TIPS, 5000);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const files = (window as unknown as Record<string, unknown>).__ddalgak_files as File[] | undefined;
    if (!files || files.length === 0 || !photoType) { setStep("upload"); return; }

    analyzePhotos(files, photoType, targetCount, weights, petWeights, filters,
      (cur, tot, stageKey) => {
        setAnalysisProgress(cur, tot, stageKey);
        setCurrent(cur);
        setTotal(tot);
      }, maxPerGroup)
      .then(({ photos, groups, groupScoresWithScene, personClusters }) => {
        setPhotos(photos);
        setGroups(groups);
        setGroupScoresWithScene(groupScoresWithScene);
        setPersonClusters(personClusters);
        const clusteringOn = import.meta.env.VITE_FEATURE_PERSON_CLUSTERING === "true";
        setStep(clusteringOn && personClusters.size > 0 ? "personSelect" : "gallery");
      })
      .catch((err) => {
        console.error("[ddalgak-picks] Analysis failed:", err);
        setError(serializeError(err));
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 에러 화면 ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: "24px", background: "var(--bg)" }}>
        <div style={{ textAlign: "center", maxWidth: 520, width: "100%" }}>
          <div style={{ width: 80, height: 80, borderRadius: "50%",
            background: "linear-gradient(135deg, #ef4444, #f97316)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 36, margin: "0 auto 24px" }}>⚠️</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--low)", marginBottom: 12 }}>분석 오류</h2>
          <pre style={{
            fontSize: 12, color: "var(--text2)", marginBottom: 24,
            background: "var(--bg2)", padding: "12px 16px", borderRadius: 8,
            textAlign: "left", overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word",
            border: "1px solid var(--border)", maxHeight: 200, overflow: "auto"
          }}>{error}</pre>
          <button className="btn-primary" style={{ marginBottom: 12, width: "100%" }}
            onClick={() => { started.current = false; setError(null); }}>
            🔄 다시 시도
          </button>
          <button className="btn-secondary" style={{ width: "100%", padding: "10px 20px" }}
            onClick={() => setStep("upload")}>
            ← 사진 선택으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  // ── 분석 진행 화면 ─────────────────────────────────────────────────────
  const pct = Math.round(progress * 100);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "24px", background: "var(--bg)" }}>
      <div style={{ textAlign: "center", maxWidth: 480, width: "100%" }}>

        {/* 아이콘 */}
        <div style={{
          width: 88, height: 88, borderRadius: "50%",
          background: "linear-gradient(135deg, var(--accent), var(--accent2))",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 40, margin: "0 auto 28px",
          animation: "pulse 2s infinite",
          boxShadow: "0 0 32px rgba(139,92,246,0.35)",
        }}>🤖</div>

        {/* 스토리 메시지 */}
        <div style={{ height: 36, marginBottom: 6, overflow: "hidden" }}>
          <h2 style={{
            fontSize: 22, fontWeight: 700, margin: 0,
            opacity: story.visible ? 1 : 0,
            transform: story.visible ? "translateY(0)" : "translateY(6px)",
            transition: "opacity 0.35s ease, transform 0.35s ease",
          }}>{story.text}</h2>
        </div>

        {/* 사진 카운터 */}
        {total > 0 && stage === "scoring" && (
          <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 20 }}>
            {current} / {total}장 분석 중
          </p>
        )}
        {(total === 0 || stage !== "scoring") && (
          <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 20, height: 20 }} />
        )}

        {/* 프로그레스 바 */}
        <div style={{
          background: "var(--bg2)", borderRadius: 999, height: 8,
          overflow: "hidden", marginBottom: 10,
          border: "1px solid var(--border)",
        }}>
          <div style={{
            height: "100%", borderRadius: 999,
            background: "linear-gradient(90deg, var(--accent), var(--accent2))",
            width: `${Math.max(4, pct)}%`,
            transition: "width 0.4s ease",
            boxShadow: "0 0 8px rgba(139,92,246,0.5)",
          }} />
        </div>
        <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 32, fontVariantNumeric: "tabular-nums" }}>
          {pct}%
        </p>

        {/* 팁 카드 */}
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "14px 16px", borderRadius: 12,
          background: "var(--bg2)",
          border: "1px solid var(--border)",
          textAlign: "left",
          minHeight: 58,
        }}>
          <p style={{
            fontSize: 13, color: "var(--text2)", margin: 0, lineHeight: 1.65,
            opacity: tip.visible ? 1 : 0,
            transition: "opacity 0.4s ease",
            flex: 1,
          }}>{tip.text}</p>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.06); opacity: 0.88; }
        }
      `}</style>
    </div>
  );
}
