/**
 * PersonSelect.tsx — §3.9 주인공(Hero) 선택 화면
 * 분석 완료 후 인물 클러스터를 보여주고 주인공을 지정합니다.
 */
import { useState } from "react";
import { useStore } from "../lib/store";
import type { AppState, PersonCluster } from "../lib/types";

export default function PersonSelect() {
  const personClusters = useStore((s) => s.personClusters);
  const flow           = useStore((s) => s.flow);
  const photos         = useStore((s) => s.photos);
  const folderSessions = useStore((s) => s.folderSessions);
  const setStep        = useStore((s) => s.setStep) as (step: AppState["step"]) => void;
  const applyHeroConfig = useStore((s) => s.applyHeroConfig);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [heroMode, setHeroMode] = useState<"OR" | "AND">("OR");

  // 화면 수가 많을 때 faceCount 순 정렬
  const clusters = [...personClusters.values()].sort((a, b) => b.faceCount - a.faceCount);

  function getThumbnail(cluster: PersonCluster): string {
    let photo = photos.get(cluster.representativePhotoId);
    if (!photo) {
      for (const fs of folderSessions) {
        photo = fs.photos.get(cluster.representativePhotoId);
        if (photo) break;
      }
    }
    return photo?.thumbnail ?? "";
  }

  function toggle(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function handleConfirm(skip = false) {
    const heroIds = skip ? [] : selectedIds;
    applyHeroConfig({
      selectedPersonIds: heroIds,
      mode: heroIds.length >= 2 ? heroMode : "OR",
      guaranteeNonHeroCount: 5,
    });
    setStep(flow === "B" ? "folderGallery" : "gallery");
  }

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg)",
      display: "flex", flexDirection: "column",
      alignItems: "center", padding: "32px 16px 80px",
    }}>
      {/* 헤더 */}
      <div style={{ textAlign: "center", maxWidth: 560, marginBottom: 32 }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: "linear-gradient(135deg, var(--accent), var(--accent2))",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 28, margin: "0 auto 18px",
        }}>👤</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
          주인공을 선택하세요
        </h1>
        <p style={{ fontSize: 14, color: "var(--text2)", lineHeight: 1.7, margin: 0 }}>
          AI가 사진에서 <strong style={{ color: "var(--accent)" }}>{clusters.length}명</strong>의 인물을 찾았어요.
          <br />주인공 사진을 먼저 골라드릴게요. 건너뛰면 일반 선별을 진행합니다.
        </p>
      </div>

      {/* 인물 카드 그리드 */}
      {clusters.length === 0 ? (
        <div style={{ color: "var(--text2)", fontSize: 14, marginBottom: 32 }}>
          감지된 인물이 없습니다.
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: 14,
          width: "100%", maxWidth: 600,
          marginBottom: 32,
        }}>
          {clusters.map((cluster) => {
            const selected = selectedIds.includes(cluster.id);
            const thumb = getThumbnail(cluster);
            return (
              <button
                key={cluster.id}
                onClick={() => toggle(cluster.id)}
                style={{
                  position: "relative",
                  background: selected
                    ? "linear-gradient(135deg, rgba(99,102,241,0.18), rgba(168,85,247,0.18))"
                    : "var(--bg2)",
                  border: selected
                    ? "2.5px solid var(--accent)"
                    : "1.5px solid var(--border)",
                  borderRadius: 16,
                  padding: 14,
                  cursor: "pointer",
                  transition: "all 0.18s",
                  textAlign: "center",
                  outline: "none",
                }}
              >
                {/* 선택 체크 */}
                {selected && (
                  <div style={{
                    position: "absolute", top: 8, right: 8,
                    width: 22, height: 22, borderRadius: "50%",
                    background: "var(--accent)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, color: "#fff", fontWeight: 800,
                  }}>✓</div>
                )}

                {/* 썸네일 */}
                <div style={{
                  width: "100%", paddingBottom: "100%",
                  position: "relative", borderRadius: 10, overflow: "hidden",
                  background: "var(--bg)", marginBottom: 10,
                }}>
                  {thumb ? (
                    <img
                      src={thumb}
                      alt={`인물 ${cluster.id}`}
                      style={{
                        position: "absolute", inset: 0,
                        width: "100%", height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <div style={{
                      position: "absolute", inset: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 32, color: "var(--text2)",
                    }}>👤</div>
                  )}
                </div>

                {/* 인물 정보 */}
                <div style={{ fontSize: 12, color: "var(--text2)" }}>
                  {cluster.faceCount}장 등장
                </div>
                {cluster.displayName && (
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 3 }}>
                    {cluster.displayName}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* AND/OR 모드 토글 — 2명 이상 선택 시만 표시 */}
      {selectedIds.length >= 2 && (
        <div style={{
          width: "100%", maxWidth: 600,
          background: "var(--bg2)", border: "1px solid var(--border)",
          borderRadius: 14, padding: "14px 18px",
          marginBottom: 20,
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <span style={{ fontSize: 13, color: "var(--text2)", flex: 1 }}>
            선택한 {selectedIds.length}명이 <strong>모두 함께</strong> 찍힌 사진만 우선?
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            {(["OR", "AND"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setHeroMode(m)}
                style={{
                  padding: "6px 14px", borderRadius: 8, fontSize: 13,
                  fontWeight: heroMode === m ? 700 : 400,
                  background: heroMode === m
                    ? "linear-gradient(135deg, var(--accent), var(--accent2))"
                    : "transparent",
                  color: heroMode === m ? "#fff" : "var(--text2)",
                  border: heroMode === m ? "none" : "1px solid var(--border)",
                  cursor: "pointer",
                }}
              >
                {m === "OR" ? "한 명이라도" : "모두 함께"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 하단 버튼 */}
      <div style={{ width: "100%", maxWidth: 600, display: "flex", gap: 10 }}>
        <button
          onClick={() => handleConfirm(true)}
          style={{
            flex: 1, padding: "13px 0", borderRadius: 12, fontSize: 15,
            background: "transparent",
            border: "1.5px solid var(--border)",
            color: "var(--text2)", cursor: "pointer",
          }}
        >
          건너뛰기
        </button>
        <button
          onClick={() => handleConfirm(false)}
          disabled={selectedIds.length === 0}
          style={{
            flex: 2, padding: "13px 0", borderRadius: 12, fontSize: 15, fontWeight: 700,
            background: selectedIds.length > 0
              ? "linear-gradient(135deg, var(--accent), var(--accent2))"
              : "var(--bg2)",
            color: selectedIds.length > 0 ? "#fff" : "var(--text2)",
            border: "none",
            cursor: selectedIds.length > 0 ? "pointer" : "default",
            transition: "all 0.18s",
          }}
        >
          {selectedIds.length > 0
            ? `주인공 ${selectedIds.length}명 선택 완료 →`
            : "인물을 선택하세요"}
        </button>
      </div>
    </div>
  );
}
