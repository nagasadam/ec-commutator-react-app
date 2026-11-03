import { Component } from 'react'

// Catches a page that fails to load or crashes, so the rest of the app (header, other pages) keeps working.
export default class ErrorBoundary extends Component {
  state = { err: null }
  static getDerivedStateFromError(err) {
    return { err }
  }
  componentDidCatch(err) {
    console.error(err)
  }
  render() {
    if (!this.state.err) return this.props.children
    const load = /loading|dynamically imported|import|chunk/i.test(String(this.state.err?.message || this.state.err))
    return (
      <div className="card errcard" role="alert">
        <h3>{load ? "This page couldn't load" : 'Something went wrong on this page'}</h3>
        <p className="muted">
          {load ? 'Check your internet connection. If the app was just updated, reload to get the new version.' : 'Your data is safe. Try again, or reload the app.'}
        </p>
        <div className="mgr-acts">
          <button type="button" className="btn" onClick={() => window.location.reload()}>Reload</button>
          {!load && <button type="button" className="btn ghost" onClick={() => this.setState({ err: null })}>Try again</button>}
        </div>
      </div>
    )
  }
}
