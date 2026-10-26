// План фазы диктора: когда звучит слово и когда линия проходит пилюли. Чистые функции — их же использует редактор таймлайна (canvas/word-lane).
// Два источника: без озвучки автора — фиксированное расписание wordLaneTimeline (голос — слово из библиотеки/система); с озвучкой ElevenLabs — таймлайн ноды `fills`
// [{start, end}] ×3 (секунды ОТ НАЧАЛА ФАЙЛА): начало клипа = начало слова = линия входит в пилюлю и она начинает заливаться, конец клипа = конец слова = пилюля залита полностью.
// Поэтому скорость линии внутри пилюли = скорость речи диктора. Линия стартует раньше звука на LEAD_MS (ей нужно подняться к первой пилюле), файл включается через LEAD_MS после её старта.
import { SLOT_COUNT, FILL_AT, FILL_MS, LISTEN_ANCHORS, LISTEN_MS, EXIT_TAIL_MS, buildAnchors } from './wordLaneTimeline.js'
import { tokenize } from '../../../../shared/lib/speech/speechMatch.js'

export const LEAD_MS = 1200          // линия идёт, звук ещё молчит
export const MIN_FIRST_MS = 900      // первая пилюля не раньше — линия не успевает подняться
export const MIN_GAP_MS = 300        // между концом одного слова и началом следующего (линия переходит к следующей пилюле)
export const FILL_MIN_MS = 400
export const FILL_MAX_MS = 1800
export const DEFAULT_WORD_MS = 800   // длина клипа, если у слова не известен конец

const num = v => typeof v === 'number' && Number.isFinite(v)

/** Таймлайн ноды → три клипа в секундах или null (нет/битый — играем по расписанию по умолчанию) */
export function normalizeFills(raw) {
  if (!Array.isArray(raw) || raw.length !== SLOT_COUNT) return null
  const out = raw.map(c => (c && num(c.start) && num(c.end) && c.start >= 0 && c.end > c.start ? { start: c.start, end: c.end } : null))
  return out.every(Boolean) ? out : null
}

/** Клипы по умолчанию для озвучки длиной duration: три слова с равным шагом. Редактор кладёт их, пока автор не расставил точнее */
export function defaultFills(duration) {
  const d = num(duration) && duration > 0 ? duration : 6
  const step = d / (SLOT_COUNT + 0.5)
  return Array.from({ length: SLOT_COUNT }, (_, k) => ({ start: +(step * (k + 0.2)).toFixed(2), end: +(step * (k + 0.2) + Math.min(0.8, step * 0.6)).toFixed(2) }))
}

/**
 * Клипы по таймингам слов ElevenLabs: wordTimings — [{ w, t, e }] (слово, секунда начала и конца). Берёт первые SLOT_COUNT вхождений слова (фраза из нескольких слов — подряд идущие
 * слова); конец клипа — конец слова (e), а если его нет — начало следующего слова или DEFAULT_WORD_MS (не дальше конца файла). Вхождений меньше трёх → null (расставить руками).
 */
export function fillsFromTimings(wordTimings, word, duration = null) {
  const target = tokenize(word)
  if (!target.length || !Array.isArray(wordTimings)) return null
  const toks = wordTimings.map(x => ({ tok: tokenize(x?.w).join(' '), t: x?.t, e: x?.e })).filter(x => x.tok && num(x.t))
  const hits = []
  for (let i = 0; i + target.length <= toks.length && hits.length < SLOT_COUNT; i++) {
    if (target.every((w, k) => toks[i + k].tok === w)) { hits.push(i); i += target.length - 1 }
  }
  if (hits.length < SLOT_COUNT) return null
  return hits.map(i => {
    const start = toks[i].t
    const next = toks[i + target.length]?.t
    const own = toks[i + target.length - 1].e
    const end = num(own) && own > start ? own : num(next) && next > start ? next : start + DEFAULT_WORD_MS / 1000
    return { start: +start.toFixed(2), end: +Math.min(end, num(duration) && duration > start ? duration : end).toFixed(2) }
  })
}

/**
 * План фазы диктора. fills — normalizeFills(...) или null.
 * @returns {{ anchors: number[][], fillAt: number[], fillMs: number[], listenMs: number, audioAt: number|null }}
 *   anchors — опорные точки головы линии [мс, y %]; fillAt — когда слово k началось (мс от старта линии: линия у низа пилюли, пилюля начинает заливаться, звучит слово);
 *   fillMs — сколько слово звучит (пилюля заливается за это время); audioAt — когда включать файл (null — файла нет)
 */
export function makeListenPlan(fills) {
  if (!fills) return { anchors: LISTEN_ANCHORS, fillAt: FILL_AT, fillMs: FILL_AT.map(() => FILL_MS), listenMs: LISTEN_MS, audioAt: null }
  const at = []
  const ms = fills.map(c => Math.min(FILL_MAX_MS, Math.max(FILL_MIN_MS, Math.round((c.end - c.start) * 1000))))
  fills.forEach((c, k) => {
    const want = LEAD_MS + Math.round(c.start * 1000)
    const min = k === 0 ? MIN_FIRST_MS : at[k - 1] + ms[k - 1] + MIN_GAP_MS
    at.push(Math.max(want, min))
  })
  const anchors = buildAnchors(at, ms)
  return { anchors, fillAt: at, fillMs: ms, listenMs: anchors.at(-1)[0] + EXIT_TAIL_MS, audioAt: LEAD_MS }
}
