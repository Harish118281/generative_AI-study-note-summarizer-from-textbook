import { useEffect, useState } from 'react'
import ChatPage from './pages/ChatPage/ChatPage'
import AuthPage from './pages/AuthPage/AuthPage'
import LandingPage from './pages/LandingPage/LandingPage'
import LoadingIndicator from './components/LoadingIndicator/LoadingIndicator'
import { getCurrentUser, logout } from './services/authservice'
import type { CurrentUser } from './types/auth'
import './App.css'

function App() {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [pageMode, setPageMode] = useState<'intro' | 'login' | 'signup'>('intro')

  useEffect(() => {
    let isMounted = true

    async function checkSession() {
      try {
        const currentUser = await getCurrentUser()

        if (isMounted) {
          setUser(currentUser)
        }
      } catch {
        if (isMounted) {
          setUser(null)
        }
      } finally {
        if (isMounted) {
          setIsCheckingSession(false)
        }
      }
    }

    void checkSession()

    return () => {
      isMounted = false
    }
  }, [])

  async function handleLogout() {
    setIsLoggingOut(true)
    try {
      await logout()
    } finally {
      setUser(null)
      setIsLoggingOut(false)
    }
  }

  if (isCheckingSession) {
    return (
      <div className="app-root">
        <div className="app-loading">
          <LoadingIndicator label="Loading your workspace..." />
        </div>
      </div>
    )
  }

  return (
    <div className={`app-root ${!user && pageMode === 'intro' ? 'app-root-public' : ''}`}>
      {user ? (
        <ChatPage user={user} isLoggingOut={isLoggingOut} onLogout={handleLogout} />
      ) : pageMode === 'intro' ? (
        <LandingPage
          onLogin={() => setPageMode('login')}
          onSignup={() => setPageMode('signup')}
        />
      ) : (
        <AuthPage
          initialMode={pageMode}
          onAuthenticated={setUser}
          onBack={() => setPageMode('intro')}
        />
      )}
    </div>
  )
}

export default App
