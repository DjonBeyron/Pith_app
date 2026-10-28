// «Когда тебе удобно учиться?» (PLAN_NEW_USER.md → C2): чистые функции — пресеты, тексты
// подтверждения, ветка уведомлений, флаг «уже спрашивали». Без сети и без графики; тест — remindAsk.test.js.
export const PRESETS = [[9, 0], [14, 0], [20, 0]]

const FLAG = 'pithy_remind_asked_v1'
const pad = n => String(n).padStart(2, '0')

// Время для людей: «20:00», «7:40» (часы без нуля впереди)
export const fmtTime = ({ hh, mm }) => `${hh}:${pad(mm)}`

// Когда придёт ближайшее напоминание: время ещё впереди сегодня — «Сегодня в …», иначе «Завтра в …»
export function nextRemindLabel({ hh, mm }, now = new Date()) {
  const ahead = hh * 60 + mm > now.getHours() * 60 + now.getMinutes()
  return `${ahead ? 'Сегодня' : 'Завтра'} в ${fmtTime({ hh, mm })}`
}

// Подтверждение после выбора. sel: { hh, mm, enabled } (enabled=false — «Не нужно»).
// needsTz — сервер ещё не знает пояс: точный день не обещаем. guest — пушей гостю нет, обещаем «после входа»
export function confirmText(sel, { now = new Date(), needsTz = false, guest = false } = {}) {
  if (!sel || !sel.enabled) return 'Хорошо. Не буду писать — загляни, когда захочешь'
  if (guest) return `Готово. Запомнил время ${fmtTime(sel)} — напомню, когда войдёшь в аккаунт`
  if (needsTz) return `Готово. Я напомню в ${fmtTime(sel)} по твоему времени`
  return `Готово. ${nextRemindLabel(sel, now)} придёт одно уведомление про слово`
}

// Строка под полем «Своё время»: сверить с часами телефона (местное время устройства)
export const deviceClock = (now = new Date()) =>
  `по твоим часам сейчас ${pad(now.getHours())}:${pad(now.getMinutes())}`

// Что делать с уведомлениями после выбора времени:
//  'ask' — можно просить разрешение (по тапу); 'add_home' — iPhone не с экрана «Домой», пушей там нет;
//  'granted' — уже включены; 'denied' — запрещены или браузер не умеет (не уговариваем);
//  'guest' — гость, подписка привязана к аккаунту (расширение к четырём основным значениям).
// permission: 'granted' | 'denied' | 'default' | 'unsupported'
export function pushBranch({ isIos, standalone, permission, guest = false }) {
  if (guest) return 'guest'
  if (permission === 'granted') return 'granted'
  if (permission === 'denied') return 'denied'
  if (isIos && !standalone) return 'add_home'
  return permission === 'unsupported' ? 'denied' : 'ask'
}

// Значение preset для события remind_time_set: '9' | '14' | '20' | 'custom' | 'none'
export function presetOf(sel, custom) {
  if (!sel.enabled) return 'none'
  const hit = PRESETS.find(([h, m]) => h === sel.hh && m === sel.mm)
  return hit && !custom ? String(hit[0]) : 'custom'
}

// Разбор значения <input type="time"> («20:05») → { hh, mm } | null
export function parseTime(v) {
  const m = /^(\d{1,2}):(\d{2})/.exec(v ?? '')
  if (!m) return null
  const hh = Number(m[1]), mm = Number(m[2])
  return hh < 24 && mm < 60 ? { hh, mm } : null
}

export function remindAsked() {
  try { return !!localStorage.getItem(FLAG) } catch { return true } // без хранилища лучше не спрашивать, чем спрашивать каждый раз
}

export function markRemindAsked() {
  try { localStorage.setItem(FLAG, '1') } catch { /* приватный режим */ }
}

// Строка для настроек: «Напоминание: 20:00» / «выключено» / «не выбрано»
export function remindRowText(cur) {
  if (!cur) return 'Напоминание: не выбрано'
  return cur.enabled ? `Напоминание: ${fmtTime(cur)}` : 'Напоминание: выключено'
}
