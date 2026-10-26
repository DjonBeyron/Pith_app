// План фазы диктора: когда звучит слово и где в этот момент пилюля. Чистые функции — их же использует редактор таймлайна (canvas/word-lane).
// Два источника: без озвучки автора — фиксированное расписание wordLaneTimeline (голос — слово из библиотеки/система); с озвучкой ElevenLabs — таймлайн ноды `fills`
// [{start, end}] ×3 (секунды ОТ НАЧАЛА ФАЙЛА): начало клипа = начало слова, конец клипа = конец слова. Время слов НЕ ПОДВИГАЕТСЯ (раньше слова, стоящие близко, раздвигались, и пилюля
// расходилась со звуком): конвейер движется с постоянной скоростью, пилюли разных дорожек спокойно перекрываются по времени. Файл включается через audioAt (lead) после старта фазы — ровно столько,
// чтобы первая пилюля успела выкатиться (leadFor): слово 0 приходится на центр экрана. Время файла и пилюль связаны одной формулой: t = LEAD_MS + секунда файла × 1000 (wordLaneClock.js
// держит эту связь по реальному звуку, а не по таймеру).
import { SLOT_COUNT, WORD_AT, WORD_LEN, LISTEN_MS, leadFor, listenEnd, makeFillCurve, fillProfile } from './wordLaneTimeline.js'
import { tokenize } from '../../../../shared/lib/speech/speechMatch.js'

export const MIN_WORD_MS = 250          // короче слово не бывает: иначе заливка и щелчок слиплись бы
export const DEFAULT_WORD_MS = 800      // длина клипа, если у слова не известен конец

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
 * Громкость голоса диктора в момент t (мс от старта фазы), 0…1 — ею открывается рот кота. С озвучкой автора — по реальной громкости файла (waveformData), без — пульсация
 * на время каждого слова плана. Вне слов — 0.
 */
export function makeMouthLevel(at, ms, audio, audioAt) {
  const wave = audio?.wave
  const peak = Array.isArray(wave) && wave.length ? Math.max(...wave, 1e-9) : 0
  const per = peak && audio.duration > 0 ? wave.length / audio.duration : 0
  return t => {
    if (per && audioAt != null) {
      const i = Math.floor(((t - audioAt) / 1000) * per)
      return i >= 0 && i < wave.length ? Math.min(1, (wave[i] / peak) * 1.2) : 0
    }
    for (let k = 0; k < at.length; k++) if (t >= at[k] && t < at[k] + ms[k]) return 0.45 + 0.4 * (0.5 + 0.5 * Math.sin((t - at[k]) / 85))
    return 0
  }
}

/**
 * План фазы диктора. fills — normalizeFills(...) или null; audio — { wave, duration } озвучки автора (нужно для кривой заливки), необязательно.
 * @returns {{ fillAt: number[], fillMs: number[], curves: Array<Function|null>, profiles: number[][], mouth: Function, listenMs: number, audioAt: number|null }}
 *   fillAt — когда слово k началось (мс от старта фазы); fillMs — сколько оно звучит; curves — кривая заливки по громкости (или null — линейно); profiles — «тень» слова для
 *   подсказки ученику; mouth(t) — громкость диктора для рта кота; listenMs — когда фаза кончилась (конец последнего слова + END_TAIL_MS); audioAt — когда включать файл (null — файла нет)
 */
export function makeListenPlan(fills, audio = null) {
  if (!fills) {
    const curves = WORD_AT.map(() => null)
    return { fillAt: WORD_AT, fillMs: WORD_LEN, curves, profiles: curves.map(c => fillProfile(c)), mouth: makeMouthLevel(WORD_AT, WORD_LEN, null, null), listenMs: LISTEN_MS, audioAt: null }
  }
  const ms = fills.map(c => Math.max(MIN_WORD_MS, Math.round((c.end - c.start) * 1000)))
  const lead = Math.round(Math.max(0, leadFor(ms[0]) - fills[0].start * 1000) + 100) // первая пилюля успевает выкатиться
  const at = fills.map(c => lead + Math.round(c.start * 1000))
  const curves = fills.map(c => makeFillCurve(audio?.wave, audio?.duration, c.start, c.end))
  return { fillAt: at, fillMs: ms, curves, profiles: curves.map(c => fillProfile(c)), mouth: makeMouthLevel(at, ms, audio, lead), listenMs: listenEnd(at, ms), audioAt: lead }
}
