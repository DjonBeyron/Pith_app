// Таймлайн одного слова (старый формат ноды, редактор canvas/word-lane): `fills` — три клипа [{start, end}] (секунды ОТ НАЧАЛА ФАЙЛА): запись «слово. слово. слово.», клип = одно проговаривание.
// Для фраз из нескольких кусков клипы считает wordLaneAudio.clipsFromTimings; план диктора — wordLaneDictor.
import { SLOT_COUNT } from './wordLaneTimeline.js'
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
