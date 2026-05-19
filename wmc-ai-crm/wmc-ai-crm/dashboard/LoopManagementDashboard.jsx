/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Loop Management Dashboard (React Component)  ║
 * ║                                                              ║
 * ║  A standalone React component that polls /api/loops every   ║
 * ║  30 seconds and renders the live control table.             ║
 * ║                                                              ║
 * ║  Usage with any React setup:                                 ║
 * ║    import LoopManagementDashboard from './dashboard/...';    ║
 * ║    <LoopManagementDashboard apiBase="http://localhost:3000"/> ║
 * ║                                                              ║
 * ║  Mount API in src/app.js:                                    ║
 * ║    app.use('/api/loops', require('../api/loopStatusApi'));    ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import React, { useState, useEffect, useCallback } from "react";

const STATUS_COLORS = {
  running: { bg: "#d1fae5", text: "#065f46", dot: "#10b981" },
  stopped: { bg: "#f3f4f6", text: "#374151", dot: "#9ca3af" },
  error:   { bg: "#fee2e2", text: "#991b1b", dot: "#ef4444" },
};

const LEVEL_COLORS = {
  info:  { bg: "#eff6ff", text: "#1e40af" },
  warn:  { bg: "#fffbeb", text: "#92400e" },
  error: { bg: "#fef2f2", text: "#991b1b" },
};

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.stopped;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 500,
      background: c.bg, color: c.text,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot,
        animation: status === "running" ? "pulse 2s infinite" : "none" }} />
      {status}
    </span>
  );
}

function ActionButton({ label, variant = "primary", onClick, disabled }) {
  const base = {
    padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer", border: "1px solid",
    opacity: disabled ? 0.4 : 1, transition: "opacity 0.15s",
  };
  const styles = {
    primary: { background: "#2563eb", color: "#fff", borderColor: "#2563eb" },
    ghost:   { background: "transparent", color: "#374151", borderColor: "#d1d5db" },
    danger:  { background: "transparent", color: "#dc2626", borderColor: "#dc2626" },
  };
  return (
    <button style={{ ...base, ...styles[variant] }} onClick={disabled ? undefined : onClick}>
      {label}
    </button>
  );
}

