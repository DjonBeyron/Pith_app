import { APP_VERSION } from './version.js'

// Лог входа/регистрации/капчи. Собирается ВСЕГДА, без флага дебага, и доступен
// разлогиненному человеку кнопкой прямо в окне входа (AuthLogButton.jsx).
//
// Зачем отдельно от debug.js: тот включается кнопкой «Активировать дебаг» в
// профиле, а в профиль без входа не попасть — то есть ровно в том случае, когда
// лог и нужен, его нет. Плюс на телефоне консоли не открыть, а разбирать отказы
// капчи приходится именно там.
//
// Что попадает в лог: события `[captcha]` из useCaptcha.js и `[auth]` из
// shared/api/auth.js — код ошибки Turnstile и дословный ответ Supabase. По ним
// сразу видно, какое из двух: токена не было (виджет не поднялся) или токен
// был и сервер его отклонил.
const MAX_LINES = 150
const lines = []

function stamp() {
  const d = new Date()
  return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

function toText(arg) {
  if (typeof arg === 'string') return arg
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`
  try {
    return JSON.stringify(arg)
  } catch {
    return String(arg)
  }
}

// Пишет и в консоль (как раньше), и в буфер под кнопку «Скачать лог».
// Префикс (`[captcha]`, `[auth]`) передаёт вызывающий — он же виден в консоли
export function alog(...args) {
  console.log(...args)
  lines.push(`[${stamp()}] ${args.map(toText).join(' ')}`)
  if (lines.length > MAX_LINES) lines.shift()
}

// Ошибка Supabase в одну строку: code и message важнее всего — именно в
// message лежит причина от Cloudflare (`invalid-input-response`,
// `no captcha_token found`, `timeout-or-duplicate`)
export function describeAuthError(error) {
  if (!error) return 'успех'
  const parts = [error.code, error.status, error.message].filter(Boolean)
  return parts.join(' | ')
}

function envBlock() {
  const nav = typeof navigator === 'undefined' ? null : navigator
  const standalone = typeof matchMedia === 'function'
    && matchMedia('(display-mode: standalone)').matches
  return [
    `версия:   ${APP_VERSION}`,
    `время:    ${new Date().toString()}`,
    `адрес:    ${location.origin}`,
    `site key: ${import.meta.env.VITE_TURNSTILE_SITE_KEY || '(не задан — капча выключена)'}`,
    `supabase: ${(import.meta.env.VITE_SUPABASE_URL || '').replace('https://', '')}`,
    `браузер:  ${nav?.userAgent ?? '?'}`,
    `язык:     ${nav?.language ?? '?'}, сеть: ${nav?.onLine === false ? 'офлайн' : 'онлайн'}`,
    `PWA:      ${standalone ? 'да (установлено на экран)' : 'нет (обычная вкладка)'}`,
  ].join('\n')
}

export function authLogText() {
  const body = lines.length
    ? lines.join('\n')
    : '(пусто — нажми «Войти», дождись ответа и собери лог заново)'
  return `--- HETA: лог входа ---\n${envBlock()}\n\n--- события ---\n${body}\n`
}

export function downloadAuthLog() {
  const url = URL.createObjectURL(new Blob([authLogText()], { type: 'text/plain' }))
  const ts  = new Date().toISOString().replace(/[:.]/g, '-')
  const a   = document.createElement('a')
  a.href     = url
  a.download = `pithy-login-${ts}.txt`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
