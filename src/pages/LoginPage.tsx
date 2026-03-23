import { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import styles from './AuthPage.module.css'

export default function LoginPage() {
  const { login, isLoading, error, clearError } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    await login(email, password)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.logo}>Memo</div>
        <h1 className={styles.title}>Welcome back</h1>
        <p className={styles.sub}>Sign in to your account</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && (
            <div className={styles.error} onClick={clearError}>
              {error}
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label}>Email</label>
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Password</label>
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button className={styles.submit} type="submit" disabled={isLoading}>
            {isLoading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className={styles.footer}>
          No account? <Link to="/signup" className={styles.link}>Create one</Link>
        </p>
      </div>
    </div>
  )
}
