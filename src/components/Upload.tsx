import { useRef, useState, useCallback } from "react";
import { useT } from "../lib/i18n";
import { useStore } from "../lib/store";
import LangToggle from "./LangToggle";

export default function Upload() {
  const t = useT("upload");
  const tCommon = useT("common");
  const targetCount = useStore((s) => s.targetCount);
  const setTargetCount = useStore((s) => s.setTargetCount);
  const maxPerGroup = useStore((s) => s.maxPerGroup);
  const setMaxPerGroup = useStore((s) => s.setMaxPerGroup);
  const setStep = useStore((s) => s.setStep);

  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming).filter((f) =>
      /\.(jpe?g|png|heic|heif|webp|avif|tiff?)$/i.test(f.name)
    );
    setFiles(arr);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const startAnalysis = () => {
    if (files.length === 0) return;
    (window as unknown as Record<string, unknown>).__ddalgak_files = files;
    setStep("analysis");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "24px", background: "var(--bg)" }}>
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, display: "flex",
        justifyContent: "space-between", alignItems: "center", padding: "16px 24px",
        borderBottom: "1px solid var(--border)", background: "var(--bg)", zIndex: 100 }}>
        <button className="btn-secondary" style={{ padding: "6px 14px", fontSize: 13 }}
          onClick={() => setStep("typeSelect")}>← {t("back")}</button>
        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--accent2)" }}>딸깍픽스</span>
        <LangToggle />
      </div>

      <div style={{ width: "100%", maxWidth: 600 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, textAlign: "center", marginBottom: 8 }}>{t("title")}</h2>
        <p style={{ textAlign: "center", color: "var(--text2)", marginBottom: 32, fontSize: 14 }}>{t("subtitle")}</p>

        <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)} onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{ border: `2px dashed ${dragging ? "var(--accent)" : "var(--border)"}`,
            borderRadius: 16, padding: "48px 24px", textAlign: "center", cursor: "pointer",
            background: dragging ? "rgba(108,99,255,0.08)" : "var(--bg2)", transition: "all 0.15s", marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📂</div>
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            {files.length > 0 ? t("selected", { count: files.length }) : t("dragDrop")}
          </p>
          <p style={{ fontSize: 13, color: "var(--text2)" }}>{t("orClick")}</p>
        </div>

        <input ref={fileInputRef} type="file" multiple
          accept="image/jpeg,image/png,image/heic,image/heif,image/webp,image/avif,image/tiff"
          style={{ display: "none" }} onChange={(e) => e.target.files && handleFiles(e.target.files)} />

        <div className="card" style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 12 }}>{t("targetCount")}</label>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {[10, 20, 30, 50, 100].map((n) => (
              <button key={n} onClick={() => setTargetCount(n)}
                style={{ padding: "8px 16px", borderRadius: 8,
                  border: `2px solid ${targetCount === n ? "var(--accent)" : "var(--border)"}`,
                  background: targetCount === n ? "rgba(108,99,255,0.15)" : "transparent",
                  color: targetCount === n ? "var(--accent2)" : "var(--text2)",
                  fontWeight: 600, cursor: "pointer", fontSize: 14 }}>{n}</button>
            ))}
            <input type="number" min={1} max={3000} value={targetCount}
              onChange={(e) => setTargetCount(Number(e.target.value))}
              style={{ padding: "8px 12px", borderRadius: 8, border: "2px solid var(--border)",
                background: "var(--bg3)", color: "var(--text)", fontSize: 14, width: 80 }} />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 4 }}>
            유사한 구도·포즈 최대 허용 장수
          </label>
          <p style={{ fontSize: 12, color: "var(--text2)", marginBottom: 12 }}>
            비슷한 사진이 많을 때 몇 장까지 선별할지 결정합니다 (기본값 2장 권장)
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[
              { label: "1장", value: 1 },
              { label: "2장", value: 2 },
              { label: "3장", value: 3 },
              { label: "5장", value: 5 },
              { label: "무제한", value: 9999 },
            ].map(({ label, value }) => (
              <button key={value} onClick={() => setMaxPerGroup(value)}
                style={{ padding: "8px 14px", borderRadius: 8,
                  border: `2px solid ${maxPerGroup === value ? "var(--accent)" : "var(--border)"}`,
                  background: maxPerGroup === value ? "rgba(108,99,255,0.15)" : "transparent",
                  color: maxPerGroup === value ? "var(--accent2)" : "var(--text2)",
                  fontWeight: 600, cursor: "pointer", fontSize: 14 }}>{label}</button>
            ))}
          </div>
        </div>

        {files.length > 0 && (
          <div style={{ padding: "12px 16px", borderRadius: 8, background: "rgba(108,99,255,0.1)",
            border: "1px solid rgba(108,99,255,0.3)", marginBottom: 16, fontSize: 13, color: "var(--accent2)" }}>
            📸 {files.length}장 선택 · 목표: {targetCount}장 · 유사사진 최대: {maxPerGroup >= 9999 ? "무제한" : `${maxPerGroup}장`}
          </div>
        )}

        <button className="btn-primary" style={{ width: "100%", fontSize: 16, padding: "14px" }}
          disabled={files.length === 0 || targetCount < 1} onClick={startAnalysis}>
          {files.length === 0 ? "사진을 먼저 선택해주세요" : t("analyze")}
        </button>

        {files.length === 0 && (
          <p style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: "var(--text2)" }}>{tCommon("loading")}</p>
        )}
      </div>
    </div>
  );
}
