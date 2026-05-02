/**
 * PersonSelect.tsx — §3.9 주인공(Hero) 선택 화면
 * TECH_SPEC §3.9 / CLAUDE_CODE_PROMPT_MISSED_FEATURES §2-5
 *
 * 진입: 분석 파이프라인의 얼굴 감지 완료 직후, 갤러리 진입 직전.
 * 큐레이터 톤 디자인 (DESIGN_DIRECTION 기준).
 */
import { useState, useCallback } from "react";
import { useStore } from "../lib/store";
import { saveHeroPersonName, loadHeroPersonNames } from "../lib/userProfile";
import type { AppState, PersonCluster } from "../lib/types";

export default function PersonSelect() {
  const personClusters  = useStore((s) => s.personClusters);
  const flow            = useStore((s) => s.flow);
  const photos          = useStore((s) => s.photos);
  const folderSessions  = useStore((s) => s.folderSessions);
  const setStep         = useStore((s) => s.setStep) as (step: AppState["step"]) => void;
  const applyHeroConfig = useStore((s) => s.applyHeroConfig);

  const [selectedIds, setSelectedIds]           = useState<string[]>([]);
  const [heroMode, setHeroMode]                 = useState<"OR" | "AND">("OR");
  const [guaranteeNonHero, setGuaranteeNonHero] = useState(true);
  const [toast, setToast]                       = useState<string | null>(null);
  // 이름 입력 모달 상태
  const [editingCluster, setEditingCluster]     = useState<PersonCluster | null>(null);
  const [editingName, setEditingName]           = useState("");
  // 영속 이름 로드
  const [personNames, setPersonNames]           = useState<Record<string, string>>(
    () => loadHeroPersonNames()
  );

  // faceCount 내림차순 정렬
  const clusters = [...personClusters.values()].sort((a, b) => b.faceCount - a.faceCount);

  const getThumbnail = useCallback((cluster: PersonCluster): string => {
    let photo = photos.get(cluster.representativePhotoId);
    if (!photo) {
      for (const fs of folderSessions) {
        photo = fs.photos.get(cluster.representativePhotoId);
        if (photo) break;
      }
    }
    return photo?.thumbnail ?? "";
  }, [photos, folderSessions]);

  function toggle(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }

  function handleConfirm(skip = false) {
    let heroIds = skip ? [] : selectedIds;

    if (skip && clusters.length > 0) {
      // 자동 디폴트: 등장 횟수 가장 많은 인물
      heroIds = [clusters[0].id];
      showToast("등장 횟수가 가장 많은 인물을 자동으로 골랐습니다.");
    }

    applyHeroConfig({
      selectedPersonIds: heroIds,
      mode: heroIds.length >= 2 ? heroMode : "OR",
      guaranteeNonHeroCount: guaranteeNonHero ? 5 : 0,
    });

    setStep(flow === "B" ? "folderGallery" : "gallery");
  }

  // 더블클릭: 이름 입력 모달 열기
  function openNameEdit(cluster: PersonCluster) {
    setEditingCluster(cluster);
    setEditingName(personNames[cluster.id] ?? cluster.displayName ?? "");
  }

  function saveNameEdit() {
    if (!editingCluster) return;
    const name = editingName.trim();
    if (name) {
      saveHeroPersonName(editingCluster.id, name);
      setPersonNames((prev) => ({ ...prev, [editingCluster.id]: name }));
    }
    setEditingCluster(null);
    setEditingName("");
  }

  const displayName = (cluster: PersonCluster) =>
    personNames[cluster.id] ?? cluster.displayName;

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "48px 16px 96px",
    }}>

      {/* ─── 헤더 ─────────────────────────────────────────── */}
      <div style={{ textAlign: "center", maxWidth: 560, marginBottom: 40 }}>
        <h1 style={{
          fontFamily: "var(--font-display)",
          fontSize: 26,
          fontWeight: 700,
          color: "var(--text-primary)",
          marginBottom: 10,
          letterSpacing: "-0.02em",
          lineHeight: 1.3,
        }}>
          사진 속 인물을 만났습니다.
        </h1>
        <p style={{
          fontSize: 15,
          color: "var(--text-secondary)",
          lineHeight: 1.7,
          margin: 0,
        }}>
          중심에 둘 인물을 골라주세요.
          {clusters.length > 0 && (
            <span style={{ color: "var(--accent)", fontWeight: 600 }}>
              {" "}({clusters.length}명 감지됨)
            </span>
          )}
        </p>
        <p style={{
          fontSize: 12,
          color: "var(--text-tertiary)",
          marginTop: 6,
        }}>
          더블클릭하면 이름을 붙일 수 있습니다
        </p>
      </div>

      {/* ─── 인물 카드 그리드 ─────────────────────────────── */}
      {clusters.length === 0 ? (
        <div style={{
          color: "var(--text-secondary)",
          fontSize: 14,
          padding: "40px 0",
          textAlign: "center",
        }}>
          감지된 인물이 없습니다. 건너뛰기를 눌러 일반 셀렉을 진행하세요.
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: "1px",           // 1px 갭 — 명세
          width: "100%",
          maxWidth: 600,
          marginBottom: 32,
          background: "var(--border)",  // gap이 border처럼 보임
          borderRadius: "var(--radius-lg, 16px)",
          overflow: "hidden",
          border: "1px solid var(--border)",
        }}>
          {clusters.map((cluster) => {
            const selected = selectedIds.includes(cluster.id);
            const thumb = getThumbnail(cluster);
            const name = displayName(cluster);

            return (
              <button
                key={cluster.id}
                onClick={() => toggle(cluster.id)}
                onDoubleClick={(e) => { e.stopPropagation(); openNameEdit(cluster); }}
                style={{
                  position: "relative",
                  background: selected ? "var(--bg-elevated, var(--bg2))" : "var(--bg2)",
                  border: "none",
                  cursor: "pointer",
                  padding: 14,
                  textAlign: "center",
                  outline: "none",
                  transition: "background 0.12s",
                }}
              >
                {/* 선택 체크 */}
                {selected && (
                  <div style={{
                    position: "absolute",
                    top: 8, right: 8,
                    width: 22, height: 22,
                    borderRadius: "50%",
                    background: "var(--accent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    color: "var(--bg)",
                    fontWeight: 800,
                    zIndex: 2,
                  }}>✓</div>
                )}

                {/* 선택 하이라이트 테두리 */}
                {selected && (
                  <div style={{
                    position: "absolute",
                    inset: 0,
                    border: "2px solid var(--accent)",
                    pointerEvents: "none",
                    zIndex: 1,
                  }} />
                )}

                {/* 썸네일 */}
                <div style={{
                  width: "100%",
                  paddingBottom: "100%",
                  position: "relative",
                  borderRadius: "var(--radius-sm, 2px)",
                  overflow: "hidden",
                  background: "var(--bg3, #1a1a1a)",
                  marginBottom: 10,
                }}>
                  {thumb ? (
                    <img
                      src={thumb}
                      alt={name ? `${name} 대표 사진` : `인물 ${cluster.id}`}
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <div style={{
                      position: "absolute", inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 32,
                      color: "var(--text-tertiary)",
                    }}>
                      👤
                    </div>
                  )}
                </div>

                {/* 이름 / 컷 수 */}
                {name && (
                  <div style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: selected ? "var(--accent)" : "var(--text-primary)",
                    marginBottom: 2,
                    fontFamily: "var(--font-display)",
                  }}>
                    {name}
                  </div>
                )}
                <div style={{
                  fontSize: 11,
                  color: "var(--text-secondary)",
                }}>
                  {cluster.faceCount}컷
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ─── AND/OR 모드 토글 (2명 이상 선택 시) ─────────── */}
      {selectedIds.length >= 2 && (
        <div
          style={{
            width: "100%",
            maxWidth: 600,
            background: "var(--bg2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm, 2px)",
            padding: "14px 18px",
            marginBottom: 14,
          }}
          title="모두 등장: 모든 인물이 함께 나온 컷만 / 한 명이라도: 선택한 인물 누구든"
        >
          <div style={{
            fontSize: 12,
            color: "var(--text-secondary)",
            marginBottom: 10,
          }}>
            선택한 {selectedIds.length}명이 함께 등장하는 기준
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["OR", "AND"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setHeroMode(m)}
                style={{
                  flex: 1,
                  padding: "8px 0",
                  borderRadius: "var(--radius-sm, 2px)",
                  fontSize: 13,
                  fontWeight: heroMode === m ? 700 : 400,
                  background: heroMode === m ? "var(--accent)" : "transparent",
                  color: heroMode === m ? "var(--bg)" : "var(--text-secondary)",
                  border: heroMode === m ? "none" : "1px solid var(--border)",
                  cursor: "pointer",
                  transition: "all 0.12s",
                }}
              >
                {m === "OR" ? "한 명이라도 등장" : "모두 함께 등장"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── 비주인공 컷 보장 토글 ─────────────────────────── */}
      <div style={{
        width: "100%",
        maxWidth: 600,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        marginBottom: 24,
        background: "var(--bg2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm, 2px)",
        cursor: "pointer",
      }}
        onClick={() => setGuaranteeNonHero((v) => !v)}
      >
        <div style={{
          width: 40,
          height: 22,
          borderRadius: 11,
          background: guaranteeNonHero ? "var(--accent)" : "var(--border)",
          position: "relative",
          transition: "background 0.15s",
          flexShrink: 0,
        }}>
          <div style={{
            position: "absolute",
            top: 3,
            left: guaranteeNonHero ? 21 : 3,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "#fff",
            transition: "left 0.15s",
            boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
          }} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            비주인공 컷도 5장 보장
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            주인공이 없는 사진도 최소 5장 포함합니다
          </div>
        </div>
      </div>

      {/* ─── 하단 버튼 ────────────────────────────────────── */}
      <div style={{
        width: "100%",
        maxWidth: 600,
        display: "flex",
        gap: 10,
      }}>
        <button
          onClick={() => handleConfirm(true)}
          style={{
            flex: 1,
            height: 50,
            borderRadius: "var(--radius-sm, 2px)",
            fontSize: 14,
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
            cursor: "pointer",
            fontFamily: "var(--font-body)",
          }}
        >
          건너뛰기
        </button>
        <button
          onClick={() => handleConfirm(false)}
          disabled={selectedIds.length === 0}
          style={{
            flex: 2,
            height: 50,
            borderRadius: "var(--radius-sm, 2px)",
            fontSize: 15,
            fontWeight: 700,
            background: selectedIds.length > 0 ? "var(--accent, #C9A961)" : "var(--bg2)",
            color: selectedIds.length > 0 ? "var(--bg)" : "var(--text-secondary)",
            border: "none",
            cursor: selectedIds.length > 0 ? "pointer" : "default",
            transition: "background 0.15s",
            fontFamily: "var(--font-body)",
          }}
        >
          {selectedIds.length > 0
            ? `셀렉 시작 →`
            : "인물을 선택해주세요"}
        </button>
      </div>

      {/* ─── 이름 입력 모달 ──────────────────────────────── */}
      {editingCluster && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9100,
            background: "rgba(14,13,11,0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditingCluster(null); }}
        >
          <div style={{
            background: "var(--bg-elevated, var(--bg2))",
            border: "1px solid var(--border-strong, var(--border))",
            borderRadius: "var(--radius-lg, 16px)",
            padding: "28px 24px",
            width: "100%",
            maxWidth: 340,
            boxShadow: "0 24px 72px rgba(0,0,0,0.5)",
          }}>
            <div style={{
              fontFamily: "var(--font-display)",
              fontSize: 18,
              fontWeight: 700,
              color: "var(--text-primary)",
              marginBottom: 6,
            }}>
              이름 붙이기
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 18 }}>
              이 인물을 뭐라고 부를까요?
            </div>
            <input
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveNameEdit();
                if (e.key === "Escape") setEditingCluster(null);
              }}
              placeholder="예: 지유, 엄마, 아빠"
              autoFocus
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: "var(--radius-sm, 2px)",
                border: "1px solid var(--border)",
                background: "var(--bg3, #1a1a1a)",
                color: "var(--text-primary)",
                fontSize: 15,
                fontFamily: "var(--font-body)",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button
                onClick={() => setEditingCluster(null)}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: "var(--radius-sm, 2px)",
                  background: "transparent",
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                취소
              </button>
              <button
                onClick={saveNameEdit}
                style={{
                  flex: 2,
                  height: 44,
                  borderRadius: "var(--radius-sm, 2px)",
                  background: "var(--accent, #C9A961)",
                  color: "var(--bg)",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 토스트 ──────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: "fixed",
          bottom: 32,
          left: "50%",
          transform: "translateX(-50%)",
          background: "var(--bg-elevated, var(--bg2))",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm, 2px)",
          padding: "12px 20px",
          fontSize: 13,
          color: "var(--text-primary)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          zIndex: 9200,
          whiteSpace: "nowrap",
          maxWidth: "90vw",
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
