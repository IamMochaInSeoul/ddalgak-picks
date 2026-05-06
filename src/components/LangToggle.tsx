
import { useStore } from "../lib/store";

export default function LangToggle() {
  const locale = useStore((s) => s.locale);
  const setLocale = useStore((s) => s.setLocale);

  const toggle = () => {
    const next = locale === "ko" ? "en" : "ko";
    setLocale(next);
    document.cookie = `locale=${next}; path=/; max-age=31536000`;
    window.location.reload();
  };

  return (
    <button
      onClick={toggle}
      style={{
        background: "transparent",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "4px 12px",
        color: "var(--text2)",
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      {locale === "ko" ? "EN" : "KO"}
    </button>
  );
}
