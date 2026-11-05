// Попадания в ленте «Мини-игры 2.0» (чистые функции): окна времени и привязка услышанного слова к пилюле.
// Окно — число: вокруг интервала слова (startMs…endMs) ±win: «Ловлю» ±0,8 с, «По памяти» ±1 с. Или { from, to } — от startMs + from до startMs + to (мс): «Тень» и «Скорость» (SHADOW_WIN) — от момента, когда Пит произнёс слово, до +1,0 с,
// слово раньше голоса Пита не засчитывается (повторять надо ЗА Питом, с отставанием на полслова). Слово, услышанное Vosk, приходит с опозданием (черновик появляется, когда слово уже сказано),
// поэтому момент слова = момент прихода − HEARD_LAG_MS (тап по пилюле — без поправки).
import { normText } from '../player/modules/rotate-phone/wordLaneRecipe.js'

export const CATCH_WINDOW_MS = 800
export const SHADOW_WINDOW_MS = 1000
export const SHADOW_WIN = { from: 0, to: SHADOW_WINDOW_MS } // «Тень» и «Скорость»: окно [0; +1,0 с] от начала слова Пита
export const HEARD_LAG_MS = 200
export const LAG_WORDS = 2     // «Тень»: отстал, когда последнее засчитанное слово позади слова Пита на столько слов и больше
export const LAG_GRACE_MS = 400 // слово Пита считается «текущим» не сразу, а через столько мс после начала: полслова отставания — норма
export const STUCK_MS = 3000 // «застрял»: столько без единого слова — подсказка первого слова

/** Границы окна win пилюли p, мс: начало и конец (win — число ± вокруг слова или { from, to } от начала слова) */
export const winStart = (p, win) => (typeof win === 'number' ? p.startMs - win : p.startMs + win.from)
export const winEnd = (p, win) => (typeof win === 'number' ? p.endMs + win : p.startMs + win.to)
/** Сколько окно тянется после слова (для конца прохода ленты), мс */
export const winTail = win => (typeof win === 'number' ? win : win.to)

/** Момент t (мс) в окне win слова пилюли p */
export const inWindow = (p, t, win) => t >= winStart(p, win) && t <= winEnd(p, win)

/** Какой пилюле засчитать услышанное слово text в момент t: самая ранняя ещё не залитая с тем же словом, у которой момент t в окне; нет такой — −1 (лишнее слово, не в свой момент) */
export function creditWord(pills, filled, text, t, win) {
  const key = normText(text)
  const hit = pills.find(p => !filled.has(p.i) && normText(p.text) === key && inWindow(p, t, win))
  return hit ? hit.i : -1
}

/** Пилюли, чьё окно прошло, а слово так и не засчитано: их отмечают промахом (уже отмеченные — marked) */
export const expiredPills = (pills, filled, marked, t, win) => pills.filter(p => !filled.has(p.i) && !marked.has(p.i) && t > winEnd(p, win))

/** Застрял ли человек в «По памяти»: ни одного засчитанного слова, прошло STUCK_MS с начала первого слова и подсказка ещё не давалась */
export function isStuck({ t, firstStartMs, credited = 0, hinted = false }) {
  if (hinted || credited > 0) return false
  return t >= firstStartMs + STUCK_MS
}

/** Отстал ли человек в «Тени» / «Скорости»: текущее слово Пита (последнее, с начала которого прошло LAG_GRACE_MS) ушло от последнего засчитанного слова на LAG_WORDS и больше. Пилюли — со словами по порядку (p.i — номер слова) */
export function isLagging({ pills, filled, t }) {
  const cur = pills.filter(p => t >= p.startMs + LAG_GRACE_MS).reduce((m, p) => Math.max(m, p.i), -1)
  const last = [...filled].reduce((m, i) => Math.max(m, i), -1)
  return cur >= 0 && cur - last >= LAG_WORDS
}
