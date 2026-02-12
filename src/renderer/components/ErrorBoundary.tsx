// File: src/renderer/components/ErrorBoundary.tsx
// Error boundary component for catching and recovering from crashes

import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  pageName?: string
  /** If true, show a minimal "skipped" state instead of full error UI after skip */
  allowSkip?: boolean
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  skipped: boolean
  copied: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null, skipped: false, copied: false }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)
    this.setState({ errorInfo })
    this.props.onError?.(error, errorInfo)

    // Log to persistent error logger
    try {
      window.api?.logs?.log('error', 'ReactErrorBoundary', error.message, {
        componentStack: errorInfo.componentStack,
        stack: error.stack,
        pageName: this.props.pageName
      })
    } catch {
      // Ignore logging errors
    }
  }

  handleCopyError = async () => {
    const { error, errorInfo } = this.state
    const errorText = `
## Error Report

**Page:** ${this.props.pageName || 'Unknown'}
**Error:** ${error?.message || 'Unknown error'}
**Timestamp:** ${new Date().toISOString()}
**App Version:** 2.1.5

### Stack Trace
\`\`\`
${error?.stack || 'No stack trace'}
\`\`\`

### Component Stack
\`\`\`
${errorInfo?.componentStack || 'No component stack'}
\`\`\`
    `.trim()

    try {
      await navigator.clipboard.writeText(errorText)
      this.setState({ copied: true })
      setTimeout(() => this.setState({ copied: false }), 2000)
    } catch {
      console.error('Failed to copy error to clipboard')
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, skipped: false })
  }

  handleSkip = () => {
    this.setState({ skipped: true })
  }

  handleReportIssue = () => {
    const { error } = this.state
    const title = encodeURIComponent(`[Bug] ${this.props.pageName || 'App'} crashed: ${error?.message || 'Unknown error'}`)
    const url = `https://github.com/anthropics/claude-code/issues/new?title=${title}&labels=bug`
    window.open(url, '_blank')
  }

  render() {
    if (this.state.hasError) {
      // If skipped, show minimal placeholder
      if (this.state.skipped) {
        return (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center opacity-60">
            <div className="text-[var(--muted)] mb-4">
              {this.props.pageName || 'This section'} is temporarily unavailable
            </div>
            <button
              onClick={this.handleRetry}
              className="px-4 py-2 text-sm rounded-lg border border-[var(--border)] hover:bg-white/5 transition"
            >
              Try loading again
            </button>
          </div>
        )
      }

      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <div className="w-20 h-20 mb-6 rounded-2xl bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center border border-red-500/20">
            <span className="text-4xl">💥</span>
          </div>

          <h2 className="text-xl font-semibold mb-2">
            {this.props.pageName ? `${this.props.pageName} ran into a problem` : 'Something went wrong'}
          </h2>

          <p className="text-[var(--muted)] mb-6 max-w-md">
            Don't worry - your data is safe. This error has been logged automatically.
          </p>

          {this.state.error && (
            <div className="mb-6 p-4 rounded-xl bg-black/30 border border-red-500/20 max-w-lg w-full text-left">
              <div className="text-xs text-red-400/60 mb-1 uppercase tracking-wide font-medium">Error</div>
              <div className="text-sm font-mono text-red-300 break-all">
                {this.state.error.message}
              </div>
            </div>
          )}

          {/* Primary actions */}
          <div className="flex flex-wrap justify-center gap-3 mb-4">
            <button
              onClick={this.handleRetry}
              className="px-6 py-2.5 rounded-xl bg-[var(--primary)] text-white font-medium hover:opacity-90 transition flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Try Again
            </button>

            <button
              onClick={this.handleSkip}
              className="px-6 py-2.5 rounded-xl border border-[var(--border)] hover:bg-white/5 transition flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
              Skip
            </button>

            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 rounded-xl border border-[var(--border)] hover:bg-white/5 transition flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Reload App
            </button>
          </div>

          {/* Secondary actions */}
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={this.handleCopyError}
              className="px-4 py-2 text-sm rounded-lg border border-[var(--border)] hover:bg-white/5 transition flex items-center gap-2 text-[var(--muted)]"
              title="Copy error details for bug report"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {this.state.copied ? 'Copied!' : 'Copy Error'}
            </button>

            <button
              onClick={this.handleReportIssue}
              className="px-4 py-2 text-sm rounded-lg border border-[var(--border)] hover:bg-white/5 transition flex items-center gap-2 text-[var(--muted)]"
              title="Report this issue on GitHub"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              Report Issue
            </button>
          </div>

          {/* Tips section */}
          <div className="mt-8 text-xs text-[var(--muted)] max-w-sm">
            <div className="font-medium mb-1">Troubleshooting tips:</div>
            <ul className="list-disc list-inside text-left space-y-0.5 opacity-80">
              <li>Try clicking "Try Again" first</li>
              <li>If the problem persists, reload the app</li>
              <li>Check Settings → Data → Error Logs for details</li>
            </ul>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// Simple wrapper for functional component pages
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  pageName?: string
) {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary pageName={pageName}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    )
  }
}

export default ErrorBoundary
