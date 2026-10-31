import { useState } from 'react'
import { useStore } from '../store'
import { Field } from '../ui'

export default function Login() {
  const store = useStore()
  const [role, setRole] = useState('admin')
  const [mode, setMode] = useState(() => store.landlord ? 'login' : 'create')
  const [name, setName] = useState('')
  const [propertyName, setPropertyName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const switchRole = (nextRole) => {
    setRole(nextRole)
    setMode('login')
    setError('')
    setName('')
    setPropertyName('')
    setEmail('')
    setPhone('')
    setPassword('')
    setConfirmPassword('')
  }

  const switchMode = (nextMode) => {
    setMode(nextMode)
    setError('')
    setPassword('')
    setConfirmPassword('')
  }

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    if (mode === 'login') {
      const message = role === 'admin'
        ? await store.loginAdmin(email, password, rememberMe)
        : await store.loginTenant(email, password, rememberMe)
      setError(message)
      setSubmitting(false)
      return
    }

    if (password !== confirmPassword) {
      setError('Your passwords do not match.')
      setSubmitting(false)
      return
    }

    const message = role === 'admin'
      ? store.createAdminAccount({ name, propertyName, email, password })
      : store.createTenantAccount({ name, email, phone, password })
    setError(await message)
    setSubmitting(false)
  }

  const creating = mode === 'create'
  const roleName = role === 'admin' ? 'landlord' : 'boarder'
  const hasLandlord = Boolean(store.landlord)

  return (
    <main className="auth-page">
      <section className="auth-visual">
        <div className="auth-visual-inner">
          <div className="brand-lockup" aria-label="Affinity">
            <span className="brand-mark" aria-hidden="true">A</span>
            <span>affinity</span>
          </div>
          <div className="auth-message">
            <span className="eyebrow">A better way to feel at home</span>
            <h1>Good living<br />starts <em>together.</em></h1>
            <p>Everything your boarding house needs, thoughtfully brought into one place.</p>
          </div>
          <div className="auth-highlights" aria-label="Affinity features">
            <span><i aria-hidden="true">⌂</i> Rooms &amp; residents</span>
            <span><i aria-hidden="true">₱</i> Simple rent tracking</span>
            <span><i aria-hidden="true">↗</i> Repairs made easy</span>
          </div>
          <div className="visual-orbit orbit-one" aria-hidden="true" />
          <div className="visual-orbit orbit-two" aria-hidden="true" />
          <div className="visual-glow" aria-hidden="true" />
        </div>
        <footer className="auth-visual-footer">A more connected home, every day.</footer>
      </section>

      <section className="auth-main">
        <div className="auth-mobile-brand brand-lockup">
          <span className="brand-mark" aria-hidden="true">A</span>
          <span>affinity</span>
        </div>
        <div className="auth-content">
          <div className="auth-heading">
            <span className="eyebrow">WELCOME TO AFFINITY</span>
            <h2>{creating ? 'Make yourself at home.' : 'Welcome back.'}</h2>
            <p>{creating ? `Create your ${roleName} account to get started.` : 'Sign in to your boarding house workspace.'}</p>
          </div>

          <div className="auth-role-switch" aria-label="Choose account type">
            <button type="button" className={role === 'admin' ? 'active' : ''} onClick={() => switchRole('admin')}>
              Landlord
            </button>
            <button type="button" className={role === 'tenant' ? 'active' : ''} onClick={() => switchRole('tenant')}>
              Tenant / Boarder
            </button>
          </div>

          <form className="auth-form" onSubmit={submit}>
            {creating && (
              <>
                <Field label="Full name">
                  <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
                </Field>
                {role === 'admin' ? (
                  <Field label="Boarding house name">
                    <input value={propertyName} onChange={(event) => setPropertyName(event.target.value)} placeholder="e.g. The Garden House" required />
                  </Field>
                ) : (
                  <Field label="Phone number" hint="Optional — your landlord can use this to reach you.">
                    <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" />
                  </Field>
                )}
              </>
            )}
            <Field label="Email address">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </Field>
            <Field label="Password" hint={creating ? 'Use at least 8 characters.' : undefined}>
              <span className="password-wrap">
                <input
                  type={passwordVisible ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={creating ? 'new-password' : 'current-password'}
                  minLength={creating ? 8 : undefined}
                  required
                />
                <button type="button" className="password-toggle" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? 'Hide password' : 'Show password'}>
                  {passwordVisible ? 'Hide' : 'Show'}
                </button>
              </span>
            </Field>
            {!creating && <label className="remember-option"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} /> Keep me signed in for 7 days</label>}
            {creating && (
              <Field label="Confirm password">
                <span className="password-wrap">
                  <input
                    type={passwordVisible ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                  <button type="button" className="password-toggle" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? 'Hide password' : 'Show password'}>
                    {passwordVisible ? 'Hide' : 'Show'}
                  </button>
                </span>
              </Field>
            )}
            {error && <p className="error auth-error" role="alert">{error}</p>}
            <button className="btn btn-primary auth-submit" disabled={submitting}>
              {creating ? 'Create account' : 'Sign in'}
              <span aria-hidden="true">→</span>
            </button>
          </form>

          {role === 'admin' && !creating && !hasLandlord && (
            <p className="auth-note">No landlord account exists yet. Create one to set up your house.</p>
          )}
          {role === 'tenant' && creating && (
            <p className="auth-note">Already added by your landlord? Use the same email address to connect your boarder profile.</p>
          )}

          {(creating || role === 'tenant' || !hasLandlord) && (
            <p className="auth-switch">
              {creating ? 'Already have an account?' : 'New to Affinity?'}
              {' '}
              <button type="button" className="auth-link" onClick={() => switchMode(creating ? 'login' : 'create')}>
                {creating ? 'Sign in' : 'Create an account'}
              </button>
            </p>
          )}
          <p className="auth-footnote">Your workspace is securely saved to the boarding-house database.</p>
        </div>
      </section>
    </main>
  )
}
