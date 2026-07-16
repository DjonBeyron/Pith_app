import { useState } from 'react'
import { logoutUser } from '../../shared/api/auth.js'
import { clearProfileCache } from '../../shared/api/profileCache.js'

// Подтверждение выхода из аккаунта: открывается тапом по нику в профиле.
// Оверлей/карточка — тот же паттерн, что и в FreezeSheet (rwInfoOverlay /
// rwInfoCard, см. streak.css) — переиспользуем стили, а не дублируем их.
export default function LogoutSheet({ email, onClose }) {
  const [busy, setBusy] = useState(false)

  async function handleLogout() {
    if (busy) return
    setBusy(true)
    await logoutUser()
    // Иначе следующий вход другим пользователем мигнёт XP/ником прошлого
    clearProfileCache()
    setBusy(false)
    onClose()
  }

  return (
    <div className="rwInfoOverlay" onClick={onClose}>
      <div className="rwInfoCard" onClick={e => e.stopPropagation()}>
        <h3>Выйти из аккаунта?</h3>
        <p className="pvLogoutEmail">{email}</p>
        <button className="pvLogoutBtn" disabled={busy} onClick={handleLogout}>
          {busy ? 'Выход...' : 'Выйти из аккаунта'}
        </button>
        <button className="pvLogoutCancelBtn" disabled={busy} onClick={onClose}>
          Отмена
        </button>
      </div>
    </div>
  )
}
