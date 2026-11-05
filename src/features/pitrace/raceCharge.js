// Заставка-«зарядка» памятью «Гонки с Питом» (CONCEPT_RACE.md, «Заставка»). Пока Пит говорит общую фразу (race_start) и реплику первого этапа, дорожек не видно: снизу вверх летят пилюли со словами из памяти
// человека (слова плана и extraWords, как у «Разгона»), цвет пилюли — ступень памяти слова (--lvl0…--lvl4, memory-levels.css), а сверху бар заполняется кусками цветов долетевших пилюль. Бар заполнен ровно
// к моменту, когда долетела последняя пилюля (T = длина речи Пита). Этот файл — чистый ПЛАН без DOM и часов: список пилюль (x, старт, время полёта, прилёт), искры и сегменты бара — всё от семени
// плана (только rngFor), поэтому одна сессия воспроизводима. Рисует план RaceCharge.jsx (Web Animations), стили — race-charge.css.
import { rngFor, rngInt, rngShuffle } from '../rehearsal/rehearsalSeed.js'
import { normText } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { extrasOf } from './raceWords.js'

export const CHARGE_MAX = 14           // пилюль не больше (узлов в DOM: пилюли + искры + сегменты)
export const CHARGE_FLY_MS = 1500      // полёт одной пилюли снизу вверх (на короткой заставке — не больше 40 % её длины)
export const CHARGE_SPARKS = 24        // микро-частицы (на слабом устройстве не рисуются)
export const BAR_CORE_PX = 6           // бар — тонкая подложка постоянной высоты с border-radius 999px: скругления не меняются никогда (высота НЕ анимируется)…
export const HALO_MAX = 2.4            // …«толщину» набирает слой-ореол за баром (тот же радиус): transform: scaleY от 1 до HALO_MAX ступенькой за пилюлю, origin по центру (raceCharge.haloKeys)
export const HALO_RISE_MS = 220        // подъём ореола перед касанием очередной пилюли
export const FLASH_MS = 300            // касание: вспышка сегмента цветом слова, opacity 0,9 → 0 (CSS, race-charge.css)
export const RING_MS = 350             // кольцо-рябь от точки касания: scale 0,6 → 1,6, opacity → 0 (один узел на бар)
export const NUDGE_PX = 2              // лёгкий толчок всего бара вниз и обратно (translateY) в момент касания
export const NUDGE_MS = 200
export const START_BELOW_PX = 60       // пилюля стартует на столько px НИЖЕ нижнего края заставки (из-за нижнего затемнения, как пилюли игры выезжают из-за верхнего края)

/**
 * Путь пилюли до бара, px вверх: пилюля стоит верхним краем на START_BELOW_PX ниже низа заставки (height — высота заставки), высота пилюли pillH; прилёт — её ЦЕНТР в центре бара по y в момент касания
 * (верх бара barTop + половина BAR_CORE_PX: бар постоянной высоты).
 */
export const flyDist = ({ height, pillH, barTop }) => height + START_BELOW_PX + pillH / 2 - (barTop + BAR_CORE_PX / 2)

/** Сдвиг по x (px) от места пилюли (x % ширины width, центр) до ЦЕНТРА бара: пилюля прилетает строго в центр бара и по x (кривая raceChargePath.js на прилёте — ровно в центр) */
export const flyDx = ({ width, x, barLeft, barWidth }) => barLeft + barWidth / 2 - (width * x) / 100

/** Подпись пилюли заставки: длинное слово обрезается (у пилюли нет overflow: hidden — хвост-шлейф должен быть виден) */
export const pillLabel = (text, max = 16) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

/**
 * Ореол бара (слой за баром с тем же border-radius 999px): «толщина» набирается transform: scaleY с центром в середине, высота бара не анимируется — скругления остаются круглыми. Ступенька за пилюлю:
 * подъём за HALO_RISE_MS до касания (не раньше прилёта прежней), к HALO_MAX — на последней. → { keys: [{ transform, offset, easing }], duration (до прилёта последней) }
 */
export function haloKeys(segments) {
  const n = segments.length, duration = Math.max(1, segments.at(-1)?.at ?? 1)
  const off = ms => Math.min(1, Math.max(0, ms / duration))
  const at = i => 1 + ((HALO_MAX - 1) * i) / Math.max(1, n)
  const keys = [{ transform: `scaleY(${at(0)})`, offset: 0, easing: 'ease-in-out' }]
  segments.forEach((sg, i) => {
    keys.push({ transform: `scaleY(${at(i).toFixed(4)})`, offset: off(Math.max(sg.at - HALO_RISE_MS, i ? segments[i - 1].at : 0)), easing: 'ease-in-out' }, { transform: `scaleY(${at(i + 1).toFixed(4)})`, offset: off(sg.at), easing: 'linear' })
  })
  return { keys, duration }
}

