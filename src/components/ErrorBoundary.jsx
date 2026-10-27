import { Component } from "react";

/**
 * Top-level error boundary. If anything below it throws while rendering, show a short,
 * accessible fallback with a reload button instead of a blank page.
 * (Error boundaries must be class components; React has no hook equivalent.)
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Console only: this demo has no server or telemetry to report to.
    console.error("Unhandled error in the UI:", error, info?.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          margin: "auto",
          maxWidth: 480,
          padding: 32,
          textAlign: "center",
          color: "#f0f6fc",
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 12 }}>Something went wrong</h1>
        <p style={{ color: "#cbd5e1", marginBottom: 24 }}>
          The page hit an unexpected error. Reloading usually fixes it. This is a demo, so no data was lost.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            padding: "10px 20px",
            fontSize: 15,
            fontWeight: 600,
            fontFamily: "inherit",
            color: "#ffffff",
            background: "#2563eb",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          Reload page
        </button>
      </div>
    );
  }
}
