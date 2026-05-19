import { Component } from 'react'

/**
 * Catches render errors anywhere under the app tree (errors outside Route-level boundaries).
 */
export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[AppErrorBoundary] Uncaught error:', error)
    console.error('[AppErrorBoundary] Component stack:', info?.componentStack)
  }

  render() {
    if (this.state.error) {
      const msg = String(this.state.error?.message || this.state.error)
      return (
        <div className="min-h-dvh bg-white px-6 py-10 text-slate-900">
          <h1 className="text-xl font-bold text-red-700">Something went wrong</h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-600">
            Open the browser console for <code className="rounded bg-slate-100 px-1">[AppErrorBoundary]</code> details.
          </p>
          <pre className="mt-4 overflow-auto rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-900">{msg}</pre>
          <button
            type="button"
            className="mt-6 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
            onClick={() => window.location.assign('/')}
          >
            Go home
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
