import { Component } from "react";

// Without this, any render error anywhere unmounts the whole app and leaves a
// blank white screen with nothing to go on. This catches it, keeps the rest of
// the app usable, and — crucially — shows what actually broke and where, so a
// crash can be diagnosed from the screen instead of only from the console.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // Also log it, for anyone watching the console.
    // eslint-disable-next-line no-console
    console.error("App crashed:", error, info?.componentStack);
  }

  handleReset = () => this.setState({ error: null, info: null });

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{ padding: 24, maxWidth: 900, margin: "40px auto", fontFamily: "system-ui, sans-serif" }}>
        <div
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            borderRadius: 12,
            padding: 20,
          }}
        >
          <h1 style={{ color: "#b91c1c", fontSize: 20, margin: "0 0 8px", fontWeight: 700 }}>
            Something went wrong on this screen
          </h1>
          <p style={{ color: "#7f1d1d", fontSize: 14, margin: "0 0 12px" }}>
            The rest of the app still works — go back or reload. If this keeps
            happening, send a screenshot of the details below.
          </p>

          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: "#fff",
              border: "1px solid #fecaca",
              borderRadius: 8,
              padding: 12,
              fontSize: 12,
              color: "#991b1b",
              maxHeight: 260,
              overflow: "auto",
            }}
          >
            {String(error?.stack || error?.message || error)}
            {info?.componentStack ? `\n\nComponent stack:${info.componentStack}` : ""}
          </pre>

          <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#b91c1c", color: "#fff", fontWeight: 600, cursor: "pointer" }}
            >
              Reload
            </button>
            <button
              onClick={this.handleReset}
              style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, cursor: "pointer" }}
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
