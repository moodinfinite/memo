import { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import styles from './AuthPage.module.css'

export default function SignupPage() {
  const { signup, isLoading, error, clearError } = useAuthStore()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    await signup(name, email, password)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.logo}>Memo</div>
        <h1 className={styles.title}>Create your account</h1>
        <p className={styles.sub}>Start studying smarter</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && (
            <div className={styles.error} onClick={clearError}>
              {error}
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label}>Full name</label>
            <input
              className={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex Johnson"
              required
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Work email</label>
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Password</label>
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              minLength={8}
              required
            />
          </div>

          <button className={styles.submit} type="submit" disabled={isLoading}>
            {isLoading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className={styles.footer}>
          Already have an account? <Link to="/login" className={styles.link}>Sign in</Link>
        </p>
      </div>
    </div>
  )
}
