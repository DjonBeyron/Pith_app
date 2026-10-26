// «Щелчок» пилюли игры «Повтори за диктором»: в момент, когда линия прошла пилюлю и она залита целиком, пилюля хлопает — scale 1 → 1.12 → 1, вспышка (белая заливка и кольцо,
// расходящееся наружу), искры вверх (общий залп приложения burstParticles.fireBurst, но локальный — из верхней кромки пилюли) и короткая вибрация там, где она есть (Android).
// Всё императивно (WAAPI на композиторе): React не перерисовывается, а анимация не мешает кадрам линии. Звать из rAF-цикла линии ровно один раз на пилюлю за фазу.
import { fireBurst } from '../../../../shared/lib/burstParticles.js'
import { levelHex } from '../../../../shared/lib/memory/memoryLevels.js'

const LIGHT = ['#e6ff9e', '#bfe4ff', '#d9ccff'] // светлый тон цвета пилюли: зелёная, синяя, фиолетовая
export const POP_MS = 380
export const FLASH_MS = 460
export const SPARK_COUNT = 16

/** Цвета искр пилюли k: её цвет, его светлый тон и белый */
export const sparkColors = k => [levelHex(k + 1), LIGHT[k] ?? '#ffffff', '#ffffff']

/** Хлопок: масштаб с переломом (быстро вверх, пружинно назад) */
export const POP_FRAMES = [
  { transform: 'translateX(-50%) scale(1)' },
  { transform: 'translateX(-50%) scale(1.12)', offset: 0.35 },
  { transform: 'translateX(-50%) scale(0.98)', offset: 0.7 },
  { transform: 'translateX(-50%) scale(1)' },
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
  pill.animate(POP_FRAMES, { duration: POP_MS, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.2)' })
  const clip = pill.querySelector('.wlPillClip')
  const c = levelHex(k + 1)
  if (clip) flash(clip, 'inset:0;border-radius:999px;background:#fff;', [{ opacity: 0.85 }, { opacity: 0 }], FLASH_MS * 0.7)
  flash(pill, `inset:-2px;border-radius:999px;border:3px solid ${c};`, [{ opacity: 0.9, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.35, 1.18)' }], FLASH_MS)
  const r = pill.getBoundingClientRect()
  fireBurst({ count: SPARK_COUNT, size: 3.5, colors: sparkColors(k), origin: { x: r.left + r.width / 2, y: r.top + 6, spread: r.width * 0.7, life: 0.5, reach: 300 } })
  try { navigator.vibrate?.(14) } catch { /* не везде есть */ }
}
