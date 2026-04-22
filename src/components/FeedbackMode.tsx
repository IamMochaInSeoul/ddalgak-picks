import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../lib/store";
import {
  adjustWeightsFromFeedback,
  reextractWithPreference,
  FEEDBACK_MIN,
  FEEDBACK_RECOMMEND,
} from "../lib/feedbackLearning";
import type { PhotoScore } from "../lib/types";

export default function FeedbackMode() {
  const photos             = useStore((s) => s.photos);
  const feedbackSamples    = useStore((s) => s.feedbackSamples);
  const feedbackEntries    = useStore((s) => s.feedbackEntries);
  const weights            = useStore((s) => s.weights);
  const groupScoresWithScene = useStore((s) => s.groupScoresWithScene);
  const targetCount        = useStore((s) => s.targetCount);
  const maxPerGroup        = useStore((s) => s.maxPerGroup);
  const addFeedback        = useStore((s) => s.addFeedback);
  const removeFeedback     = useStore((s) => s.removeFeedback);
  const exitFeedbackMode   = useStore((s) => s.exitFeedbackMode);
  const setPreferenceResult = useStore((s) => s.setPreferenceResult);

  const [cursor, setCursor]       = useState(0);       // 현재 보여주는 사진 인덱스
  const [applying, setApplying]   = useState(false);   // 재추출 중
  const [swipeDir, setSwipeDir]   = useState<"left" | "right" | null>(null);
  const [originUrl, setOriginUrl] = useState<string | null>(null);
  const prevUrlRef = useRef<string | null>(null);

  const currentId  = feedbackSamples[cursor] ?? null;
  const currentPhoto = currentId ? photos.get(currentId) ?? null : null;
  const score = currentPhoto?.score ?? null;
  const portraitScore = score && "eyeOpen" in score ? (score as PhotoScore) : null;

  const ratedCount = feedbackEntries.size;
  const canApply   = ratedCount >= FEEDBACK_MIN;
  const progress   = Math.min(1, ratedCount / FEEDBACK_MIN);
  const progressLabel =
    ratedCount < FEEDBACK_MIN
      ? `${ratedCount} / ${FEEDBACK_MIN}장 (재추출까지 ${FEEDBACK_MIN - ratedCount}장 더)`
      : ratedCount < FEEDBACK_RECOMMEND
      ? `${ratedCount}장 평가 완료 ✓ (${FEEDBACK_RECOMMEND}장이면 더 정확해요)`
      : `${ratedCount}장 평가 완료 ✓ 충분한 데이터!`;

  // 원본 해상도 objectURL
  useEffect(() => {
    if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
    if (!currentPhoto?.file) { setOriginUrl(null); prevUrlRef.current = null; return; }
    const url = URL.createObjectURL(currentPhoto.file);
    setOriginUrl(url);
    prevUrlRef.current = url;
    return () => { URL.revokeObjectURL(url); prevUrlRef.current = null; };
  }, [currentPhoto?.file]);

  // 키보드 단축키
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") handleRate(true);
      else if (e.key === "ArrowLeft") handleRate(false);
      else if (e.key === " " || e.key === "Spacebar") { e.preventDefault(); handleSkip(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });   // eslint-disable-line react-hooks/exhaustive-deps

  function handleRate(liked: boolean) {
    if (!currentId || cursor >= feedbackSamples.length) return;
    addFeedback(currentId, liked);
    setSwipeDir(liked ? "right" : "left");
    setTimeout(() => {
      setSwipeDir(null);
      setCursor((c) => Math.min(c + 1, feedbackSamples.length - 1));
    }, 200);
  }

  function handleSkip() {
    if (cursor >= feedbackSamples.length - 1) return;
    setCursor((c) => c + 1);
  }

  function handleUndo() {
    if (cursor === 0) return;
    const prevId = feedbackSamples[cursor - 1];
    if (prevId) removeFeedback(prevId);
    setCursor((c) => c - 1);
  }

  async function handleApply() {
    if (!canApply || applying) return;
    setApplying(true);
    // 가중치 조정
    const newWeights = adjustWeightsFromFeedback(photos, feedbackEntries, weights);
    // 재추출
    const newSelected = reextractWithPreference(
      photos, groupScoresWithScene, newWeights, targetCount, maxPerGroup
    );
    setPreferenceResult(newWeights, newSelected);
    exitFeedbackMode();
  }

  // 점수 바 색상
  const barColor = (v: number) =>
    v >= 0.7 ? "#22c55e" : v >= 0.4 ? "#f59e0b" : "#ef4444";

  // 피드백 여부 표시
  const currentRating = currentId ? feedbackEntries.get(currentId) : undefined;

  const isLast = cursor >= feedbackSamples.length - 1;

  // 가중치 변화 미리보기 (20장 이상이면 계산)
  const previewWeights = useMemo(() => {
    if (ratedCount < FEEDBACK_MIN) return null;
    return adjustWeightsFromFeedback(photos, feedbackEntries, weights);
  }, [ratedCount, feedbackEntries, photos, weights]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 3000,
      background: "var(--bg)",
      display: "flex", flexDirection: "column",
    }}>
      {/* 헤더 */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "14px 20px", borderBottom: "1px solid var(--border)",
        background: "var(--bg2)", flexShrink: 0,
      }}>
        <button
          onClick={exitFeedbackMode}
          style={{ background: "none", border: "none", cursor: "pointer",
            color: "var(--text2)", fontSize: 22, padding: "0 4px" }}
          title="나가기"
        >✕</button>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>✨ 내 취향으로 다시 뽑기</div>
          <div style={{ fontSize: 12, color: "var(--text2)" }}>
            각 사진에 포함/제외 의견을 주세요 — 키보드: → 포함 · ← 제외 · 스페이스 건너뛰기
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {/* 적용 버튼 */}
        <button
          onClick={handleApply}
          disabled={!canApply || applying}
          style={{
            padding: "10px 22px", borderRadius: 10, fontSize: 14, fontWeight: 700,
            border: "none", cursor: canApply ? "pointer" : "not-allowed",
            background: canApply
              ? "linear-gradient(135deg, var(--accent), var(--accent2))"
              : "var(--bg3)",
            color: canApply ? "white" : "var(--text2)",
            opacity: applying ? 0.6 : 1,
            transition: "all 0.2s",
            boxShadow: canApply ? "0 4px 14px rgba(108,99,255,0.4)" : "none",
          }}
        >
          {applying ? "재추출 중..." : canApply ? "내 취향으로 재추출하기 →" : `${FEEDBACK_MIN}장 평가 후 활성화`}
        </button>
      </div>

      {/* 진행 바 */}
      <div style={{ padding: "10px 20px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{
            fontSize: 12,
            color: canApply ? "var(--high)" : "var(--text2)",
            fontWeight: canApply ? 700 : 400,
          }}>{progressLabel}</span>
          <button onClick={handleUndo} disabled={cursor === 0}
            style={{ background: "none", border: "none", cursor: cursor > 0 ? "pointer" : "not-allowed",
              color: cursor > 0 ? "var(--text2)" : "var(--border)", fontSize: 12 }}>
            ↩ 되돌리기
          </button>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: "var(--bg3)", overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 3, transition: "width 0.3s",
            width: `${Math.max(2, progress * 100)}%`,
            background: canApply
              ? "linear-gradient(90deg, #22c55e, #16a34a)"
              : "linear-gradient(90deg, var(--accent), var(--accent2))",
          }} />
        </div>
      </div>

      {/* 가중치 변화 미리보기 */}
      {previewWeights && (
        <div style={{
          margin: "8px 20px 0",
          padding: "8px 14px",
          borderRadius: 8,
          background: "rgba(34,197,94,0.08)",
          border: "1px solid rgba(34,197,94,0.25)",
          display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap",
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 700 }}>조정될 기준 미리보기</span>
          {(["eyeOpen", "sharpness", "expression", "facing"] as const).map((k) => {
            const labels: Record<string, string> = { eyeOpen: "눈뜸", sharpness: "선명도", expression: "표정", facing: "정면" };
            const diff = previewWeights[k] - weights[k];
            const arrow = diff > 0.03 ? "↑" : diff < -0.03 ? "↓" : "─";
            const color = diff > 0.03 ? "#22c55e" : diff < -0.03 ? "#ef4444" : "var(--text2)";
            return (
              <span key={k} style={{ fontSize: 11, color }}>
                {labels[k]} {Math.round(previewWeights[k] * 100)}% {arrow}
              </span>
            );
          })}
        </div>
      )}

      {/* 메인 카드 */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: "12px 20px", overflow: "hidden" }}>

        {feedbackSamples.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--text2)" }}>
            <p>피드백 대상 사진을 불러오는 중...</p>
          </div>
        ) : isLast && ratedCount === 0 ? (
          <div style={{ textAlign: "center", color: "var(--text2)" }}>
            <p>평가할 사진이 없습니다.</p>
          </div>
        ) : (
          <>
            {/* 사진 카드 */}
            {currentPhoto && (
              <div style={{
                width: "100%", maxWidth: 500, flexShrink: 0,
                transform: swipeDir === "right"
                  ? "translateX(60px) rotate(5deg)"
                  : swipeDir === "left"
                  ? "translateX(-60px) rotate(-5deg)"
                  : "none",
                opacity: swipeDir ? 0 : 1,
                transition: "transform 0.18s ease, opacity 0.18s ease",
              }}>
                {/* 사진 */}
                <div style={{
                  position: "relative",
                  borderRadius: 14,
                  overflow: "hidden",
                  border: currentRating === true
                    ? "3px solid #22c55e"
                    : currentRating === false
                    ? "3px solid #ef4444"
                    : "3px solid var(--border)",
                  background: "#000",
                  maxHeight: "calc(100vh - 320px)",
                }}>
                  <img
                    src={originUrl ?? currentPhoto.thumbnail}
                    alt=""
                    style={{
                      display: "block", width: "100%",
                      maxHeight: "calc(100vh - 320px)",
                      objectFit: "contain",
                    }}
                  />
                  {/* 좋아요/싫어요 오버레이 */}
                  {currentRating !== undefined && (
                    <div style={{
                      position: "absolute", inset: 0,
                      background: currentRating
                        ? "rgba(34,197,94,0.15)"
                        : "rgba(239,68,68,0.15)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 64,
                    }}>
                      {currentRating ? "👍" : "👎"}
                    </div>
                  )}
                  {/* 진행 카운터 */}
                  <div style={{
                    position: "absolute", top: 10, right: 10,
                    background: "rgba(0,0,0,0.55)", borderRadius: 20,
                    padding: "3px 10px", fontSize: 11, color: "white",
                  }}>
                    {cursor + 1} / {feedbackSamples.length}
                  </div>
                </div>

                {/* 점수 세부 내역 */}
                {portraitScore && (
                  <div style={{
                    marginTop: 10, padding: "10px 14px",
                    background: "var(--bg2)", borderRadius: 10,
                    border: "1px solid var(--border)",
                    display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px",
                  }}>
                    {([
                      ["눈 뜸", portraitScore.eyeOpen],
                      ["선명도", portraitScore.sharpness],
                      ["표정", portraitScore.expression],
                      ["정면도", portraitScore.facing],
                    ] as [string, number][]).map(([label, val]) => (
                      <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 11, color: "var(--text2)", width: 42, flexShrink: 0 }}>{label}</span>
                        <div style={{ flex: 1, height: 5, background: "var(--bg3)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${val * 100}%`, height: "100%", background: barColor(val), borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 10, color: barColor(val), fontWeight: 700, width: 28, textAlign: "right" }}>
                          {Math.round(val * 100)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 완료 안내 (마지막 사진 이후) */}
            {(isLast && currentRating !== undefined) && (
              <div style={{ marginTop: 16, textAlign: "center", color: "var(--text2)", fontSize: 13 }}>
                모든 사진을 평가했어요!{canApply ? " 위 버튼으로 재추출하세요." : " 재추출까지 조금 부족해요."}
              </div>
            )}

            {/* 버튼 행 */}
            <div style={{
              marginTop: 16, display: "flex", gap: 14, alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              {/* 싫어요 */}
              <button
                onClick={() => handleRate(false)}
                style={{
                  width: 64, height: 64, borderRadius: "50%",
                  border: "2px solid #ef4444",
                  background: currentRating === false ? "#ef4444" : "transparent",
                  fontSize: 26, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.15s",
                }}
                title="제외 원해요 (←)"
              >👎</button>

              {/* 건너뛰기 */}
              <button
                onClick={handleSkip}
                disabled={isLast}
                style={{
                  padding: "10px 20px", borderRadius: 10, fontSize: 13,
                  border: "1.5px solid var(--border)", background: "transparent",
                  color: isLast ? "var(--border)" : "var(--text2)",
                  cursor: isLast ? "not-allowed" : "pointer",
                }}
                title="건너뛰기 (스페이스)"
              >건너뛰기</button>

              {/* 좋아요 */}
              <button
                onClick={() => handleRate(true)}
                style={{
                  width: 64, height: 64, borderRadius: "50%",
                  border: "2px solid #22c55e",
                  background: currentRating === true ? "#22c55e" : "transparent",
                  fontSize: 26, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.15s",
                }}
                title="포함 원해요 (→)"
              >👍</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
