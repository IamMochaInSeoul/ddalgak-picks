import { useStore } from "../lib/store";
import Landing from "./Landing";
import TypeSelect from "./TypeSelect";
import Upload from "./Upload";
import Analysis from "./Analysis";
import Gallery from "./Gallery";
import FeedbackMode from "./FeedbackMode";
import ErrorBoundary from "./ErrorBoundary";

export default function AppShell() {
  const step         = useStore((s) => s.step);
  const feedbackMode = useStore((s) => s.feedbackMode);
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <ErrorBoundary>
        {step === "landing"    && <Landing />}
        {step === "typeSelect" && <TypeSelect />}
        {step === "upload"     && <Upload />}
        {step === "analysis"   && <Analysis />}
        {step === "gallery"    && !feedbackMode && <Gallery />}
        {step === "gallery"    && feedbackMode  && <FeedbackMode />}
      </ErrorBoundary>
    </div>
  );
}
