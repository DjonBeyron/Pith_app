// Вспышка дорожки на верный ответ (игра «Повтори за диктором»): пилюля принята (win) — колонка её дорожки (.wlLanes i) коротко заливается цветом дорожки, а кромки рядом (.wlLaneEdge) чуть ярче
// (word-lane-lane-flash.css). Всё прямо в DOM, без React: на колонку и её кромки ставится data-win = a | b; обе буквы — одинаковые анимации, подряд идущие вспышки чередуют их, и смена имени анимации
// перезапускает вспышку без принудительного пересчёта вёрстки. По animationend (один слушатель на всё поле, не по одному на колонку) атрибут снимается. Слабое устройство (wl--lite или .weak-device на <html>):
// анимаций нет — data-win = s ставится на LITE_MS и снимается таймером (короткая статичная подсветка: два пересчёта стиля вместо 0,6 с анимации слоя на трети экрана).
import { LANE_EDGES } from './wordLaneTimeline.js'

export const LITE_MS = 300       // статичная подсветка слабого устройства

export function createLaneFlash(root) {
  const lanes = root.querySelector?.('.wlLanes') ?? null
  if (!lanes) return { flash() {} }
  const cols = [...lanes.querySelectorAll('i')]
  const edges = [...lanes.querySelectorAll('.wlLaneEdge')]
  const timers = new Map() // элемент → таймер снятия (слабое устройство)
  const turn = new Map()   // элемент → последняя буква (a / b)
  const lite = () => root.classList?.contains?.('wl--lite') === true || globalThis.document?.documentElement?.classList?.contains?.('weak-device') === true
  lanes.addEventListener('animationend', e => {
    const el = e.target
    if (el !== lanes && el?.getAttribute?.('data-win') && e.animationName === `wlLaneFlash${el.getAttribute('data-win').toUpperCase()}`) el.removeAttribute('data-win') // только своя вспышка: запоздавший конец прежней (a) не снимает уже начатую новую (b)
  })
  const mark = (el, light) => {
    if (!el) return
    if (light) {
      el.setAttribute('data-win', 's'); clearTimeout(timers.get(el))
      timers.set(el, setTimeout(() => el.removeAttribute('data-win'), LITE_MS))
      return
    }
    const next = turn.get(el) === 'a' ? 'b' : 'a'
    turn.set(el, next); el.setAttribute('data-win', next)
  }
  return {
    /** Вспыхнуть дорожке lane (0…2): её колонке и обеим кромкам рядом */
    flash(lane) {
      const light = lite()
      mark(cols[lane], light)
      for (const i of [lane - 1, lane]) if (i >= 0 && i < LANE_EDGES.length) mark(edges[i], light)
    },
  }
}
