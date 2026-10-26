// «Щелчок» пилюли игры «Повтори за диктором»: в момент, когда пилюля залита целиком, пилюля хлопает — scale 1 → 1.12 → 1, вспышка (белая заливка и кольцо,
// расходящееся наружу), искры вверх (общий залп приложения burstParticles.fireBurst, но локальный — из верхней кромки пилюли) и короткая вибрация там, где она есть (Android).
// Всё императивно (WAAPI на композиторе): React не перерисовывается, а анимация не мешает кадрам линии. Звать из движка пилюль (useWordLanePills) ровно один раз на пилюлю за фазу.
import { fireBurst } from '../../../../shared/lib/burstParticles.js'
import { levelHex } from '../../../../shared/lib/memory/memoryLevels.js'

const LIGHT = ['#e6ff9e', '#bfe4ff', '#d9ccff'] // светлый тон цвета пилюли: зелёная, синяя, фиолетовая
// Длительности подобраны плавными (первая версия, 380 мс, читалась резко): хлопок дышит 0,62 с, вспышка тает 0,65 с, кольцо расходится 0,85 с, искры парят ≈ 1,1 с
export const SNAP_LEAD_MS = 180 // щелчок диктора начинается на столько РАНЬШЕ конца слова: пик хлопка (38 % от POP_MS ≈ 235 мс) приходится на конец слова, а не после него
export const POP_MS = 620
export const FLASH_MS = 850
export const SPARK_COUNT = 14

/** Цвета искр пилюли k: её цвет, его светлый тон и белый */
export const sparkColors = k => [levelHex(k + 1), LIGHT[k] ?? '#ffffff', '#ffffff']

/** Хлопок: масштаб 1 → 1.12 → 1 с мягкой «усадкой». Анимируется отдельное свойство scale, а не transform: положение пилюли (translate из --y) остаётся за движком, они не мешают друг другу */
export const POP_FRAMES = [
  { scale: 1 },
  { scale: 1.12, offset: 0.38 },
  { scale: 0.985, offset: 0.74 },
  { scale: 1 },
]

function flash(host, css, frames, ms) {
  const el = document.createElement('i')
  el.style.cssText = `position:absolute;pointer-events:none;${css}`
  host.appendChild(el)
  const a = el.animate(frames, { duration: ms, easing: 'ease-out', fill: 'forwards' })
  a.finished.then(() => el.remove()).catch(() => el.remove())
}

/** pill — DOM-элемент пилюли (.wlPill), k — её номер 0…2 */
export function snapPill(pill, k) {
  if (!pill) return
  pill.animate(POP_FRAMES, { duration: POP_MS, easing: 'cubic-bezier(0.33, 0, 0.2, 1)' })
  const clip = pill.querySelector('.wlPillClip')
  const c = levelHex(k + 1)
  if (clip) flash(clip, 'inset:0;border-radius:999px;background:#fff;', [{ opacity: 0.7 }, { opacity: 0 }], FLASH_MS * 0.75)
  flash(pill, `inset:-2px;border-radius:999px;border:3px solid ${c};`, [{ opacity: 0.8, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.45, 1.2)' }], FLASH_MS)
  const r = pill.getBoundingClientRect()
  fireBurst({ count: SPARK_COUNT, size: 3.5, colors: sparkColors(k), origin: { x: r.left + r.width / 2, y: r.top + 6, spread: r.width * 0.7, life: 0.8, reach: 260 } })
  try { navigator.vibrate?.(14) } catch { /* не везде есть */ }
}

/** Промах ученика: красная вспышка и короткая дрожь пилюли (отдельное свойство translate — положение из --y не трогаем) */
export function missPill(pill) {
  if (!pill) return
  pill.animate([{ translate: '0 0' }, { translate: '-6px 0', offset: 0.2 }, { translate: '6px 0', offset: 0.4 }, { translate: '-3px 0', offset: 0.6 }, { translate: '0 0' }], { duration: 560, easing: 'ease-out' })
  const clip = pill.querySelector('.wlPillClip')
  if (clip) flash(clip, 'inset:0;border-radius:999px;background:rgba(255,93,115,0.55);', [{ opacity: 1 }, { opacity: 0 }], 700)
}
