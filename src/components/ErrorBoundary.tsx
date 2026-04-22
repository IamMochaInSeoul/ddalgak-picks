import { Component, ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: "100vh", background: "#0f0f13", color: "#f0f0f8",
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", padding: 24, fontFamily: "monospace",
        }}>
          <h2 style={{ color: "#ef4444", marginBottom: 16 }}>⚠️ 런타임 오류</h2>
          <pre style={{
            background: "#1a1a24", padding: 20, borderRadius: 8, fontSize: 12,
            maxWidth: 700, overflow: "auto", whiteSpace: "pre-wrap",
            border: "1px solid #ef4444",
          }}>
            {this.state.error.message}{"\n\n"}{this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
