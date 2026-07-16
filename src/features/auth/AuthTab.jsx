import { useState } from 'react'
import { loginUser, logoutUser } from '../../shared/api/auth.js'
import { clearProfileCache, refreshProfile } from '../../shared/api/profileCache.js'
import { useAdmin } from '../../app/AdminContext.jsx'
import RegisterForm from './RegisterForm.jsx'

function loginErrorToRu(error) {
  const msg = (error?.message ?? '').toLowerCase()
  if (msg.includes('invalid login') || msg.includes('invalid credentials') || msg.includes('email not confirmed'))
    return 'Неверный email или пароль'
  if (msg.includes('too many') || msg.includes('rate limit'))
    return 'Слишком много попыток — подожди немного'
  if (msg.includes('network') || msg.includes('fetch'))
    return 'Нет соединения с сервером'
  return `Ошибка: ${error?.message ?? 'неизвестная'}`
}

export default function AuthTab({ onLoginSuccess }) {
  const { user, isAdmin, loading } = useAdmin()
  const [mode,     setMode]     = useState('login') // 'login' | 'register'
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [err,      setErr]      = useState('')
  const [busy,     setBusy]     = useState(false)

  async function handleLogin() {
    if (busy) return
    setErr('')
    setBusy(true)
    const { error } = await loginUser({ email: email.trim(), password: password.trim() })
    setBusy(false)
    if (error) { setErr(loginErrorToRu(error)); return }
    refreshProfile() // прогреваем кэш профиля фоном — «Профиль» откроется без мигания
    onLoginSuccess?.()
  }

  async function handleLogout() {
    if (busy) return
    setBusy(true)
    await logoutUser()
    clearProfileCache() // иначе следующий экран «Профиль» мигнёт XP прошлого аккаунта
    setBusy(false)
  }

  function handleKey(e) {
    if (e.key === 'Enter') handleLogin()
  }

  if (loading) {
    return <div className="authPanel"><p className="authHint">Загрузка...</p></div>
  }

  if (user) {
    return (
      <div className="authPanel">
        <div className="authCard">
          <div className="authAvatar">{(user.email?.[0] ?? '?').toUpperCase()}</div>
          <div className="authEmail">{user.email}</div>
          {isAdmin && <div className="authAdminBadge">★ Администратор</div>}
          <div className="authHint">Вы вошли в аккаунт</div>
          <button className="authBtnSecondary" onClick={handleLogout} disabled={busy}>
            {busy ? 'Выход...' : 'Выйти из аккаунта'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="authPanel">
      <div className="authCard">
        <div className="authTabs">
          <button
            className={`authTabBtn${mode === 'login' ? ' authTabBtnActive' : ''}`}
            onClick={() => setMode('login')}
          >
            Войти
          </button>
          <button
            className={`authTabBtn${mode === 'register' ? ' authTabBtnActive' : ''}`}
            onClick={() => setMode('register')}
          >
            Зарегистрироваться
          </button>
        </div>
        {mode === 'register' ? (
          <RegisterForm onLoginSuccess={onLoginSuccess} />
        ) : (
          <>
            <div className="authTitle">Войти</div>
            <div className="authSubtitle">Введи email и пароль от аккаунта Pithy</div>
            <input
              className="authInput"
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={handleKey}
              disabled={busy}
              autoComplete="email"
            />
            <input
              className="authInput"
              type="password"
              placeholder="Пароль"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={handleKey}
              disabled={busy}
              autoComplete="current-password"
            />
            {err && <div className="authError">{err}</div>}
            <button
              className="authBtnPrimary"
              onClick={handleLogin}
              disabled={busy || !email.trim() || !password.trim()}
            >
              {busy ? 'Вход...' : 'Войти'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
