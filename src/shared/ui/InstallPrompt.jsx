import { useEffect, useState } from 'react'
import { useAuth } from '../lib/useAuth.js'
import { isStandalone, isMobile } from '../lib/pwaInstall.js'
import InstallSlides from './InstallSlides.jsx'

const DISMISS_KEY = 'pithy_install_dismissed'

// Решает, показывать ли попап установки автоматом при старте: только гостю,
// только на телефоне, только если не установлено, и не чаще одного раза за
// всё время (закрыл разок — флаг в localStorage, больше не покажется).
// Сама вёрстка слайдов (точные шаги под определённый браузер) —
// в InstallSlides.jsx (её же открывает вручную SettingsTab.jsx кнопкой
// «Как установить», без этих ограничений)
export default function InstallPrompt() {
  const { user, loading } = useAuth()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (loading || user) return
    if (!isMobile() || isStandalone()) return
    let dismissed = false
    try { dismissed = !!localStorage.getItem(DISMISS_KEY) } catch { /* приватный режим — покажем как обычно */ }
    if (dismissed) return
    // Небольшая пауза — даём beforeinstallprompt шанс прийти ДО того, как
    // InstallSlides снимет решение (real-кнопка вместо похода в меню)
    const t = setTimeout(() => setShow(true), 1200)
    return () => clearTimeout(t)
  }, [user, loading])

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* не критично */ }
    setShow(false)
  }

  if (!show) return null
  return <InstallSlides onClose={dismiss} />
}
