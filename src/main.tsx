import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
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
