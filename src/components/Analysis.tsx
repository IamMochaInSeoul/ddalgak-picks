import { useEffect, useRef, useState } from "react";
import { useT } from "../lib/i18n";
import { useStore } from "../lib/store";
import { analyzePhotos, serializeError } from "../lib/analyzer";

export default function Analysis() {
  const t = useT("analysis");
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
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const files = (window as unknown as Record<string, unknown>).__ddalgak_files as File[] | undefined;
    if (!files || files.length === 0 || !photoType) { setStep("upload"); return; }

    analyzePhotos(files, photoType, targetCount, weights, petWeights, filters,
      (current, total, stageKey) => setAnalysisProgress(current, total, stageKey), maxPerGroup)
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

  const stageLabels: Record<string, string> = {
    loadingModel: t("loadingModel"), grouping: t("grouping"),
    scoring: t("scoring"), selecting: t("selecting"), done: t("done"),
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "24px", background: "var(--bg)" }}>
      <div style={{ textAlign: "center", maxWidth: 520, width: "100%" }}>
        <div style={{ width: 80, height: 80, borderRadius: "50%",
          background: "linear-gradient(135deg, var(--accent), var(--accent2))",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 36, margin: "0 auto 24px",
          animation: error ? "none" : "pulse 2s infinite" }}>
          {error ? "⚠️" : "🤖"}
        </div>

        {error ? (
          <>
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
          </>
        ) : (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{t("title")}</h2>
            <p style={{ fontSize: 14, color: "var(--text2)", marginBottom: 32 }}>
              {stageLabels[stage] ?? t("loadingModel")}
            </p>
            <div className="progress-bar" style={{ marginBottom: 12 }}>
              <div className="progress-fill" style={{ width: `${Math.max(5, progress * 100)}%` }} />
            </div>
            <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 24 }}>{Math.round(progress * 100)}%</p>
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              padding: "12px 16px", borderRadius: 10,
              background: "rgba(245,158,11,0.10)",
              border: "1px solid rgba(245,158,11,0.35)",
              textAlign: "left",
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>💡</span>
              <p style={{ fontSize: 13, color: "#d97706", margin: 0, lineHeight: 1.6 }}>
                AI가 사진을 한 장씩 분석하고 있어요.<br />
                <strong>이 화면을 벗어나거나 브라우저를 최소화하면 분석 속도가 크게 느려집니다.</strong><br />
                잠시만 이 화면에서 기다려 주세요 ☕
              </p>
            </div>
          </>
        )}
      </div>
      <style>{`@keyframes pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.05);opacity:.85} }`}</style>
    </div>
  );
}
