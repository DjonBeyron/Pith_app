// Сессионный флаг «Не могу говорить» (sessionStorage, живёт до закрытия приложения). Отдельный крошечный файл без импортов:
// его читают и модуль «Сказать фразу» (sayPermission.js), и плеер (пропуск пары сообщений вокруг say_phrase —
// player/sayPairSkip.js, useGraphPlayer.js), не таща за собой код распознавания речи в основной чанк.
export const CANT_SPEAK_KEY = 'pithy_cant_speak_session'

const store = () => { try { return globalThis.sessionStorage ?? null } catch { return null } }

export function isCantSpeakSession() {
  try { return store()?.getItem(CANT_SPEAK_KEY) === '1' } catch { return false }
}

export function setCantSpeakSession(on) {
  try { if (on) store()?.setItem(CANT_SPEAK_KEY, '1'); else store()?.removeItem(CANT_SPEAK_KEY) } catch { /* приватный режим — живёт до перезагрузки */ }
}
