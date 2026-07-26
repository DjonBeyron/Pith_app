import { useCallback, useEffect, useRef, useState } from 'react'

// Капча Cloudflare Turnstile перед входом/регистрацией — главный барьер против
// перебора пароля (локальный тормоз в loginThrottle.js обходится очисткой
// localStorage, капчу так не обойти: токен проверяет сам Supabase).
//
// Выключена, пока не задан VITE_TURNSTILE_SITE_KEY: без ключа хук ничего не
// грузит и не рисует, формы работают как раньше. Порядок включения — в
// PROJECT.md, раздел «Защита входа».
//
// Виджет НЕ рисуется при открытии формы: он поднимается только когда человек
// нажал «Войти»/«Зарегистрироваться» — то есть через guard(). Так убрана
// ситуация, когда форма молча требует «подтверди, что ты не робот», а самой
// капчи на экране нет (виджет не успевал нарисоваться, если форма открывалась
// не сразу — например переходом из ленты по тапу на лайк).
//
// Виджет НЕ запирает вход. Сломался (нет связи с Cloudflare, код ошибки) —
// пробуем поднять заново до MAX_AUTO_RETRIES раз, потом пускаем без токена и
// оставляем человеку кнопку «Повторить». Настоящая проверка всё равно на
// сервере: при включённой капче Supabase сам отобьёт запрос.
//
// Но если капча ЖИВА и просит галочку (before-interactive-callback) — ждём
// человека сколько нужно и таймаут не применяем. Иначе получалось так: через
// 12 секунд форма уходила на сервер без токена, ловила «captcha protection:
// request disallowed», а галочка в этот момент как раз загоралась зелёным.
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? ''
export const captchaEnabled = !!SITE_KEY

// Сколько ждём токен у живого виджета, прежде чем перестать держать форму.
// Виджет при этом остаётся на экране: решит человек позже — токен подхватится
const SOLVE_TIMEOUT_MS = 12_000
// Пауза перед автоматической попыткой поднять сломавшийся виджет заново
const RETRY_DELAY_MS   = 1_500
const MAX_AUTO_RETRIES = 2

let scriptPromise = null
function loadTurnstile() {
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src   = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.onload  = resolve
    // Обнуляем промис: иначе повторная попытка получит тот же отказ навсегда
    s.onerror = () => { scriptPromise = null; reject(new Error('turnstile script failed')) }
    document.head.appendChild(s)
  })
  return scriptPromise
}

export function useCaptcha() {
  // Узел под виджет держим в состоянии, а не в ref: эффект должен ждать, пока
  // <div> реально появится в DOM (раньше при null-ref виджет не рисовался
  // вообще и хук молча зависал)
  const [box,      setBox]      = useState(null)
  const [active,   setActive]   = useState(false) // форма попросила токен
  const [token,    setToken]    = useState(null)
  const [failed,   setFailed]   = useState(false) // пускаем без капчи
  const [retrying, setRetrying] = useState(false)
  const [attempt,  setAttempt]  = useState(0)
  const [asking,   setAsking]   = useState(false) // виджет ждёт галочку
  const [pending,  setPending]  = useState(false) // форма ждёт токен
  const widgetRef  = useRef(null)
  const retryRef   = useRef(null)
  const pendingRef = useRef(null) // что выполнить, когда придёт токен

  useEffect(() => {
    if (!captchaEnabled || !active || !box) return
    let cancelled = false

    // Виджет не поднялся: нет сети, 600010, домен не разрешён в Cloudflare.
    // Чаще всего это разовый обрыв — пробуем заново с нуля
    const onBroken = code => {
      if (cancelled) return
      setToken(null)
      if (attempt < MAX_AUTO_RETRIES) {
        setRetrying(true)
        retryRef.current = setTimeout(() => setAttempt(a => a + 1), RETRY_DELAY_MS)
        return
      }
      console.warn('[captcha] не поднялась за', attempt + 1, 'попыток, код', code)
      setRetrying(false)
      setFailed(true)
    }

    loadTurnstile()
      .then(() => {
        if (cancelled || !window.turnstile) return
        setRetrying(false)
        widgetRef.current = window.turnstile.render(box, {
          sitekey: SITE_KEY,
          theme: 'dark',
          callback: t => {
            setRetrying(false)
            setAsking(false)
            setFailed(false)
            setToken(t)
          },
          'expired-callback': () => setToken(null),
          // Капча решила спросить человека (галочка «я не робот»). Значит
          // виджет жив — ждём человека сколько нужно, таймаут снимается:
          // отправить форму без токена сейчас = гарантированный отказ сервера
          'before-interactive-callback': () => setAsking(true),
          // Turnstile передаёт код: 110200 — домен не разрешён в настройках
          // виджета, 600010 — челлендж не смог выполниться, 300xxx — сбой
          'error-callback': onBroken,
        })
      })
      .catch(e => {
        console.warn('[captcha] скрипт не загрузился:', e?.message)
        onBroken('script')
      })

    return () => {
      cancelled = true
      clearTimeout(retryRef.current)
      if (widgetRef.current && window.turnstile) {
        window.turnstile.remove(widgetRef.current)
        widgetRef.current = null
      }
    }
  }, [active, box, attempt])

  // Форма ждёт токен, а виджет молчит: ни токена, ни ошибки, ни просьбы
  // поставить галочку. Считаем зависшим и отпускаем форму (решает сервер).
  // Пока капча просит галочку (asking) — ждём человека сколько угодно
  useEffect(() => {
    if (!pending || asking || token || failed) return
    const t = setTimeout(() => {
      console.warn('[captcha] тишина', SOLVE_TIMEOUT_MS / 1000, 'с — пускаем без капчи')
      setFailed(true)
    }, SOLVE_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [pending, asking, token, failed])

  // Пришёл токен (или стало ясно, что капчи не будет) — доводим отложенную
  // отправку формы до конца сами, повторно нажимать кнопку не нужно
  useEffect(() => {
    if (!pendingRef.current || (!token && !failed)) return
    const run = pendingRef.current
    pendingRef.current = null
    setPending(false)
    run(token)
  }, [token, failed])

  // Вызывать из обработчика отправки формы вместо прямой отправки: токен уже
  // есть или капча не поднялась — run выполнится сразу, иначе покажем виджет
  // и выполним run, как только он отдаст токен
  const guard = useCallback(run => {
    if (!captchaEnabled || token || failed) { run(token); return }
    pendingRef.current = run
    setPending(true)
    setActive(true)
  }, [token, failed])

  // Кнопка «Повторить» — поднять виджет заново, счётчик автопопыток с нуля
  const retry = useCallback(() => {
    clearTimeout(retryRef.current)
    setToken(null)
    setFailed(false)
    setRetrying(false)
    setAsking(false)
    setActive(true)
    setAttempt(a => a + 1)
  }, [])

  // После ошибки сервера токен уже сгорел — виджету нужен новый раунд.
  // failed тоже снимаем: иначе следующее нажатие кнопки ушло бы на сервер
  // сразу без токена и получило бы ту же ошибку по кругу
  const reset = useCallback(() => {
    setToken(null)
    setAsking(false)
    setFailed(false)
    if (widgetRef.current && window.turnstile) window.turnstile.reset(widgetRef.current)
  }, [])

  return {
    boxRef: setBox, enabled: captchaEnabled, active, token, failed, retrying, asking,
    waiting: pending, // форма ждёт токен: кнопка в «Проверка...»
    guard, retry, reset,
  }
}
