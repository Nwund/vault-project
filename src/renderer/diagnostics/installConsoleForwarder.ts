// File: src/renderer/diagnostics/installConsoleForwarder.ts
type Level = "info" | "warn" | "error";

export function installConsoleForwarder() {
  const wrap = (level: Level, fn: (...args: any[]) => void) => {
    return (...args: any[]) => {
      try {
        const message = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
        window.vaultDiagnostics?.log(level, message);
      } catch {
        // ignore
      }
      fn(...args);
    };
  };

  console.info = wrap("info", console.info.bind(console));
  console.warn = wrap("warn", console.warn.bind(console));
  console.error = wrap("error", console.error.bind(console));
}
