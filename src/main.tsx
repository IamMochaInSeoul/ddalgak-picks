import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";   // 디자인 토큰 (globals.css보다 반드시 먼저)
import "./globals.css";
import AppShell from "./components/AppShell";
import ErrorBoundary from "./components/ErrorBoundary";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  </StrictMode>
);
