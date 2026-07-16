import { useState } from 'react'
import { registerUser } from '../../shared/api/auth.js'
import { refreshProfile } from '../../shared/api/profileCache.js'
import { supabaseErrorToRu } from '../../shared/lib/authErrorsRu.js'
import RegistrationConsent from '../../shared/ui/RegistrationConsent.jsx'

export default function RegisterForm({ onLoginSuccess }) {
  const [email,    setEmail]    = useState('')
  const [name,     setName]     = useState('')
  const [password, setPassword] = useState('')
  const [err,      setErr]      = useState('')
  const [busy,     setBusy]     = useState(false)
  const [showConsent, setShowConsent] = useState(false)

  const canSubmit = email.trim() && name.trim() && password.trim() && !busy

  function handleSubmit() {
    if (!canSubmit) return
    setErr('')
    setShowConsent(true)
  }

  async function handleConsentAccept() {
    setShowConsent(false)
    setBusy(true)
    const { data, error } = await registerUser({
      email:    email.trim(),
      password: password.trim(),
      name:     name.trim(),
    })
    if (error) {
      setErr(supabaseErrorToRu(error))
      setBusy(false)
      return
    }
    // signUp по уже занятому email возвращает user без identities — это «уже есть»
    if (data?.user?.identities?.length === 0) {
      setErr('Пользователь с таким email уже существует')
      setBusy(false)
      return
    }
    refreshProfile() // прогреваем кэш профиля фоном — «Профиль» откроется без мигания
    setBusy(false)
    onLoginSuccess?.()
  }

  function handleKey(e) {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <>
      {showConsent && (
        <RegistrationConsent
          policyText=""
          onAccept={handleConsentAccept}
          onClose={() => setShowConsent(false)}
        />
      )}
      <div className="authTitle">Регистрация</div>
      <div className="authSubtitle">Создай аккаунт Pithy — прогресс сохранится</div>
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
        type="text"
        placeholder="Имя"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={handleKey}
        disabled={busy}
        autoComplete="given-name"
      />
      <input
        className="authInput"
        type="password"
        placeholder="Пароль (минимум 6 символов)"
        value={password}
        onChange={e => setPassword(e.target.value)}
        onKeyDown={handleKey}
        disabled={busy}
        autoComplete="new-password"
      />
      {err && <div className="authError">{err}</div>}
      <button className="authBtnPrimary" onClick={handleSubmit} disabled={!canSubmit}>
        {busy ? 'Регистрация...' : 'Зарегистрироваться'}
      </button>
    </>
  )
}
