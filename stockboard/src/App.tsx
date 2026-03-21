import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import StockApp from './StockApp'
import AiRegressionPage from './pages/AiRegressionPage'
import './App.css'

type AuthMode = 'login' | 'signup'

type UserRecord = {
  name: string
  email: string
}

const SESSION_KEY = 'stockboard_session_v1'
// Use Vite's built-in `/api` proxy by default (avoids CORS issues).
const API_BASE_URL = import.meta.env.VITE_API_URL ?? ''
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
// Minimum 8 chars with uppercase, lowercase, number and special character.
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/

function isValidEmail(email: string) {
  return EMAIL_REGEX.test(email)
}

function isValidPassword(password: string) {
  return PASSWORD_REGEX.test(password)
}

async function apiRequest<T>(path: string, body: Record<string, string>): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.message || 'Request failed.')
  }
  return payload as T
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.email !== 'string' || typeof parsed.name !== 'string') return null
    return { email: parsed.email as string, name: parsed.name as string }
  } catch {
    return null
  }
}

function setSession(session: { email: string; name: string } | null) {
  if (!session) {
    localStorage.removeItem(SESSION_KEY)
    return
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export default function App() {
  const [mode, setMode] = useState<AuthMode>('login')
  const [authError, setAuthError] = useState('')
  const [authSuccess, setAuthSuccess] = useState('')
  const [loggedIn, setLoggedIn] = useState(() => loadSession())

  const [signupName, setSignupName] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupConfirm, setSignupConfirm] = useState('')

  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  const title = useMemo(() => (mode === 'login' ? 'Welcome Back' : 'Create Account'), [mode])

  const onLoginSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setAuthError('')
    setAuthSuccess('')

    const email = loginEmail.trim().toLowerCase()
    const password = loginPassword

    if (!email || !password) {
      setAuthError('Email and password are required.')
      return
    }
    if (!isValidEmail(email)) {
      setAuthError('Please enter a valid email address.')
      return
    }
    if (!isValidPassword(password)) {
      setAuthError('Password must be at least 8 chars with uppercase, lowercase, number and special character.')
      return
    }

    setAuthLoading(true)
    try {
      const result = await apiRequest<{ user: UserRecord }>('/api/login', { email, password })
      const session = { email: result.user.email, name: result.user.name }
      setSession(session)
      setLoggedIn(session)
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Login failed.')
    } finally {
      setAuthLoading(false)
    }
  }

  const onSignupSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setAuthError('')
    setAuthSuccess('')

    const name = signupName.trim()
    const email = signupEmail.trim().toLowerCase()
    const password = signupPassword
    const confirm = signupConfirm

    if (!name || !email || !password || !confirm) {
      setAuthError('All fields are required.')
      return
    }

    if (!isValidEmail(email)) {
      setAuthError('Please enter a valid email address.')
      return
    }

    if (!isValidPassword(password)) {
      setAuthError('Password must be at least 8 chars with uppercase, lowercase, number and special character.')
      return
    }

    if (password !== confirm) {
      setAuthError('Passwords do not match.')
      return
    }

    setAuthLoading(true)
    try {
      await apiRequest<{ user: UserRecord }>('/api/signup', { name, email, password })
      setAuthSuccess('Signup successful. You can now log in.')
      setMode('login')
      setLoginEmail(email)
      setLoginPassword('')
      setSignupName('')
      setSignupEmail('')
      setSignupPassword('')
      setSignupConfirm('')
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Signup failed.')
    } finally {
      setAuthLoading(false)
    }
  }

  const onLogout = () => {
    setSession(null)
    setLoggedIn(null)
    setLoginPassword('')
  }

  if (loggedIn) {
    return (
      <Routes>
        <Route path="/" element={<StockApp onLogout={onLogout} userEmail={loggedIn.email} userName={loggedIn.name} />} />
        <Route path="/ai-regression" element={<AiRegressionPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  }

  return (
    <div className="authRoot">
      <div className="authCard">
        <div className="authBrand">
          <span className="brandDot" />
          <span>StockPulse</span>
        </div>
        <h1 className="authTitle">{title}</h1>
        <p className="authSubtitle">Simple demo auth for your stock trading dashboard.</p>

        <div className="authTabs">
          <button
            type="button"
            className={`authTab ${mode === 'login' ? 'authTabActive' : ''}`}
            data-testid="tab-login"
            onClick={() => {
              setMode('login')
              setAuthError('')
              setAuthSuccess('')
            }}
          >
            Login
          </button>
          <button
            type="button"
            className={`authTab ${mode === 'signup' ? 'authTabActive' : ''}`}
            data-testid="tab-signup"
            onClick={() => {
              setMode('signup')
              setAuthError('')
              setAuthSuccess('')
            }}
          >
            Signup
          </button>
        </div>

        {mode === 'login' ? (
          <form className="authForm" onSubmit={onLoginSubmit}>
            <label className="authField">
              <span>Email</span>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                data-testid="login-email"
                required
              />
            </label>
            <label className="authField">
              <span>Password</span>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Strong password"
                autoComplete="current-password"
                data-testid="login-password"
                required
              />
            </label>
            <button className="authPrimaryBtn" type="submit" disabled={authLoading} data-testid="login-submit">
              {authLoading ? 'Please wait...' : 'Login'}
            </button>
          </form>
        ) : (
          <form className="authForm" onSubmit={onSignupSubmit}>
            <label className="authField">
              <span>Full Name</span>
              <input
                type="text"
                value={signupName}
                onChange={(e) => setSignupName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
                data-testid="signup-name"
              />
            </label>
            <label className="authField">
              <span>Email</span>
              <input
                type="email"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                data-testid="signup-email"
                required
              />
            </label>
            <label className="authField">
              <span>Password</span>
              <input
                type="password"
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                placeholder="Min 8 chars, Aa1@"
                autoComplete="new-password"
                data-testid="signup-password"
                required
              />
            </label>
            <label className="authField">
              <span>Confirm Password</span>
              <input
                type="password"
                value={signupConfirm}
                onChange={(e) => setSignupConfirm(e.target.value)}
                placeholder="Re-enter password"
                autoComplete="new-password"
                data-testid="signup-confirm-password"
                required
              />
            </label>
            <button className="authPrimaryBtn" type="submit" disabled={authLoading} data-testid="signup-submit">
              {authLoading ? 'Please wait...' : 'Create Account'}
            </button>
          </form>
        )}

        {authError ? <div className="authMsg authMsgError">{authError}</div> : null}
        {authSuccess ? <div className="authMsg authMsgSuccess">{authSuccess}</div> : null}

        <p className="authHint">Accounts are persisted in SQLite through the local API server.</p>
      </div>
    </div>
  )
}
