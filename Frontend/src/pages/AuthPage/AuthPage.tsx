import { useState } from 'react'
import { login, signup } from '../../services/authservice'
import LoadingIndicator from '../../components/LoadingIndicator/LoadingIndicator'
import type { CurrentUser } from '../../types/auth'
import './AuthPage.css'

type AuthPageProps = {
  onAuthenticated: (user: CurrentUser) => void
  onBack: () => void
  initialMode?: 'login' | 'signup'
}

function AuthPage({ onAuthenticated, onBack, initialMode = 'login' }: AuthPageProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isSignup = initialMode === 'signup'
  const title = isSignup ? 'Create your account' : 'Welcome back'
  const buttonLabel = isSignup ? 'Sign up' : 'Log in'

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isSubmitting) {
      return
    }

    setError('')
    setIsSubmitting(true)

    try {
      const user = isSignup
        ? await signup({
            name,
            email,
            password,
          })
        : await login({
            email,
            password,
          })

      onAuthenticated(user)
    } catch {
      setError(
        isSignup
          ? 'Could not create your account. Please check the details and try again.'
          : 'Could not log in. Please check your email and password.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-title">
        <button className="auth-back" type="button" onClick={onBack} disabled={isSubmitting}>
          <span aria-hidden="true">&larr;</span> Back to intro
        </button>
        <div className="auth-brand">
          <span className="auth-mark" aria-hidden="true">
            S
          </span>
          <span>AI Study Notes Summarizer</span>
        </div>

        <h1 id="auth-title">{title}</h1>
        <p className="auth-copy">
          Your chats, uploaded files, and library stay attached to your account.
        </p>

        <form className="auth-form" onSubmit={handleSubmit} autoComplete="off">
          {isSignup && (
            <label>
              <span>Name</span>
              <input
                autoComplete="off"
                minLength={2}
                onChange={(event) => setName(event.target.value)}
                required
                type="text"
                value={name}
              />
            </label>
          )}

          <label>
            <span>Email</span>
            <input
              autoComplete="off"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>

          <label>
            <span>Password</span>
            <input
              autoComplete="off"
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          {error && <p className="auth-error">{error}</p>}

          <button className="auth-submit" disabled={isSubmitting} type="submit">
            {isSubmitting ? (
              <LoadingIndicator label="Please wait..." />
            ) : buttonLabel}
          </button>
        </form>
      </section>
    </main>
  )
}

export default AuthPage
