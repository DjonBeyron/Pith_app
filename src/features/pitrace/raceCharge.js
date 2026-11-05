// Заставка-«зарядка» памятью «Гонки с Питом» (CONCEPT_RACE.md, «Заставка»). Пока Пит говорит общую фразу (race_start) и объявляет первый этап, дорожек не видно: снизу вверх летят пилюли со словами из памяти
// человека (слова плана и extraWords, как у «Разгона»), цвет пилюли — ступень памяти слова (--lvl0…--lvl4, memory-levels.css), а сверху бар заполняется кусками цветов долетевших пилюль. Бар заполнен ровно
// к моменту, когда долетела последняя пилюля (T = длина речи Пита). Этот файл — чистый ПЛАН без DOM и часов: список пилюль (x, старт, время полёта, прилёт), искры и сегменты бара — всё от семени
// плана (только rngFor), поэтому одна сессия воспроизводима. Рисует план RaceCharge.jsx (Web Animations), стили — race-charge.css.
import { rngFor, rngInt, rngShuffle } from '../rehearsal/rehearsalSeed.js'
import { normText } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { lineMs } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { lineVoiced } from '../rehearsal/rehearsalQuiet.js'
import { extrasOf } from './raceWords.js'

export const CHARGE_FALLBACK_MS = 4000 // озвучки реплик нет — заставка длится столько
export const CHARGE_MAX = 14           // пилюль не больше (узлов в DOM: пилюли + искры + сегменты)
export const CHARGE_FLY_MS = 1500      // полёт одной пилюли снизу вверх (на короткой заставке — не больше 40 % её длины)
export const CHARGE_SPARKS = 24        // микро-частицы (на слабом устройстве не рисуются)
export const BAR_MIN_PX = 4            // бар сверху: пустой — тонкий…
export const BAR_MAX_PX = 14           // …пока наполняется — толстеет (растёт ступеньками с каждой долетевшей пилюлей)…
export const BAR_FULL_PX = 6           // …а заполненный плавно худеет до обычной тонкой полоски (без косых полос: полный бар — сплошные цветные сегменты)
export const BAR_THIN_MS = 500         // за сколько бар худеет после заполнения
export const BAR_BUMP = 2              // касание пилюлей: бар по высоте плавно (ease-in-out, без ступеньки) утолщается до 2× за BAR_BUMP_MS…
export const BAR_BUMP_MS = 220         // …пик — ровно в момент касания…
export const BAR_BACK_MS = 260         // …и так же плавно возвращается за BAR_BACK_MS
export const START_BELOW_PX = 60       // пилюля стартует на столько px НИЖЕ нижнего края заставки (из-за нижнего затемнения, как пилюли игры выезжают из-за верхнего края)

/** Толщина бара после i долетевших пилюль из n, px: ступенька за пилюлю от BAR_MIN_PX до BAR_MAX_PX */
export const barHeight = (i, n) => BAR_MIN_PX + ((BAR_MAX_PX - BAR_MIN_PX) * i) / Math.max(1, n)

/**
 * Путь пилюли до бара, px вверх: пилюля стоит верхним краем на START_BELOW_PX ниже низа заставки (height — высота заставки), высота пилюли pillH; прилёт — её ЦЕНТР в центре бара по y в момент касания
 * (верх бара barTop + половина его толщины после i + 1 долетевших пилюль из n).
 */
export const flyDist = ({ height, pillH, barTop, i, n }) => height + START_BELOW_PX + pillH / 2 - (barTop + barHeight(i + 1, n) / 2)

/** Сдвиг по x (px) от места пилюли (x % ширины width, центр) до ЦЕНТРА бара: пилюля прилетает строго в центр бара и по x (кривая raceChargePath.js на прилёте — ровно в центр) */
export const flyDx = ({ width, x, barLeft, barWidth }) => barLeft + barWidth / 2 - (width * x) / 100

const ease = t => t * t * (3 - 2 * t) // ease-in-out (smoothstep)

/** Подпись пилюли заставки: длинное слово обрезается (у пилюли нет overflow: hidden — хвост-шлейф должен быть виден) */
export const pillLabel = (text, max = 16) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

/** Кадры касания бара (свойство scale, по высоте): от текущего значения (первого кадра нет — берётся из-под анимации, при частых касаниях без скачка) к BAR_BUMP по ease-in-out за BAR_BUMP_MS, обратно к 1 за BAR_BACK_MS; duration = BAR_BUMP_MS + BAR_BACK_MS, пик на offset BAR_BUMP_MS / duration */
export function bumpFrames(steps = 6) {
  const d = BAR_BUMP_MS + BAR_BACK_MS, peak = BAR_BUMP_MS / d
  const up = Array.from({ length: steps }, (_, k) => ({ scale: `1 ${(1 + (BAR_BUMP - 1) * ease((k + 1) / steps)).toFixed(4)}`, offset: (peak * (k + 1)) / steps }))
  const down = Array.from({ length: steps }, (_, k) => ({ scale: `1 ${(BAR_BUMP - (BAR_BUMP - 1) * ease((k + 1) / steps)).toFixed(4)}`, offset: peak + ((1 - peak) * (k + 1)) / steps }))
  return { frames: [...up, ...down], duration: d }
}

/**
 * Толщина бара ОДНОЙ анимацией (height): ступенька за пилюлю (подъём за BAR_BUMP_MS перед касанием) и в конце худение до BAR_FULL_PX. Худеть бар начинает, когда последнее касание
 * вернулось (totalMs + BAR_BACK_MS): последний подъём, касание и худение не накладываются. → { keys: [{ height, offset }], duration }
 */
export function barKeys(segments, totalMs) {
  const n = segments.length, thinAt = totalMs + BAR_BACK_MS, duration = thinAt + BAR_THIN_MS
  const off = ms => Math.min(1, Math.max(0, ms / duration))
  const keys = [{ height: `${barHeight(0, n)}px`, offset: 0 }]
  segments.forEach((s, i) => { keys.push({ height: `${barHeight(i, n)}px`, offset: off(Math.max(s.at - BAR_BUMP_MS, i ? segments[i - 1].at : 0)) }, // подъём не раньше прилёта прежней: офсеты не убывают
    { height: `${barHeight(i + 1, n)}px`, offset: off(s.at) }) })
  keys.push({ height: `${barHeight(n, n)}px`, offset: off(thinAt) }, { height: `${BAR_FULL_PX}px`, offset: 1 })
  return { keys, duration }
}

export const levelColor = level => `var(--lvl${Math.min(4, Math.max(0, level | 0))})`

/** Длительность заставки, мс: сумма длин озвученных реплик ids (race_start + реплика первого этапа); ни одной озвученной — CHARGE_FALLBACK_MS */
export function chargeMs(lines, ids, rate = 1) {
  const voiced = ids.filter(id => lineVoiced(lines, id))
  return voiced.length ? voiced.reduce((sum, id) => sum + lineMs(lines[id], rate), 0) : CHARGE_FALLBACK_MS
}

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
export function chargePlan(plan, totalMs = CHARGE_FALLBACK_MS) {
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

/** Заставка на экране? Пока падает фраза и открываются дорожки (drop, lanes) и пока стоит плашка первого этапа (стадия 0 — announce); дальше начинается первый раунд: дорожки проявляются, бар уходит */
export const chargeOn = ({ stage, idx, stageObj = null }) => stage === 'drop' || stage === 'lanes' || (stage === 'run' && idx === 0 && stageObj?.type === 'announce') || (stage === 'paused' && idx === 0)
