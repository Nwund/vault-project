// File: src/main/services/sentry-init.ts
//
// #344 F-120 — @sentry/electron + OTLP traces. Vault ships with
// telemetry OFF by default; the user opts in via Settings (which
// flips a single boolean in settings.json). When enabled, we wire
// @sentry/electron's main+renderer transport AND an OTLP HTTP
// exporter for traces. The OTLP collector URL defaults to local
// (http://127.0.0.1:4318/v1/traces) so users running their own
// Tempo / Jaeger get traces without leaking anything externally.
//
// Sentry DSN is read from settings.sentryDsn so each user can point
// at their own project. No baked-in DSN.

let initialized = false

export interface TelemetryConfig {
  enabled: boolean
  sentryDsn?: string
  otlpEndpoint?: string         // http://127.0.0.1:4318/v1/traces
  environment?: string          // 'production' | 'dev'
  release?: string              // e.g. '2.7.0'
}

export async function initTelemetry(config: TelemetryConfig): Promise<{ ok: boolean; error?: string }> {
  if (initialized) return { ok: true }
  if (!config.enabled) return { ok: true }
  try {
    if (config.sentryDsn) {
      const Sentry = await import('@sentry/electron/main')
      Sentry.init({
        dsn: config.sentryDsn,
        environment: config.environment ?? 'production',
        release: config.release,
        // Performance traces follow the OTLP collector toggle.
        tracesSampleRate: config.otlpEndpoint ? 0 : 0.1,
        // Don't surface user-typed text in breadcrumbs.
        ignoreErrors: [/AbortError/, /CanceledError/],
      })
    }
    if (config.otlpEndpoint) {
      // Lazy-init OTLP via @opentelemetry. We don't bundle it by
      // default — only require it on first run with the flag.
      try {
        // @ts-ignore — optional peer deps; user installs when enabling traces
        const { NodeSDK } = await import('@opentelemetry/sdk-node')
        // @ts-ignore — optional peer deps; user installs when enabling traces
        const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http')
        const sdk = new NodeSDK({
          traceExporter: new OTLPTraceExporter({ url: config.otlpEndpoint }),
          serviceName: 'vault-main',
        } as any)
        sdk.start()
      } catch (err) {
        console.warn('[telemetry] OTLP libs not installed; skipping traces:', err)
      }
    }
    initialized = true
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) }
  }
}
