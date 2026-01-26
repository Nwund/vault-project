// File: src/renderer/components/ErrorBoundary.tsx
// Error boundary component for catching and recovering from crashes

import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  pageName?: string
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)
    this.setState({ errorInfo })
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <div className="w-16 h-16 mb-6 rounded-full bg-red-500/20 flex items-center justify-center">
            <span className="text-3xl">⚠️</span>
          </div>

          <h2 className="text-xl font-semibold mb-2">
            {this.props.pageName ? `${this.props.pageName} crashed` : 'Something went wrong'}
          </h2>

          <p className="text-[var(--muted)] mb-6 max-w-md">
            An unexpected error occurred. This has been logged and we'll look into it.
          </p>

          {this.state.error && (
            <div className="mb-6 p-4 rounded-xl bg-black/20 border border-[var(--border)] max-w-lg w-full">
              <div className="text-xs text-[var(--muted)] mb-1">Error details:</div>
              <div className="text-sm font-mono text-red-400 break-all">
                {this.state.error.message}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={this.handleRetry}
              className="px-6 py-2 rounded-xl bg-[var(--primary)] text-white font-medium hover:opacity-90 transition"
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 rounded-xl border border-[var(--border)] hover:bg-white/5 transition"
            >
              Reload App
            </button>
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
