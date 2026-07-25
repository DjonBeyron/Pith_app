import { useState, useEffect } from 'react'
import { ShieldCheck } from 'lucide-react'
import { loginUser, logoutUser } from '../../shared/api/auth.js'
import { clearProfileCache, refreshProfile } from '../../shared/api/profileCache.js'
import { useAdmin } from '../../app/AdminContext.jsx'
import RegisterForm from './RegisterForm.jsx'
import { useCaptcha } from '../../shared/lib/useCaptcha.js'
import {
  getLoginLockSeconds, registerLoginFailure, clearLoginFailures, formatLockLeft,
} from '../../shared/lib/loginThrottle.js'

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
  const [, tick]                = useState(0) // тикает раз в секунду, пока идёт блокировка
  const {
    boxRef: captchaBoxRef, token: captchaToken,
    reset: resetCaptcha, failed: captchaFailed, enabled: captchaOn,
  } = useCaptcha()

  // Сколько ещё ждать после серии неудачных попыток (0 — можно пробовать)
  const lockLeft = getLoginLockSeconds(email)

  useEffect(() => {
    if (!lockLeft) return
    const t = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [lockLeft])

  async function handleLogin() {
    if (busy) return
    const left = getLoginLockSeconds(email)
    if (left) {
      setErr(`Слишком много попыток входа. Повтори через ${formatLockLeft(left)}`)
      tick(n => n + 1)
      return
    }
    if (captchaOn && !captchaToken) {
      setErr('Подтверди, что ты не робот')
      return
    }
    setErr('')
    setBusy(true)
    const { error } = await loginUser({
      email: email.trim(), password: password.trim(), captchaToken,
    })
    setBusy(false)
    if (error) {
      resetCaptcha() // токен капчи одноразовый — нужен новый раунд
      const secs = registerLoginFailure(email)
      setErr(secs
        ? `Слишком много попыток входа. Повтори через ${formatLockLeft(secs)}`
        : loginErrorToRu(error))
      return
    }
    clearLoginFailures(email)
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
          {isAdmin && <div className="authAdminBadge"><ShieldCheck size={13} /> Администратор</div>}
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
            {captchaOn && <div className="authCaptcha" ref={captchaBoxRef} />}
            {captchaOn && captchaFailed && (
              <div className="authError">Проверка «я не робот» не загрузилась — обнови страницу</div>
            )}
            {err && <div className="authError">{err}</div>}
            <button
              className="authBtnPrimary"
              onClick={handleLogin}
              disabled={busy || !!lockLeft || !email.trim() || !password.trim()}
            >
              {busy ? 'Вход...' : lockLeft ? `Подожди ${formatLockLeft(lockLeft)}` : 'Войти'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
