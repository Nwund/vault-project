import { useEffect, useMemo, useState } from "react";

type DiagnosticsEvent =
  | { t: number; level: "info" | "warn" | "error"; msg: string; data?: any }
  | { t: number; level: "perf"; msg: string; data: { name: string; ms: number } }
  | { t: number; level: "ipc"; msg: string; data: { channel: string; ms?: number } };

export function DiagnosticsOverlay() {
  const [open, setOpen] = useState(false);
  const [buffer, setBuffer] = useState<DiagnosticsEvent[]>([]);
  const enabled = true;

  useEffect(() => {
    const vd = (window as any).vaultDiagnostics;
    if (!vd) return;
    const hasSnapshot = typeof vd.getSnapshot === "function";
    const hasOnEvent = typeof vd.onEvent === "function";
    const hasOnToggle = typeof vd.onToggle === "function";

    if (hasSnapshot) {
      Promise.resolve(vd.getSnapshot())
        .then((r: any) => setBuffer(r?.buffer ?? []))
        .catch(() => {});
    }

    const offEv = hasOnEvent
      ? vd.onEvent((ev: any) => setBuffer((p: any[]) => [...p.slice(-399), ev]))
      : undefined;

    const offToggle = hasOnToggle ? vd.onToggle(() => setOpen((v: boolean) => !v)) : undefined;

    return () => {
      try {
        offEv?.();
      } catch {}
      try {
        offToggle?.();
      } catch {}
    };
  }, []);

  const summary = useMemo(() => {
    const last = buffer.slice(-1)[0];
    const lastMsg = last ? `${last.level.toUpperCase()}: ${last.msg}` : "No events";
    return { lastMsg };
  }, [buffer]);

  if (!enabled) return null;

  return (
    <div
      style={{
        position: "fixed",
        right: 12,
        bottom: 12,
        zIndex: 9999,
        fontFamily: "ui-sans-serif, system-ui, -apple-system",
      }}
    >
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          style={{
            borderRadius: 999,
            padding: "8px 12px",
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(0,0,0,0.55)",
            color: "white",
            backdropFilter: "blur(10px)",
            cursor: "pointer",
          }}
          title="Diagnostics"
        >
          ◦
        </button>
      ) : (
        <div
          style={{
            width: 420,
            maxHeight: 320,
            overflow: "hidden",
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(0,0,0,0.65)",
            color: "white",
            backdropFilter: "blur(12px)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
          }}
        >
          <div style={{ padding: 10, display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div style={{ fontSize: 12, opacity: 0.85, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {summary.lastMsg}
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{
                borderRadius: 999,
                padding: "6px 10px",
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.06)",
                color: "white",
                cursor: "pointer",
              }}
              title="Close"
            >
              ✕
            </button>
          </div>

          <div style={{ padding: 10, paddingTop: 0, maxHeight: 270, overflow: "auto" }}>
            {buffer.slice(-80).map((ev, idx) => (
              <div key={idx} style={{ fontSize: 12, opacity: 0.9, marginBottom: 6 }}>
                <span style={{ opacity: 0.6, marginRight: 8 }}>
                  {new Date(ev.t).toLocaleTimeString()}
                </span>
                <span style={{ fontWeight: 600, marginRight: 8 }}>{ev.level}</span>
                <span>{ev.msg}</span>
              </div>
            ))}
            {buffer.length === 0 && (
              <div style={{ fontSize: 12, opacity: 0.7 }}>No diagnostics events yet.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}