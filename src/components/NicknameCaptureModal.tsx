/**
 * NicknameCaptureModal.tsx
 * 두 번째 분석 완료 직후 닉네임 입력 모달.
 * PERSONALIZATION_PLAN §4-1.
 * 서버 전송 없음 — localStorage만 사용.
 */

import { useState, useEffect } from "react";
import { loadProfile, saveProfile, deferNicknameModal, shouldShowNicknameModal } from "../lib/userProfile";

interface Props {
  /** 모달 닫기 (저장 완료 or 다음에) */
  onClose: () => void;
}

export default function NicknameCaptureModal({ onClose }: Props) {
  const [value, setValue] = useState("");

  // 이미 이름이 있으면 바로 닫기
  useEffect(() => {
    if (!shouldShowNicknameModal()) onClose();
  }, [onClose]);

  function handleSave() {
    const name = value.trim();
    if (!name) return;
    saveProfile({ nickname: name, honorific: "님" });
    onClose();
  }

  function handleDefer() {
    deferNicknameModal();
    onClose();
  }

  // 이미 있는 닉네임 pre-fill
  useEffect(() => {
    const p = loadProfile();
    if (p.nickname) setValue(p.nickname);
  }, []);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(14,13,11,0.82)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px",
    }}>
      <div style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-lg)",
        padding: "32px 28px",
        maxWidth: 400, width: "100%",
        boxShadow: "var(--shadow-modal)",
      }}>
        {/* 헤더 */}
        <div style={{
          fontFamily: "var(--font-display)",
          fontSize: 20, fontWeight: 700,
          letterSpacing: "var(--tracking-display)",
          color: "var(--text-primary)",
          marginBottom: 10,
        }}>
          어떻게 불러드릴까요?
        </div>
        <p style={{
          fontSize: "var(--text-sm)",
          color: "var(--text-secondary)",
          lineHeight: "var(--leading-base)",
          marginBottom: 24,
        }}>
          이름을 기억해두면 다음 셀렉부터<br />
          큐레이션 기준을 더 빠르게 맞출 수 있습니다.
        </p>

        {/* 입력 */}
        <input
          type="text"
          autoFocus
          placeholder="민협"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          style={{
            width: "100%",
            padding: "12px 14px",
            background: "var(--bg-overlay)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius-md)",
            color: "var(--text-primary)",
            fontSize: "var(--text-base)",
            outline: "none",
            marginBottom: 20,
            boxSizing: "border-box",
            fontFamily: "var(--font-sans)",
          }}
        />

        {/* 버튼 */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <button
            onClick={handleSave}
            disabled={!value.trim()}
            style={{
              flex: 1, padding: "13px 0",
              background: value.trim() ? "var(--accent)" : "var(--text-disabled)",
              color: value.trim() ? "#0E0D0B" : "var(--text-tertiary)",
              border: "none", borderRadius: "var(--radius-sm)",
              fontWeight: 700, fontSize: "var(--text-sm)",
              cursor: value.trim() ? "pointer" : "not-allowed",
              transition: "background var(--dur-fast)",
              fontFamily: "var(--font-sans)",
            }}
          >
            기억하기
          </button>
          <button
            onClick={handleDefer}
            style={{
              flex: 0, padding: "13px 20px",
              background: "transparent",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-secondary)",
              fontSize: "var(--text-sm)",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
            }}
          >
            다음에
          </button>
        </div>

        {/* 프라이버시 안내 — PERSONALIZATION §4-1 필수 문구 */}
        <p style={{
          fontSize: 11,
          color: "var(--text-tertiary)",
          lineHeight: 1.6,
          textAlign: "center",
        }}>
          이 정보는 이 브라우저에만 저장됩니다. 서버로 전송하지 않습니다.
        </p>
      </div>
    </div>
  );
}
