import { useT } from "../lib/i18n";
import { useStore } from "../lib/store";
import type { PhotoType } from "../lib/types";
import LangToggle from "./LangToggle";
import { PrimaryButton, SecondaryButton } from "./ui";

const OPTIONS: { type: PhotoType; icon: string; key: "portrait" | "pet" | "mixed" }[] = [
  { type: "portrait", icon: "👤", key: "portrait" },
  { type: "pet", icon: "🐾", key: "pet" },
  { type: "mixed", icon: "👨‍👧", key: "mixed" },
];

export default function TypeSelect() {
  const t = useT("typeSelect");
  const photoType = useStore((s) => s.photoType);
  const setPhotoType = useStore((s) => s.setPhotoType);
  const setStep = useStore((s) => s.setStep);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "24px", background: "var(--bg)" }}>
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, display: "flex",
        justifyContent: "space-between", alignItems: "center", padding: "16px 24px",
        borderBottom: "1px solid var(--border)", background: "var(--bg)", zIndex: 100 }}>
        <SecondaryButton style={{ padding: "0 14px", height: 34, fontSize: 13 }}
          onClick={() => setStep("landing")}>← 뒤로</SecondaryButton>
        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--accent2)" }}>딸깍픽스</span>
        <LangToggle />
      </div>

      <div style={{ textAlign: "center", maxWidth: 560 }}>
        <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>{t("title")}</h2>
        <p style={{ color: "var(--text2)", marginBottom: 40 }}>{t("subtitle")}</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {OPTIONS.map(({ type, icon, key }) => (
            <button key={type} onClick={() => setPhotoType(type)}
              style={{ display: "flex", alignItems: "center", gap: 16, padding: "20px 24px",
                borderRadius: "var(--radius-lg)", border: `2px solid ${photoType === type ? "var(--accent)" : "var(--border)"}`,
                background: photoType === type ? "rgba(45,67,86,0.12)" : "var(--bg2)",
                cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}>
              <span style={{ fontSize: 32 }}>{icon}</span>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>{t(key)}</div>
                <div style={{ fontSize: 13, color: "var(--text2)" }}>{t(`${key}Desc`)}</div>
              </div>
              {photoType === type && <div style={{ marginLeft: "auto", color: "var(--accent)", fontSize: 20 }}>✓</div>}
            </button>
          ))}
        </div>

        <PrimaryButton fullWidth disabled={!photoType} onClick={() => setStep("upload")}
          style={{ marginTop: 32, fontSize: 16 }}>
          {t("next")} →
        </PrimaryButton>
      </div>
    </div>
  );
}
