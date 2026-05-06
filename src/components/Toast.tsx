import { useEffect, useState } from "react";

export interface ToastMessage {
  id: string;
  text: string;
  emoji?: string;
  duration?: number; // ms, default 3000
}

// ── 글로벌 토스트 이벤트 버스 ─────────────────────────────────────────────
type Listener = (msg: ToastMessage) => void;
const listeners = new Set<Listener>();

export function showToast(text: string, emoji = "✅", duration = 3200) {
  const msg: ToastMessage = {
    id: `toast-${Date.now()}-${Math.random()}`,
    text, emoji, duration,
  };
  listeners.forEach((fn) => fn(msg));
}

// ── Toast 컨테이너 — AppShell에 마운트 ──────────────────────────────────
export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handler: Listener = (msg) => {
      setToasts((prev) => [...prev, msg]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== msg.id));
      }, msg.duration ?? 3200);
    };
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
      zIndex: 20000, display: "flex", flexDirection: "column-reverse", gap: 8,
      pointerEvents: "none", alignItems: "center",
    }}>
      {toasts.map((t) => (
        <div key={t.id} style={{
          background: "rgba(30,30,36,0.96)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "var(--radius-lg)",  padding: "12px 20px",
          display: "flex", alignItems: "center", gap: 10,
          animation: "toastIn 0.28s cubic-bezier(0.34,1.56,0.64,1)",
          whiteSpace: "nowrap",
        }}>
          {t.emoji && <span style={{ fontSize: 18 }}>{t.emoji}</span>}
          <span style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{t.text}</span>
        </div>
      ))}
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: scale(0.92); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
