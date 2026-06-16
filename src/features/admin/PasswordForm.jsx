import { useState } from 'react'

export const ADMIN_AUTH_KEY = 'pithy_admin_auth'

export default function PasswordForm({ onOk }) {
  const [pwd, setPwd] = useState('')
  const [err, setErr] = useState('')

  function submit(e) {
    e.preventDefault()
    if (pwd === import.meta.env.VITE_ADMIN_PASSWORD) {
      sessionStorage.setItem(ADMIN_AUTH_KEY, '1')
      onOk()
    } else {
      setErr('Неверный пароль')
    }
  }

  return (
    <form className="passwordForm" onSubmit={submit}>
      <label htmlFor="adminPwd">Пароль администратора</label>
      <input
        id="adminPwd"
        type="password"
        value={pwd}
        onChange={e => setPwd(e.target.value)}
        autoFocus
      />
      <button type="submit">Войти</button>
      {err && <div className="errorText">{err}</div>}
    </form>
  )
}
