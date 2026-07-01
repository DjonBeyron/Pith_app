import { useState, useEffect, useRef } from 'react'
import { registerUser } from '../../../../shared/api/auth.js'
import { syncLocalXpToServer } from '../../../../shared/api/profileApi.js'
import RegistrationConsent from './RegistrationConsent.jsx'

function supabaseErrorToRu(error) {
  const msg    = (error?.message ?? '').toLowerCase()
  const code   = error?.code ?? ''
  const status = error?.status ?? 0
  if (code === 'user_already_exists' || msg.includes('already registered') || msg.includes('already exists'))
    return { text: 'Пользователь с таким email уже существует', result: 'error' }
  if (msg.includes('invalid email') || msg.includes('unable to validate email'))
    return { text: 'Неверный формат email', result: 'error' }
  if (msg.includes('password') && (msg.includes('short') || msg.includes('characters') || msg.includes('6')))
    return { text: 'Пароль слишком короткий — минимум 6 символов', result: 'error' }
  if (msg.includes('password') && msg.includes('weak'))
    return { text: 'Пароль слишком простой — добавь цифры или символы', result: 'error' }
  if (msg.includes('rate limit') || msg.includes('too many'))
    return { text: 'Слишком много попыток — подожди немного', result: 'error' }
  if (status === 500)
    return { text: 'Ошибка сервера — попробуй позже', result: 'error' }
  if (msg.includes('network') || msg.includes('fetch'))
    return { text: 'Нет соединения с сервером — проверь интернет', result: 'error' }
  return { text: `Ошибка: ${error.message || 'неизвестная ошибка'}`, result: 'error' }
}

export default function RegistrationPanel({ node, onDone, onAnswered, onHeightChange }) {
  const [show, setShow]         = useState(false)
  const [email, setEmail]       = useState('')
  const [name, setName]         = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]     = useState(false)
  const [showConsent, setShowConsent] = useState(false)
  const panelRef = useRef(null)

  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    const h = panelRef.current?.offsetHeight ?? 0
    onHeightChange?.(h)
  })

  function handleSubmit() {
    if (loading) return
    const trimEmail = email.trim()
    const trimName  = name.trim()
    const trimPass  = password.trim()
    if (!trimEmail || !trimName || !trimPass) return
    setShowConsent(true)
  }

  async function handleConsentAccept() {
    setShowConsent(false)
    const trimEmail = email.trim()
    const trimName  = name.trim()
    const trimPass  = password.trim()

    setLoading(true)
    const { data, error } = await registerUser({ email: trimEmail, password: trimPass, name: trimName })

    if (error) {
      const bubble = supabaseErrorToRu(error)
      onAnswered?.(bubble.text, bubble.result)
      setLoading(false)
      return
    }

    const user = data?.user
    if (user?.identities?.length === 0) {
      onAnswered?.('Пользователь с таким email уже существует', 'error')
      setLoading(false)
      return
    }

    onAnswered?.('Вы успешно зарегистрированы! Проверьте почту для подтверждения', 'success')
    syncLocalXpToServer() // перенос локального XP в профиль
    setTimeout(() => setShow(false), 1200)
    setTimeout(() => onDone?.('reg_submit', { email: trimEmail, name: trimName, userId: user?.id }), 1200 + 420)
  }

  function handleCancel() {
    if (loading) return
    setTimeout(() => setShow(false), 300)
    setTimeout(() => onDone?.('reg_cancel', null), 300 + 420)
  }

  const canSubmit  = email.trim() && name.trim() && password.trim() && !loading
  const title      = node?.typeData?.registration?.title      ?? 'Регистрация'
  const policyText = node?.typeData?.registration?.policyText ?? ''

  return (
    <>
      {showConsent && (
        <RegistrationConsent
          policyText={policyText}
          onAccept={handleConsentAccept}
          onClose={() => setShowConsent(false)}
        />
      )}
      <div
        className="regPanelSpacer"
        style={{
          height: show ? (panelRef.current?.offsetHeight ?? 0) : 0,
          transition: show
            ? 'height 0.38s cubic-bezier(0.22, 1, 0.36, 1)'
            : 'height 0.28s cubic-bezier(0.4, 0, 1, 1)',
        }}
      />
      <div ref={panelRef} className={`regPanel${show ? ' regPanelVisible' : ''}`}>
        <div className="regPanelInner">
          <p className="regPanelTitle">{title}</p>
          <input
            className="regPanelInput"
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={loading}
            autoComplete="email"
          />
          <input
            className="regPanelInput"
            type="text"
            placeholder="Имя"
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={loading}
            autoComplete="given-name"
          />
          <input
            className="regPanelInput"
            type="password"
            placeholder="Пароль (минимум 6 символов)"
            value={password}
            onChange={e => setPassword(e.target.value)}
            disabled={loading}
            autoComplete="new-password"
          />
          <button className="regPanelBtnPrimary" onClick={handleSubmit} disabled={!canSubmit}>
            {loading ? 'Отправка...' : 'Зарегистрироваться'}
          </button>
          <button className="regPanelBtnCancel" onClick={handleCancel} disabled={loading}>
            Отмена
          </button>
        </div>
      </div>
    </>
  )
}