function LoopRow({ loop, onStart, onStop, onRestart, onViewLogs }) {
  const c = STATUS_COLORS[loop.status] || STATUS_COLORS.stopped;
  return (
    <tr style={{ borderBottom: "1px solid #f3f4f6",
      background: loop.status === "error" ? "#fff5f5" : "transparent" }}>
      <td style={{ padding: "12px 16px", fontWeight: 500 }}>{loop.name}</td>
      <td style={{ padding: "12px 16px" }}><StatusBadge status={loop.status} /></td>
      <td style={{ padding: "12px 16px", color: "#6b7280", fontSize: 13 }}>{loop.freqLabel}</td>
      <td style={{ padding: "12px 16px", color: "#6b7280", fontSize: 13, fontFamily: "monospace" }}>
        {loop.lastRun ? new Date(loop.lastRun).toLocaleTimeString() : "—"}
      </td>
      <td style={{ padding: "12px 16px", color: "#6b7280", fontSize: 13, fontFamily: "monospace" }}>
        {loop.nextRun ? new Date(loop.nextRun).toLocaleTimeString() : "—"}
      </td>
      <td style={{ padding: "12px 16px", textAlign: "center" }}>
        <span style={{ color: loop.errorCount > 0 ? "#dc2626" : "#6b7280", fontWeight: loop.errorCount > 0 ? 600 : 400 }}>
          {loop.errorCount}
        </span>
      </td>
      <td style={{ padding: "12px 16px", color: "#6b7280", fontSize: 12, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {loop.lastError || "—"}
      </td>
      <td style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <ActionButton label="Restart" onClick={() => onRestart(loop.id)} />
          {loop.status === "running"
            ? <ActionButton label="Stop"    variant="danger" onClick={() => onStop(loop.id)} />
            : <ActionButton label="Start"   variant="ghost"  onClick={() => onStart(loop.id)} />
          }
          <ActionButton label="Logs" variant="ghost" onClick={() => onViewLogs(loop.id)} />
        </div>
      </td>
    </tr>
  );
}

function LogsPanel({ loopId, apiBase, onClose }) {
  const [logs, setLogs] = useState([]);
  useEffect(() => {
    if (!loopId) return;
    fetch(`${apiBase}/api/loops/${loopId}/logs`)
      .then((r) => r.json())
      .then((d) => setLogs(d.logs || []))
      .catch(console.error);
  }, [loopId, apiBase]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: "#fff", width: "100%", maxHeight: "60vh", borderRadius: "12px 12px 0 0", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 600 }}>Logs — {loopId}</span>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, color: "#6b7280" }}>×</button>
        </div>
        <div style={{ overflow: "auto", padding: "16px 24px", fontFamily: "monospace", fontSize: 12 }}>
          {logs.length === 0 ? <p style={{ color: "#9ca3af" }}>No log entries found.</p> : logs.slice().reverse().map((l, i) => (
            <div key={i} style={{ marginBottom: 8, color: l.level === "error" ? "#dc2626" : l.level === "warn" ? "#d97706" : "#374151" }}>
              <span style={{ color: "#9ca3af" }}>{new Date(l.time).toLocaleTimeString()} </span>
              <span style={{ fontWeight: 600, textTransform: "uppercase", fontSize: 10 }}>[{l.level}] </span>
              {l.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LoopManagementDashboard({ apiBase = "http://localhost:3000" }) {
  const [data,      setData]      = useState(null);
  const [logsPanel, setLogsPanel] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error,     setError]     = useState(null);

  const refresh = useCallback(async () => {
    try {
      const res  = await fetch(`${apiBase}/api/loops`);
      const json = await res.json();
      setData(json);
      setLastUpdate(new Date());
      setError(null);
    } catch (e) {
      setError("Cannot connect to API. Make sure the server is running.");
    }
  }, [apiBase]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  async function action(id, type) {
    await fetch(`${apiBase}/api/loops/${id}/${type}`, { method: "POST" });
    setTimeout(refresh, 400); // refresh after action
  }

  const loops   = data?.loops   || [];
  const summary = data?.summary || {};
  const errorLoops = loops.filter((l) => l.status === "error");

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", maxWidth: 1100, margin: "0 auto", padding: 32, color: "#111827" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Loop Control Center</h1>
        <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>
          WMC AI CRM · All times local ·{" "}
          {lastUpdate ? `Last updated ${lastUpdate.toLocaleTimeString()}` : "Connecting…"}
        </p>
      </div>

      {/* Connection error */}
      {error && (
        <div style={{ padding: 12, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#991b1b", marginBottom: 24, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Running",     value: summary.running ?? "—", color: "#10b981" },
          { label: "Error",       value: summary.errored ?? "—", color: summary.errored > 0 ? "#ef4444" : "#10b981" },
          { label: "Stopped",     value: summary.stopped ?? "—", color: "#9ca3af" },
          { label: "Total Loops", value: summary.total   ?? "—", color: "#6366f1" },
        ].map((s) => (
          <div key={s.label} style={{ padding: 20, border: "1px solid #e5e7eb", borderRadius: 10 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Error callout */}
      {errorLoops.length > 0 && (
        <div style={{ padding: 12, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, marginBottom: 24, fontSize: 13, color: "#991b1b" }}>
          <strong>Attention:</strong>{" "}
          {errorLoops.map((l) => `${l.name}: ${l.lastError}`).join(" · ")}
        </div>
      )}

      {/* Loop table */}
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Loop Status</h2>
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", marginBottom: 32 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
              {["Loop", "Status", "Frequency", "Last Run", "Next Run", "Errors", "Last Error", "Actions"].map((h) => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loops.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>
                {error ? "Unable to load loops" : "Loading…"}
              </td></tr>
            ) : loops.map((loop) => (
              <LoopRow
                key={loop.id} loop={loop}
                onStart={(id)    => action(id, "start")}
                onStop={(id)     => action(id, "stop")}
                onRestart={(id)  => action(id, "restart")}
                onViewLogs={(id) => setLogsPanel(id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Logs panel */}
      {logsPanel && (
        <LogsPanel loopId={logsPanel} apiBase={apiBase} onClose={() => setLogsPanel(null)} />
      )}

      <p style={{ color: "#9ca3af", fontSize: 12 }}>Auto-refreshes every 30 seconds. Click Logs to view detailed loop history.</p>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        button:hover:not(:disabled) { opacity: 0.85 }
      `}</style>
    </div>
  );
}
