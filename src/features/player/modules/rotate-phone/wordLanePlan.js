// План фазы диктора: когда звучит слово и когда линия доходит до слоёв. Чистые функции — их же использует редактор таймлайна (canvas/word-lane).
// Два источника: без озвучки автора — фиксированное расписание wordLaneTimeline (голос — слово из библиотеки/система); с озвучкой ElevenLabs — таймлайн ноды `fills`
// [{start, end}] ×3 (секунды ОТ НАЧАЛА ФАЙЛА): слой k начинает заливаться, когда в файле звучит k-е слово, и заливается столько, сколько длится клип.
// Линия стартует раньше звука на LEAD_MS (ей нужно разойтись по дорожкам), файл включается через LEAD_MS после старта линии.
import { SLOT_COUNT, SLOTS, LINE_START_Y, LINE_END_Y, LISTEN_ANCHORS, FILL_AT, FILL_MS, LISTEN_MS, EXIT_TAIL_MS } from './wordLaneTimeline.js'
import { tokenize } from '../../../../shared/lib/speech/speechMatch.js'

export const LEAD_MS = 1200          // линия идёт, звук ещё молчит
export const MIN_FIRST_MS = 900      // первый слой не раньше — линия не успевает дойти
export const MIN_GAP_MS = 700        // слои не чаще — заливка предыдущего должна читаться
export const FILL_MIN_MS = 400
export const FILL_MAX_MS = 1600
export const EXIT_MS = 1200          // после третьей заливки линия уходит за экран
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
 * Клипы по таймингам слов ElevenLabs: wordTimings — [{ w, t }] (слово и секунда начала). Берёт первые SLOT_COUNT вхождений слова (фраза из нескольких слов — подряд идущие
 * слова); конец клипа — начало следующего слова, у последнего — конец файла или DEFAULT_WORD_MS. Вхождений меньше трёх → null (расставить руками).
 */
export function fillsFromTimings(wordTimings, word, duration = null) {
  const target = tokenize(word)
  if (!target.length || !Array.isArray(wordTimings)) return null
  const toks = wordTimings.map(x => ({ tok: tokenize(x?.w).join(' '), t: x?.t })).filter(x => x.tok && num(x.t))
  const hits = []
  for (let i = 0; i + target.length <= toks.length && hits.length < SLOT_COUNT; i++) {
    if (target.every((w, k) => toks[i + k].tok === w)) { hits.push(i); i += target.length - 1 }
  }
  if (hits.length < SLOT_COUNT) return null
  return hits.map(i => {
    const start = toks[i].t
    const next = toks[i + target.length]?.t
    const end = num(next) && next > start ? next : start + DEFAULT_WORD_MS / 1000
    return { start: +start.toFixed(2), end: +Math.min(end, num(duration) && duration > start ? duration : end).toFixed(2) }
  })
}

/**
 * План фазы диктора. fills — normalizeFills(...) или null.
 * @returns {{ anchors: number[][], fillAt: number[], fillMs: number[], listenMs: number, audioAt: number|null }}
 *   anchors — опорные точки головы линии [мс, y %]; fillAt — когда слой k начинает заливаться (мс от старта линии); fillMs — длительность заливки; audioAt — когда включать файл (null — файла нет)
 */
export function makeListenPlan(fills) {
  if (!fills) return { anchors: LISTEN_ANCHORS, fillAt: FILL_AT, fillMs: FILL_AT.map(() => FILL_MS), listenMs: LISTEN_MS, audioAt: null }
  const at = []
  fills.forEach((c, k) => {
    const want = LEAD_MS + Math.round(c.start * 1000)
    const min = k === 0 ? MIN_FIRST_MS : at[k - 1] + MIN_GAP_MS
    at.push(Math.max(want, min))
  })
  const fillMs = fills.map(c => Math.min(FILL_MAX_MS, Math.max(FILL_MIN_MS, Math.round((c.end - c.start) * 1000))))
  const last = at[SLOT_COUNT - 1]
  const anchors = [[0, LINE_START_Y], ...at.map((t, k) => [t, SLOTS[k].y]), [last + EXIT_MS, LINE_END_Y]]
  return { anchors, fillAt: at, fillMs, listenMs: last + EXIT_MS + EXIT_TAIL_MS, audioAt: LEAD_MS }
}
