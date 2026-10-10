// Определение браузера для модуля «Сказать фразу»: Firefox (десктоп/Android — «Firefox/», iPhone/iPad — «FxiOS/») не умеет нужного распознавания речи,
// поэтому вместо работы модуля ученику показывается спокойное пояснение с выходом (sayPermission.decideMic → причина 'browser', SayBrowserNote.jsx).
// Чистая функция по строке User-Agent (тестируется без браузера) + обёртка над navigator. Другие браузеры без распознавания идут прежним путём ('unsupported').
export const isFirefoxUa = ua => /\bFirefox\/|\bFxiOS\//.test(String(ua ?? ''))

/** Текущий браузер — Firefox? (navigator недоступен или бросает — false: не блокируем зря) */
export function isFirefoxBrowser() {
  try { return typeof navigator !== 'undefined' && isFirefoxUa(navigator.userAgent) } catch { return false }
}
