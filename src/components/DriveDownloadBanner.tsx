/**
 * DriveDownloadBanner.tsx
 * Google Drive 백그라운드 다운로드 진행 상황을 모든 화면에서 보여주는 플로팅 배너.
 * driveQueue가 Zustand 전역 스토어에 있으므로 화면 전환과 무관하게 유지된다.
 */
import { useStore } from "../lib/store";
import type { AppState } from "../lib/types";

export default function DriveDownloadBanner() {
  const driveQueue       = useStore((s) => s.driveQueue);
  const removeDriveQueueItem = useStore((s) => s.removeDriveQueueItem);
  const step             = useStore((s) => s.step);
  const setStep          = useStore((s) => s.setStep) as (step: AppState["step"]) => void;

  if (driveQueue.length === 0) return null;

  const downloading = driveQueue.filter((e) => e.status === "downloading");
  const done        = driveQueue.filter((e) => e.status === "done");
  const errors      = driveQueue.filter((e) => e.status === "error");

  const totalCurrent = downloading.reduce((a, e) => a + e.current, 0);
  const totalFiles   = downloading.reduce((a, e) => a + (e.total || 0), 0);

  return (
    <div style={{
      position: "fixed",
      bottom: 24,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 8000,
      width: "min(480px, calc(100vw - 32px))",
      background: "var(--bg2)",
      border: "1px solid var(--border)",
      borderLeft: "4px solid var(--accent)",
      borderRadius: "var(--radius-lg)", 
      padding: "14px 18px",
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 16 }}>
          {downloading.length > 0 ? "⬇" : errors.length > 0 ? "❌" : "✅"}
        </span>
        <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>
          {downloading.length > 0
            ? `Drive 다운로드 중 (${downloading.length}개 폴더)`
            : done.length > 0
              ? `다운로드 완료 — 분석 준비됐어요!`
              : `오류가 발생했어요`}
        </span>
        {downloading.length > 0 && totalFiles > 0 && (
          <span style={{ fontSize: 12, color: "var(--text2)", whiteSpace: "nowrap" }}>
            {totalCurrent} / {totalFiles}장
          </span>
        )}
      </div>

      {/* 진행 바 (다운로드 중인 항목이 있을 때) */}
      {downloading.length > 0 && totalFiles > 0 && (
        <div style={{
          height: 4, borderRadius: 2,
          background: "var(--border)",
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            width: `${Math.round((totalCurrent / totalFiles) * 100)}%`,
            background: "linear-gradient(90deg, var(--accent), var(--accent2))",
            transition: "width 0.3s ease",
            borderRadius: 2,
          }} />
        </div>
      )}

      {/* 폴더별 목록 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {driveQueue.map((item) => (
          <div key={item.id} style={{
            display: "flex", alignItems: "center", gap: 8,
            fontSize: 13, color: item.status === "error" ? "#ff5050" : "var(--text2)",
          }}>
            <span>{item.status === "downloading" ? "⬇" : item.status === "done" ? "✅" : "❌"}</span>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.folderName}
            </span>
            {item.status === "downloading" && (
              <span style={{ whiteSpace: "nowrap" }}>
                {item.total > 0 ? `${item.current}/${item.total}` : "목록 확인 중..."}
              </span>
            )}
            {item.status === "error" && (
              <>
                <span style={{ fontSize: 12 }}>{item.errorMsg}</span>
                <button
                  onClick={() => removeDriveQueueItem(item.id)}
                  style={{ background: "none", border: "none", cursor: "pointer",
                    color: "var(--text2)", fontSize: 14, padding: "0 2px", lineHeight: 1 }}
                >✕</button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* 액션 버튼 */}
      <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
        {/* folderUpload가 아닌 다른 화면일 때 "추가하러 가기" 버튼 표시 */}
        {step !== "folderUpload" && downloading.length > 0 && (
          <button
            onClick={() => setStep("folderUpload")}
            style={{
              flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: "1.5px solid var(--border)", background: "transparent",
              color: "var(--text)", cursor: "pointer",
            }}
          >
            폴더 더 추가하기
          </button>
        )}
        {/* 다운로드 완료 후 folderUpload가 아닌 화면이라면 "분석 시작" 버튼 */}
        {step !== "folderUpload" && downloading.length === 0 && done.length > 0 && (
          <button
            onClick={() => setStep("folderUpload")}
            style={{
              flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 13, fontWeight: 700,
              border: "none",
              background: "linear-gradient(135deg, var(--accent), var(--accent2))",
              color: "#fff", cursor: "pointer",
            }}
          >
            🚀 분석 시작하러 가기
          </button>
        )}
        {/* 완료 항목 전체 닫기 */}
        {downloading.length === 0 && (
          <button
            onClick={() => driveQueue.forEach((e) => removeDriveQueueItem(e.id))}
            style={{
              padding: "8px 16px", borderRadius: 8, fontSize: 13,
              border: "1.5px solid var(--border)", background: "transparent",
              color: "var(--text2)", cursor: "pointer",
            }}
          >
            닫기
          </button>
        )}
      </div>
    </div>
  );
}
