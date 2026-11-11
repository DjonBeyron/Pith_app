// «Щелчок» пилюли игры «Повтори за диктором»: в момент, когда пилюля залита целиком (движок зовёт его в кадре, где заливка на экране дошла до 100 %, — не раньше), пилюля хлопает — scale 1 → 1.12 → 1, вспышка (белая заливка и кольцо,
// расходящееся наружу), ПУЗЫРИ ЖИДКОСТИ ВЫРЫВАЮТСЯ НАРУЖУ (v3.3.186, wordLaneBubbles.burstBubbles: те же узлы, что плавали в жидкости, — вертикальная пилюля — вверх через верхний торец, широкая — вверх у переднего торца)
// и короткая вибрация там, где она есть (Android). Пузырей у пилюли нет (слабое устройство, набора не хватило) — прежний локальный залп приложения burstParticles.fireBurst из края, в который упёрлась жидкость (burstOrigin).
// Кольцо вспышки отсчитывается от края пилюли с учётом её border (absolute считается от padding-box): inset = −2 px − --ring.
// Всё императивно (WAAPI на композиторе): React не перерисовывается, а анимация не мешает кадрам линии. Звать из движка пилюль (useWordLanePills) ровно один раз на пилюлю за фазу.
import { fireBurst } from '../../../../shared/lib/burstParticles.js'
import { levelHex } from '../../../../shared/lib/memory/memoryLevels.js'
import { burstBubbles } from './wordLaneBubbles.js'

const LIGHT = ['#e6ff9e', '#bfe4ff', '#d9ccff'] // светлый тон цвета пилюли: зелёная, синяя, фиолетовая
// Длительности подобраны плавными (первая версия, 380 мс, читалась резко): хлопок дышит 0,62 с, вспышка тает 0,65 с, кольцо расходится 0,85 с, искры парят ≈ 1,1 с
export const SNAP_LEAD_MS = 180 // щелчок диктора начинается на столько РАНЬШЕ конца слова: пик хлопка (38 % от POP_MS ≈ 235 мс) приходится на конец слова, а не после него
export const DICTOR_FILL_MIN_MS = 120
/** За сколько мс заливается пилюля диктора со словом длиной ms: к моменту щелчка (ms − SNAP_LEAD_MS) заливка уже 100 % — хлопок и вспышка не раньше доезда (2026-11-10: раньше заливка шла всё слово, а щелчок начинался при ≈ 0,7) */
export const dictorFillMs = ms => Math.max(ms - SNAP_LEAD_MS, Math.min(ms, DICTOR_FILL_MIN_MS))
export const POP_MS = 620
export const FLASH_MS = 850
export const SPARK_COUNT = 14

/** Цвета искр пилюли k: её цвет, его светлый тон и белый */
export const sparkColors = k => [levelHex(k + 1), LIGHT[k] ?? '#ffffff', '#ffffff']

/** Хлопок: масштаб 1 → 1.12 → 1 с мягкой «усадкой». Анимируется отдельное свойство scale: положение пилюли — свойство translate (композитор, wordLaneMotion.js), оно стоит в цепочке ПЕРЕД scale, поэтому хлопок не сдвигает пилюлю */
export const POP_FRAMES = [
  { scale: 1 },
  { scale: 1.12, offset: 0.38 },
  { scale: 0.985, offset: 0.74 },
  { scale: 1 },
]

/** Хлопок пилюли с масштабом полёта (data-edge, «Гонка»): без явных кадров 1 в начале и конце — они берутся из-под анимации, пилюля не прыгает с 0,85 на 1 */
export const POP_EDGE_FRAMES = [{ scale: 1.12, offset: 0.38 }, { scale: 0.985, offset: 0.74 }]

/** Микро-анимация неверного слова на пилюле «Разгона» (data-quiet): дрожь и красная вспышка обводки, 200 мс; без полос, без filter */
export const SOFT_MISS_MS = 200
export const SOFT_MISS_SHAKE = [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)', offset: 0.25 }, { transform: 'translateX(5px)', offset: 0.55 }, { transform: 'translateX(-2px)', offset: 0.8 }, { transform: 'translateX(0)' }]
export const SOFT_MISS_RING = [{ outline: '3px solid rgba(255,93,115,0)', outlineOffset: '0px' }, { outline: '3px solid rgba(255,93,115,0.95)', outlineOffset: '0px', offset: 0.3 }, { outline: '3px solid rgba(255,93,115,0)', outlineOffset: '0px' }]

