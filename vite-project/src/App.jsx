import './App.css'
import { Component } from 'react'
import { StoreProvider, useStore } from './store'
import Login from './pages/login'
import AdminDashboard from './pages/AdminDashboard'
import UserDashboard from './pages/UserDashboard'

class AppErrorBoundary extends Component {
  state = { crashed: false }

  static getDerivedStateFromError() {
    return { crashed: true }
  }

  componentDidCatch(error, info) {
    console.error('The app could not render this screen', error, info)
  }

  render() {
    if (this.state.crashed) {
      return (
        <main className="crash-screen">
          <section className="crash-card" role="alert">
            <h1>We hit a problem</h1>
            <p>Your screen could not be loaded. Reload the app to try again.</p>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload app</button>
          </section>
        </main>
      )
    }
    return this.props.children
  }
}

function Router() {
  const { session, ready } = useStore()
  if (!ready) return <main className="crash-screen"><p role="status">Connecting to your workspace…</p></main>
  if (!session) return <Login />
  if (session.role === 'admin') return <AdminDashboard />
  if (session.role === 'tenant') return <UserDashboard />
  return <Login />
}

function StoreFeedback() {
  const { apiError, dismissApiError } = useStore()
  return (
    <div className="store-feedback" aria-live="polite">
      {apiError && (
        <p className="feedback-banner feedback-error" role="alert">
          <span>{apiError}</span>
          <button className="feedback-dismiss" onClick={dismissApiError} aria-label="Dismiss server error">×</button>
        </p>
      )}
    </div>
  )
}

function AppContent() {
  return (
    <>
      <StoreFeedback />
      <Router />
    </>
  )
}

function App() {
  return (
    <AppErrorBoundary>
      <StoreProvider>
        <AppContent />
      </StoreProvider>
    </AppErrorBoundary>
  )
}

export default App