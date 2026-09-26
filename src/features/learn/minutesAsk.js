// Вопрос «Сколько минут в день?» — один раз на устройстве, после первого
// пройденного урока (PROJECT.md → «Онбординг»). Схема модуля просит
// (askMinutesOnce), глобальный MinutesAsk в оболочке показывает шторку.
const FLAG = 'pithy_minutes_asked_v1'
const EVENT = 'pithy:ask-minutes'

export function askMinutesOnce() {
  try { if (localStorage.getItem(FLAG)) return } catch { return }
  window.dispatchEvent(new Event(EVENT))
}

export function markMinutesAsked() {
  try { localStorage.setItem(FLAG, '1') } catch { /* приватный режим — спросим ещё раз */ }
}

export function onMinutesAsk(fn) {
  window.addEventListener(EVENT, fn)
  return () => window.removeEventListener(EVENT, fn)
}