/** Откуда бьёт запасной залп щелчка (у пилюли нет пузырей): из края, в который упёрлась жидкость (щелчок идёт в кадре, где заливка дошла до 100 %), по направлению заливки. Вертикальная пилюля — из верхней кромки вверх;
 *  широкая «Фраз» (заливка слева направо) — из правого торца вправо-вверх (раньше — из всей верхней кромки, мимо линии заливки). r — рамка пилюли на экране */
export const burstOrigin = (r, wide = false) => (wide
  ? { x: r.left + r.width - r.height / 2, y: r.top + r.height / 2, spread: r.height * 0.5, life: 0.7, reach: 200, angle: -Math.PI / 3.4, fan: 1.2 }
  : { x: r.left + r.width / 2, y: r.top + 6, spread: r.width * 0.7, life: 0.8, reach: 260 })

function flash(host, css, frames, ms) {
  const el = document.createElement('i')
  el.style.cssText = `position:absolute;pointer-events:none;${css}`
  host.appendChild(el)
  const a = el.animate(frames, { duration: ms, easing: 'ease-out', fill: 'forwards' })
  a.finished.then(() => el.remove()).catch(() => el.remove())
}

/**
 * pill — DOM-элемент пилюли (.wlPill), k — её номер 0…2. full (по умолчанию true) — полный щелчок: хлопок, белая вспышка, кольцо, вибрация. У повтора из нескольких кусков полный щелчок —
 * ОДИН на повтор (full: true только у одного куска), остальные куски лишь хлопают (full: false): на каждый кусок вспышки давали кучу слоёв и анимаций в самый тяжёлый момент игры.
 * Пузыри вылетают у каждой пилюли, чья заливка дошла (узлы уже есть — новых не создаётся). → сколько пузырей вылетело
 */
export function snapPill(pill, k, { full = true } = {}) {
  if (!pill) return 0
  pill.animate(pill.hasAttribute?.('data-edge') ? POP_EDGE_FRAMES : POP_FRAMES, { duration: POP_MS, easing: 'cubic-bezier(0.33, 0, 0.2, 1)' })
  const out = burstBubbles(pill)
  if (!full) return out
  const clip = pill.querySelector('.wlPillClip')
  const c = levelHex(k + 1)
  if (clip) flash(clip, 'inset:0;border-radius:999px;background:#fff;', [{ opacity: 0.7 }, { opacity: 0 }], FLASH_MS * 0.75)
  flash(pill, `inset:calc(-2px - var(--ring));border-radius:999px;border:3px solid ${c};`, [{ opacity: 0.8, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.45, 1.2)' }], FLASH_MS)
  if (!out) fireBurst({ count: SPARK_COUNT, size: 3.5, colors: sparkColors(k), origin: burstOrigin(pill.getBoundingClientRect(), pill.hasAttribute?.('data-wide')) })
  try { navigator.vibrate?.(14) } catch { /* не везде есть */ }
  return out
}

/** Промах ученика: красная вспышка и короткая дрожь пилюли (transform: translateX — положение пилюли живёт в свойстве translate и в этой анимации не участвует). Пилюля остаётся помеченной data-wrong — косые полоски
 *  (word-lane-pill-wrong.css), пока не защёлкнулась (data-lock) или не вернулась в пул (clean в wordLanePool.js) */
export function missPill(pill) {
  if (!pill) return
  if (pill.hasAttribute?.('data-quiet')) { // «Разгон»: только микро-анимация на пилюле (дрожь + красная обводка 200 мс), без data-wrong (полос) и вспышки внутри
    pill.animate(SOFT_MISS_SHAKE, { duration: SOFT_MISS_MS, easing: 'ease-out' })
    pill.animate(SOFT_MISS_RING, { duration: SOFT_MISS_MS, easing: 'ease-out' })
    return
  }
  pill.setAttribute?.('data-wrong', '1')
  pill.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)', offset: 0.2 }, { transform: 'translateX(6px)', offset: 0.4 }, { transform: 'translateX(-3px)', offset: 0.6 }, { transform: 'translateX(0)' }], { duration: 560, easing: 'ease-out' })
  const clip = pill.querySelector('.wlPillClip')
  if (clip) flash(clip, 'inset:0;border-radius:999px;background:rgba(255,93,115,0.55);', [{ opacity: 1 }, { opacity: 0 }], 700)
}