/** Толчок всего бара в момент касания: translateY 0 → NUDGE_PX (на 35 %) → 0, только transform; duration = NUDGE_MS */
export const nudgeFrames = () => ({ frames: [{ transform: 'translateY(0)', offset: 0 }, { transform: `translateY(${NUDGE_PX}px)`, offset: 0.35 }, { transform: 'translateY(0)', offset: 1 }], duration: NUDGE_MS })

/** Кольцо-рябь от точки касания: scale 0,6 → 1,6 и opacity 0,9 → 0 за RING_MS (центр кольца задаёт CSS) */
export const ringFrames = () => ({ frames: [{ transform: 'translate(-50%, -50%) scale(0.6)', opacity: 0.9 }, { transform: 'translate(-50%, -50%) scale(1.6)', opacity: 0 }], duration: RING_MS })

export const levelColor = level => `var(--lvl${Math.min(4, Math.max(0, level | 0))})`

/** Слова памяти для заставки: слова плана и extraWords (как у «Разгона»), без повторов, до CHARGE_MAX; level — ступень памяти 0–4 (нет — 1) */
export function chargeWords(plan) {
  const seen = new Set()
  return [...(plan.words ?? []), ...extrasOf(plan)]
    .filter(w => { const k = normText(w.text); if (!k || seen.has(k)) return false; seen.add(k); return true })
    .slice(0, CHARGE_MAX)
    .map(w => ({ text: w.text, level: Number.isFinite(w.level) ? w.level : 1 }))
}

/**
 * План заставки длиной totalMs.
 * → { totalMs, pills: [{ i, text, level, color, x (% ширины), startAt, flyMs, arriveAt, wave, from, to }], sparks: [{ i, x, startAt, flyMs, size, color }], segments: [{ i, level, color, from, to, at }] }
 * Пилюли идут в порядке прилёта (i); последняя прилетает ровно в totalMs; сегменты бара — по одному на пилюлю, в порядке прилёта, в сумме ровно 100 %.
 */
export function chargePlan(plan, totalMs = 4000) {
  const words = chargeWords(plan)
  const n = words.length
  const total = Math.max(1000, Math.round(totalMs))
  if (!n) return { totalMs: total, pills: [], sparks: [], segments: [] }
  const rng = rngFor(plan.seed, 'race-charge')
  const wrng = rngFor(plan.seed, 'race-charge-wave') // волна — свой поток: порядок и разброс пилюль от неё не зависят
  const order = rngShuffle(rng, words)
  const fly = Math.min(CHARGE_FLY_MS, total * 0.4)
  const gap = (total - fly) / n
  const pills = order.map((w, i) => {
    const arriveAt = i === n - 1 ? total : Math.round(fly + gap * (i + 1) + (rng() - 0.5) * gap * 0.5) // к последней — ровно T, у остальных небольшой разброс (порядок прилёта не ломается: ±¼ шага)
    const flyMs = Math.round(Math.min(arriveAt, fly * (0.85 + rng() * 0.3)))
    return { i, text: w.text, level: w.level, color: levelColor(w.level), x: 14 + rngInt(rng, 73), startAt: arriveAt - flyMs, flyMs, arriveAt, wave: { sign: wrng() < 0.5 ? -1 : 1 } }
  })
  const share = 100 / n
  const segments = pills.map(p => ({ i: p.i, level: p.level, color: p.color, from: +(p.i * share).toFixed(3), to: p.i === n - 1 ? 100 : +((p.i + 1) * share).toFixed(3), at: p.arriveAt }))
  pills.forEach(p => { p.from = segments[p.i].from; p.to = segments[p.i].to })
  const sparks = Array.from({ length: CHARGE_SPARKS }, (_, j) => {
    const p = pills[j % n] // искра летит рядом с «своей» пилюлей, чуть раньше или позже, и чуть быстрее
    const flyMs = Math.round(p.flyMs * (0.75 + rng() * 0.35))
    return { i: j, x: Math.min(96, Math.max(4, +(p.x + (rng() - 0.5) * 16).toFixed(2))), startAt: Math.max(0, Math.round(p.arriveAt - flyMs - rng() * 160)), flyMs, size: 2 + rngInt(rng, 2), color: p.color }
  })
  return { totalMs: total, pills, sparks, segments }
}

/** Заставка на экране? Пока падает фраза и открываются дорожки (drop, lanes) и пока идёт стадия 0 (announce: бар стал плашкой этапа, потом ноты); дальше начинается первый раунд: дорожки проявляются. hold — сцена открыта, звук готовится: заставка ещё не началась */
export const chargeOn = ({ stage, idx, stageObj = null, hold = false }) => !hold && (stage === 'drop' || stage === 'lanes' || (stage === 'run' && idx === 0 && stageObj?.type === 'announce') || (stage === 'paused' && idx === 0))
