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
// Сломался виджет (нет связи с Cloudflare, код ошибки) — пробуем поднять
// заново до MAX_AUTO_RETRIES раз. Не вышло — форму НЕ отправляем: капча в
// Supabase включена, токен обязателен, и запрос без него гарантированно
// вернёт «captcha protection: request disallowed». Раньше в этом случае форма
// всё же уходила на сервер, и человек видел непонятную ошибку про вход вместо
// правды «проверка не работает». Теперь показываем код ошибки Turnstile и
// кнопку «Повторить», а следующее нажатие кнопки формы поднимает виджет заново.
//
// Если капча ЖИВА и просит галочку (before-interactive-callback) — ждём
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

// Лог капчи идёт в консоль всегда, не под флагом debug: разбирать её приходится
// на боевом сайте у живого человека, где дебаг не включён. Строк мало, только
// по нажатию кнопки — консоль не засоряют
const log = (...a) => console.log('[captcha]', ...a)

let scriptPromise = null
function loadTurnstile() {
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src   = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.onload  = () => { log('скрипт Turnstile загружен'); resolve() }
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
  const [failed,   setFailed]   = useState(false) // виджет не поднялся, отправка отменена
  const [retrying, setRetrying] = useState(false)
  const [attempt,  setAttempt]  = useState(0)     // автопопытки внутри одного раунда
  const [round,    setRound]    = useState(0)     // ручной перезапуск: счётчик автопопыток с нуля
  const [asking,   setAsking]   = useState(false) // виджет ждёт галочку
  const [pending,  setPending]  = useState(false) // форма ждёт токен
  const [code,     setCode]     = useState(null)  // код ошибки Turnstile для подсказки
  const widgetRef  = useRef(null)
  const retryRef   = useRef(null)
  const pendingRef = useRef(null) // что выполнить, когда придёт токен

  useEffect(() => {
    if (!captchaEnabled || !active || !box) return
    let cancelled = false

    // Виджет не поднялся: нет сети, 600010, домен не разрешён в Cloudflare.
    // Чаще всего это разовый обрыв — пробуем заново с нуля
    const onBroken = errCode => {
      if (cancelled) return
      setToken(null)
      setCode(errCode)
      // Виджет умер — галочки на экране больше нет. Без этого подсказка
      // продолжала врать «поставь галочку», а таймаут молчания оставался снят
      setAsking(false)
      if (attempt < MAX_AUTO_RETRIES) {
        log('ошибка виджета, код', errCode, '→ перезапуск через', RETRY_DELAY_MS / 1000, 'с')
        setRetrying(true)
        retryRef.current = setTimeout(() => setAttempt(a => a + 1), RETRY_DELAY_MS)
        return
      }
      console.warn('[captcha] не поднялась за', attempt + 1, 'попыток, код', errCode)
      setRetrying(false)
      setFailed(true)
    }

    loadTurnstile()
      .then(() => {
        if (cancelled || !window.turnstile) return
        log('рисую виджет, попытка', attempt + 1)
        setRetrying(false)
        widgetRef.current = window.turnstile.render(box, {
          sitekey: SITE_KEY,
          theme: 'dark',
          callback: t => {
            log('токен получен, длина', t?.length ?? 0)
            setRetrying(false)
            setAsking(false)
            setFailed(false)
            setToken(t)
          },
          'expired-callback': () => { log('токен просрочен'); setToken(null) },
          // Капча решила спросить человека (галочка «я не робот»). Значит
          // виджет жив — ждём человека сколько нужно, таймаут снимается:
          // отправить форму без токена сейчас = гарантированный отказ сервера
          'before-interactive-callback': () => {
            log('просит галочку — таймаут снят, ждём человека')
            setAsking(true)
          },
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
  }, [active, box, attempt, round])

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

  // Пришёл токен — доводим отложенную отправку формы до конца сами, повторно
  // нажимать кнопку не нужно. Капча не поднялась — отложенную отправку
  // отменяем: без токена сервер всё равно откажет, а человек получит
  // невнятную ошибку вместо честного «проверка не работает»
  useEffect(() => {
    if (!pendingRef.current || (!token && !failed)) return
    const run = pendingRef.current
    pendingRef.current = null
    setPending(false)
    if (!token) { log('капча не поднялась — форму не отправляю, жду «Повторить»'); return }
    log(`отправляю форму, токен есть (${token.length})`)
    run(token)
  }, [token, failed])

  // Вызывать из обработчика отправки формы вместо прямой отправки: токен уже
  // есть или капча не поднялась — run выполнится сразу, иначе покажем виджет
  // и выполним run, как только он отдаст токен
  const guard = useCallback(run => {
    if (!captchaEnabled) { log('капча выключена (нет VITE_TURNSTILE_SITE_KEY)'); run(null); return }
    if (token) { log('токен уже есть — отправляю сразу'); run(token); return }
    pendingRef.current = run
    setPending(true)
    setActive(true)
    // Прошлый раунд сломался: не шлём форму без токена (сервер откажет), а
    // поднимаем виджет заново — счётчик автопопыток начинается с нуля
    if (failed) {
      log('прошлый раунд не удался — поднимаю виджет заново')
      setFailed(false)
      setCode(null)
      setAttempt(0)
      setRound(r => r + 1)
      return
    }
    log('нажата кнопка — поднимаю виджет и жду токен')
  }, [token, failed])

  // Кнопка «Повторить» — поднять виджет заново, счётчик автопопыток с нуля
  const retry = useCallback(() => {
    log('ручной повтор — поднимаю виджет заново')
    clearTimeout(retryRef.current)
    setToken(null)
    setFailed(false)
    setRetrying(false)
    setAsking(false)
    setActive(true)
    setCode(null)
    setAttempt(0)
    setRound(r => r + 1)
  }, [])

  // После ошибки сервера токен уже сгорел — виджету нужен новый раунд.
  // failed тоже снимаем: иначе следующее нажатие кнопки ушло бы на сервер
  // сразу без токена и получило бы ту же ошибку по кругу
  const reset = useCallback(() => {
    log('сброс после ответа сервера — новый раунд капчи')
    setToken(null)
    setAsking(false)
    setFailed(false)
    if (widgetRef.current && window.turnstile) window.turnstile.reset(widgetRef.current)
  }, [])

  return {
    boxRef: setBox, enabled: captchaEnabled, active, token, failed, retrying, asking,
    code,             // код ошибки Turnstile: показываем в подсказке
    waiting: pending, // форма ждёт токен: кнопка в «Проверка...»
    guard, retry, reset,
  }
}
