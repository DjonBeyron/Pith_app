import { useEffect, useRef, useState } from 'react'

// Капча Cloudflare Turnstile перед входом/регистрацией — главный барьер против
// перебора пароля (локальный тормоз в loginThrottle.js обходится очисткой
// localStorage, капчу так не обойти: токен проверяет сам Supabase).
//
// Выключена, пока не задан VITE_TURNSTILE_SITE_KEY: без ключа хук ничего не
// грузит и не рисует, формы работают как раньше. Порядок включения — в
// PROJECT.md, раздел «Защита входа».
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? ''
export const captchaEnabled = !!SITE_KEY

let scriptPromise = null
function loadTurnstile() {
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src   = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.onload  = resolve
    s.onerror = () => reject(new Error('turnstile script failed'))
    document.head.appendChild(s)
  })
  return scriptPromise
}

// { boxRef, token, reset, failed, enabled }
// boxRef вешается на пустой <div> — туда Turnstile рисует виджет.
export function useCaptcha() {
  const boxRef    = useRef(null)
  const widgetRef = useRef(null)
  const [token,  setToken]  = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!captchaEnabled) return
    let cancelled = false
    loadTurnstile()
      .then(() => {
        if (cancelled || !window.turnstile || !boxRef.current) return
        widgetRef.current = window.turnstile.render(boxRef.current, {
          sitekey: SITE_KEY,
          theme: 'dark',
          callback:           t => setToken(t),
          'expired-callback': () => setToken(null),
          'error-callback':   () => { setToken(null); setFailed(true) },
        })
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => {
      cancelled = true
      if (widgetRef.current && window.turnstile) {
        window.turnstile.remove(widgetRef.current)
        widgetRef.current = null
      }
    }
  }, [])

  // После неудачной попытки токен уже сгорел — виджету нужен новый раунд
  function reset() {
    setToken(null)
    if (widgetRef.current && window.turnstile) window.turnstile.reset(widgetRef.current)
  }

  return { boxRef, token, reset, failed, enabled: captchaEnabled }
}
