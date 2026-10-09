// Что умеет устройство для распознавания речи (проба «Голос»): синхронные признаки + разрешение микрофона.
// Ничего не запускает и микрофон не трогает: только читает возможности браузера.

export function getRecognitionCtor() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

export function isStandalone() {
  try {
    if (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) return true
  } catch { /* старый браузер без matchMedia */ }
  return typeof navigator !== 'undefined' && navigator.standalone === true
}

/** Короткий вид navigator.userAgent: платформа + браузер (полный UA — в отчёте) */
export function shortUa(ua) {
  const s = String(ua ?? '')
  const os = /iPhone|iPad|iPod/.test(s) ? 'iOS' : /Android/.test(s) ? 'Android' : /Mac OS X/.test(s) ? 'macOS' : /Windows/.test(s) ? 'Windows' : /Linux/.test(s) ? 'Linux' : '?'
  const ver = (s.match(/(?:OS|Android) (\d+[._]?\d*)/) || [])[1]
  const br = /CriOS/.test(s) ? 'Chrome (iOS)' : /FxiOS/.test(s) ? 'Firefox (iOS)' : /EdgA?\//.test(s) ? 'Edge' : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : 'другой'
  return `${os}${ver ? ' ' + ver.replace('_', '.') : ''}, ${br}`
}

export function getCapabilities() {
  const nav = typeof navigator !== 'undefined' ? navigator : {}
  const ctor = getRecognitionCtor()
  const standalone = isStandalone()
  return {
    recognition: !!ctor,
    ctorName: typeof window === 'undefined' ? null
      : window.SpeechRecognition ? 'SpeechRecognition' : window.webkitSpeechRecognition ? 'webkitSpeechRecognition' : null,
    standalone,
    mode: standalone ? 'pwa' : 'browser',
    ua: nav.userAgent || '',
    uaShort: shortUa(nav.userAgent),
    getUserMedia: !!(nav.mediaDevices && typeof nav.mediaDevices.getUserMedia === 'function'),
    secure: typeof window !== 'undefined' && window.isSecureContext === true,
    permissionsApi: !!(nav.permissions && typeof nav.permissions.query === 'function'),
  }
}

export const MODE_LABEL = { pwa: 'PWA (с экрана «Домой»)', browser: 'обычный браузер' }

/** granted | prompt | denied | unavailable (iOS Safari часто не поддерживает запрос 'microphone') */
export async function queryMicPermission() {
  try {
    if (!navigator.permissions || typeof navigator.permissions.query !== 'function') return 'unavailable'
    const st = await navigator.permissions.query({ name: 'microphone' })
    return st.state === 'granted' || st.state === 'prompt' || st.state === 'denied' ? st.state : 'unavailable'
  } catch {
    return 'unavailable'
  }
}

export const PERM_LABEL = {
  granted: 'разрешён (granted)', prompt: 'спросит (prompt)', denied: 'запрещён (denied)', unavailable: 'недоступно',
}

// Коды recognition.onerror → понятное пояснение. silence / no-start / timeout — наши собственные таймеры
export const ERROR_HELP = {
  'not-allowed': 'Микрофон запрещён: в диалоге нажали «Не разрешать» или доступ закрыт в настройках браузера/приложения.',
  'service-not-allowed': 'Службу распознавания речи не разрешили: на iPhone включите «Диктовку» (Настройки → Основные → Клавиатура) и Siri.',
  'no-speech': 'Речи не услышали: микрофон включился, но звука не было. Скажите фразу сразу после нажатия.',
  'audio-capture': 'Не удалось получить звук: микрофона нет или его занимает другое приложение.',
  network: 'Ошибка сети: распознавание идёт через сервер браузера, нужен интернет.',
  aborted: 'Распознавание прервано (остановили вручную или система забрала микрофон).',
  'language-not-supported': 'Этот язык распознавания устройством не поддерживается.',
  'bad-grammar': 'Ошибка грамматики распознавания.',
  silence: 'Не слышу речь: запись началась, но 8 секунд ничего не было слышно. Скажите фразу сразу после сигнала.',
  'no-start': 'Запись не началась за 30 секунд: ждали ответа в диалоге разрешения микрофона или браузер завис.',
  timeout: 'Старый код: за 8 секунд не пришло ни одного результата (в журнале старых версий).',
  'start-failed': 'Не удалось запустить распознавание (браузер отказал сразу при старте).',
}

export function errorHelp(code) {
  return ERROR_HELP[code] || 'Неизвестная ошибка распознавания.'
}

export function capsReportLines(caps, perm) {
  return [
    `Распознавание речи: ${caps.recognition ? 'есть (' + caps.ctorName + ')' : 'НЕТ'}`,
    `Режим: ${MODE_LABEL[caps.mode]}`,
    `Разрешение микрофона: ${PERM_LABEL[perm] || perm || '…'}`,
    `getUserMedia: ${caps.getUserMedia ? 'есть' : 'нет'}`,
    `Безопасный контекст (https): ${caps.secure ? 'да' : 'нет'}`,
    `Платформа: ${caps.uaShort}`,
    `UserAgent: ${caps.ua}`,
  ]
}

export const EXAMPLES = [
  'I am trying to please both',
  "I don't know what to say",
  'She sells sea shells by the sea shore',
  'Could you tell me the way to the station',
  "I'm trying", // для экспериментов «против домысливания»: ученик может сказать «I'm try»
]
