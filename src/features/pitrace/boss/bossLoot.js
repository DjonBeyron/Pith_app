// Трофеи Мии в экзамене (RaceBossLoot.jsx): чистая геометрия, кадры и сроки без DOM. Владелец 2026-11-26: «начисление XP Мии — в том же стиле, что у пользователя: её пилюля со счётчиком XP появляется
// над головой в момент, когда она говорит про это, потом уменьшается и прилетает к счётчику». У игрока принятая пилюля слова улетает, сжимаясь в искру (wordLaneRise.riseScale), и гаснет на последней
// четверти пути, а счётчик «распухает» (WordLaneXpFlight.xpPulseFrames). У Мии то же самое: пилюля «+N XP» над её головой → тот же закон сжатия, та же длительность полёта и то же гашение → её счётчик
// слева сверху «распухает» теми же кадрами, и только тогда меняется число. Одна конечная анимация transform + opacity на одном узле (кадры считаются один раз, летит компоузер; своего цикла кадров нет).
import { riseScale, RISE_MS, RISE_SCALE, RISE_FADE_FROM } from '../../player/modules/rotate-phone/wordLaneRise.js'
import { MISS_LINE } from './bossMia.js'

export const LOOT_SHOW_MS = 650     // пилюля появилась над головой Мии и стоит: число успевают прочитать, пока она начинает колкость
export const LOOT_FLY_MS = RISE_MS  // полёт к счётчику — столько же, сколько взлёт пилюли игрока
export const LOOT_TOTAL_MS = LOOT_SHOW_MS + LOOT_FLY_MS
export const LOOT_END_SCALE = 0.4   // у счётчика пилюля размером с его число (у игрока пилюля уходит за экран искрой 0,1 — здесь она прилетает на виду)
export const LOOT_UP_PX = 22        // центр пилюли выше макушки Мии на столько
export const LOOT_EDGE_PX = 8       // зазор от краёв слоя
export const LOOT_WAIT_MS = 4000    // колкость так и не началась (пауза, сброс очереди речи) — число всё равно обновится
const FLY_STEPS = 12

/** Мия говорит про трофеи: её колкость на промах (чужое слово / не успели / молчали) */
export const isLootLine = id => Object.values(MISS_LINE).includes(id)

const clamp = (v, a, b) => Math.min(Math.max(v, a), Math.max(a, b))
/** Где появляется пилюля (центр, координаты слоя): head — голова Мии { cx, top }, w — ширина слоя, half — половина ширины и высоты пилюли. Над макушкой, целиком в слое */
export function lootStart({ head, w, half = { x: 40, y: 15 } }) {
  return [clamp(head.cx, half.x + LOOT_EDGE_PX, w - half.x - LOOT_EDGE_PX), Math.max(half.y + LOOT_EDGE_PX, head.top - LOOT_UP_PX)]
}

/** Сжатие в полёте на доле пути o: закон пилюли игрока (riseScale: 1 до 15 % пути, дальше smoothstep), но до LOOT_END_SCALE */
export const lootScale = o => 1 - ((1 - LOOT_END_SCALE) * (1 - riseScale(o))) / (1 - RISE_SCALE)

/** Кадры одной анимации (easing 'linear', длительность LOOT_TOTAL_MS): хлопок появления над головой → стоит → летит к счётчику с разгоном, сжимается, на последней четверти пути гаснет */
export function lootFrames(from, to) {
  const at = ([x, y], s) => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${s.toFixed(3)})`
  const hold = LOOT_SHOW_MS / LOOT_TOTAL_MS
  const frames = [{ offset: 0, transform: at(from, 0.5), opacity: 0 }, { offset: +(hold * 0.3).toFixed(4), transform: at(from, 1.12), opacity: 1 }, { offset: +(hold * 0.55).toFixed(4), transform: at(from, 1), opacity: 1 }, { offset: +hold.toFixed(4), transform: at(from, 1), opacity: 1 }]
  for (let i = 1; i <= FLY_STEPS; i++) {
    const o = i / FLY_STEPS, p = o * o * (1.6 - 0.6 * o) // разгон, как у взлёта пилюли: старт мягкий, к счётчику быстрее
    frames.push({ offset: i === FLY_STEPS ? 1 : +(hold + (1 - hold) * o).toFixed(4), transform: at([from[0] + (to[0] - from[0]) * p, from[1] + (to[1] - from[1]) * p], lootScale(o)), opacity: o <= RISE_FADE_FROM ? 1 : +(1 - (o - RISE_FADE_FROM) / (1 - RISE_FADE_FROM)).toFixed(3) })
  }
  return frames
}
