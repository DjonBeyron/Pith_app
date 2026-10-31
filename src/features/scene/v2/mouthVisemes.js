import { wordSegments } from '../../../shared/lib/visemeLetters.js'
import { SCENE_HALF_AT as HALF_AT, SCENE_OPEN_AT as OPEN_AT } from '../../../shared/lib/mouthLevels.js'
import { levelAt } from '../../../shared/lib/audioEnvelope.js'

// «Живой Пит v2»: рот из 9 форм Rhubarb (X A B C D E F G H) по буквам слов и по громкости — чистая логика без DOM и таймеров
// (тесты — mouthVisemes.test.js). Включается флагом animV2 (animFlags.js), обычный кот ею не пользуется.
//
//  1. Дорожка (buildCodeTrack): для каждого слова wordTimings [{ word, start, end }] (секунды) буквы раскладываются по отрезку слова
//     (shared/lib/visemeLetters.js — тот же переводчик «буква → код», что у кота «Поворота телефона»). Сглаживание: форма держится
//     не меньше MIN_HOLD (70 мс) — короткий отрезок отдаёт время более длинному соседу; соседние одинаковые формы склеиваются;
//     паузы между словами — X (паузу короче MIN_HOLD слипшийся рот не показывает: прошлая форма доезжает до следующего слова).
//     Слово без букв («5», «%») получает общую «говорящую» форму GENERIC. Нет таймингов — вызывающий даёт синтетические (mouthRhythm.syntheticTimings).
//  2. Гейт по огибающей громкости (gateCode; env считается заранее — shared/lib/audioEnvelope.js): тише HALF_AT → X (тишина, придыхание),
//     между HALF_AT и OPEN_AT — «полуоткрытая» версия кода (LESS_OPEN), громче OPEN_AT — код как есть. Нет огибающей — только буквы.
//  3. Выбор формы на момент t (createCodePicker): дорожка → гейт → удержание ≥ MIN_HOLD между сменами (дребезг гейта у порога не мерцает).

export const MIN_HOLD = 0.07
export const GENERIC = 'C'
export const CODES = ['X', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
export const isCode = v => typeof v === 'string' && v.length === 1 && CODES.includes(v)

// Свёртка кода в три старые формы (рот обычного кота и запасные пути mouthDriver): закрытый рот и сомкнутые губы — closed,
// широкие гласные (а я, о) — open, остальное (зубы, трубочка, зуб на губе, язык, «е») — half
export const FOLD = { X: 'closed', A: 'closed', B: 'half', C: 'half', D: 'open', E: 'open', F: 'half', G: 'half', H: 'half' }
export const foldCode = code => FOLD[code] ?? 'closed'

// «Полуоткрытая» версия кода — для средней громкости (HALF_AT…OPEN_AT): та же буква, но рот приоткрыт меньше.
// D (широко) и E (округлено) сжимаются до C (полуоткрыт), C — до B (зубы рядом), F («трубочка») — до B, H (язык) — до C.
// A (губы сомкнуты), B (зубы) и G (зуб на губе) и так «закрытые» — не меняются; X остаётся X.
export const LESS_OPEN = { X: 'X', A: 'A', B: 'B', C: 'B', D: 'C', E: 'C', F: 'B', G: 'G', H: 'C' }

// Гейт кода по громкости level (0…1): тихо → X, средне → полуоткрытая версия, громко → как есть
export function gateCode(code, level) {
  if (code === 'X' || level < HALF_AT) return 'X'
  return level < OPEN_AT ? (LESS_OPEN[code] ?? code) : code
}

const dur = s => s.end - s.at
const EPS = 1e-9

// Подряд идущие одинаковые формы → один отрезок
function mergeSame(segs) {
  const out = []
  for (const s of segs) {
    const last = out.at(-1)
    if (last && last.code === s.code && Math.abs(last.end - s.at) < 1e-6) last.end = s.end
    else out.push({ ...s })
  }
  return out
}

// Отрезки одного слова: пока есть короче minHold (и их больше одного), самый короткий отдаёт время более длинному соседу
export function holdWord(segs, minHold) {
  let s = mergeSame(segs)
  while (s.length > 1) {
    let k = -1
    let min = Infinity
    s.forEach((x, i) => { if (dur(x) < minHold - EPS && dur(x) < min) { min = dur(x); k = i } })
    if (k < 0) break
    const L = s[k - 1]
    const R = s[k + 1]
    const left = !R || (L && dur(L) >= dur(R))
    if (left) L.end = s[k].end
    else R.at = s[k].at
    s.splice(k, 1)
    s = mergeSame(s)
  }
  return s
}

// Дорожка рта: [{ at, end, code, w }] (секунды; w — индекс слова в timings), по порядку, без перекрытий. Негодные слова пропускаются
export function buildCodeTrack(timings, minHold = MIN_HOLD) {
  const track = []
  ;(Array.isArray(timings) ? timings : []).forEach((t, w) => {
    if (!t || !Number.isFinite(t.start) || !Number.isFinite(t.end) || t.end <= t.start) return
    let segs = wordSegments(String(t.word ?? ''), t.start, t.end)
    if (!segs.length) segs = [{ at: t.start, end: t.end, code: GENERIC }]
    for (const s of holdWord(segs, minHold)) track.push({ ...s, w })
  })
  // Пауза короче minHold — не закрываем рот: прошлая форма держится до начала следующего слова
  for (let i = 1; i < track.length; i++) {
    const gap = track[i].at - track[i - 1].end
    if (gap > EPS && gap < minHold - EPS) track[i - 1].end = track[i].at
  }
  return track
}

// Индекс отрезка, звучащего в момент t, либо -1 (пауза). from — подсказка (отрезки идут по порядку; при seek назад ищем с нуля)
export function segIndexAt(track, t, from = 0) {
  let i = from > 0 && track[from] && track[from].at <= t ? from : 0
  for (; i < track.length; i++) {
    if (t < track[i].at) return -1
    if (t < track[i].end) return i
  }
  return -1
}

// Код формы в момент t по одной дорожке (без гейта и удержания): X в паузах
export function codeAtTrack(track, t) {
  const i = Number.isFinite(t) ? segIndexAt(track, t) : -1
  return i < 0 ? 'X' : track[i].code
}

// Выбор формы по времени воспроизведения: pick(t) → { code, word } (word — индекс слова в timings, -1 в паузе).
// lv — огибающая (envelopeLevels) или null. Состояние: подсказка индекса и последняя смена формы — для удержания ≥ minHold
export function createCodePicker(track, lv = null, minHold = MIN_HOLD) {
  let hint = 0
  let cur = 'X'
  let since = -Infinity
  return {
    pick(t) {
      if (t < since) { hint = 0; since = -Infinity } // перемотка назад
      const i = segIndexAt(track, t, hint)
      if (i >= 0) hint = i
      let code = i >= 0 ? track[i].code : 'X'
      if (lv && code !== 'X') code = gateCode(code, levelAt(lv, t))
      if (code !== cur) {
        if (t - since < minHold) code = cur
        else { cur = code; since = t }
      }
      return { code, word: i >= 0 ? track[i].w : -1 }
    },
    reset() { hint = 0; cur = 'X'; since = -Infinity },
  }
}
