// Попадания в ленте «Мини-игры 2.0» (чистые функции): окна времени и привязка услышанного слова к пилюле.
// Окно — вокруг интервала слова (startMs…endMs): «Ловлю» ±0,8 с, «Тень», «По памяти» и «Скорость» ±1 с. Слово, услышанное Vosk, приходит с опозданием (черновик появляется, когда слово уже сказано),
// поэтому момент слова = момент прихода − HEARD_LAG_MS (тап по пилюле — без поправки).
import { normText } from '../player/modules/rotate-phone/wordLaneRecipe.js'

export const CATCH_WINDOW_MS = 800
export const SHADOW_WINDOW_MS = 1000
export const HEARD_LAG_MS = 200
export const STUCK_MS = 3000 // «застрял»: столько без единого слова — подсказка первого слова

/** Момент t (мс) в окне win вокруг слова пилюли p */
export const inWindow = (p, t, win) => t >= p.startMs - win && t <= p.endMs + win

/** Какой пилюле засчитать услышанное слово text в момент t: самая ранняя ещё не залитая с тем же словом, у которой момент t в окне; нет такой — −1 (лишнее слово, не в свой момент) */
export function creditWord(pills, filled, text, t, win) {
  const key = normText(text)
  const hit = pills.find(p => !filled.has(p.i) && normText(p.text) === key && inWindow(p, t, win))
  return hit ? hit.i : -1
}

/** Пилюли, чьё окно прошло, а слово так и не засчитано: их отмечают промахом (уже отмеченные — marked) */
export const expiredPills = (pills, filled, marked, t, win) => pills.filter(p => !filled.has(p.i) && !marked.has(p.i) && t > p.endMs + win)

/** Застрял ли человек в «По памяти»: ни одного засчитанного слова, прошло STUCK_MS с начала первого слова и подсказка ещё не давалась */
export function isStuck({ t, firstStartMs, credited = 0, hinted = false }) {
  if (hinted || credited > 0) return false
  return t >= firstStartMs + STUCK_MS
}
