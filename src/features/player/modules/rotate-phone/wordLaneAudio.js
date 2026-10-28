// Озвучка диктора для игры: какие высказывания надо записать, как найти в записи клип каждого куска и как играть запись. Чистые функции (без DOM), проверяются тестами.
// Запись ElevenLabs — ОДИН файл, в котором каждое нужное высказывание звучит один раз: у фразы из трёх кусков «I'm. trying. to learn. I'm trying. I'm trying to learn.» (куски 0, 1, 2, 0+1, 0+1+2);
// у фразы из двух — «A. B. A B.»; у одного слова — «w. w. w.» (три записи, по одной на повтор). Тайминги слов (ElevenLabs отдаёт начало и конец каждого слова) режут файл на клипы кусков.
// Ступень проигрывает нужное высказывание три раза (перемоткой в файле), а клип каждого куска задаёт, когда пилюля куска заливается.
import { SLOT_COUNT } from './wordLaneTimeline.js'
import { keyOf, buildParts, textOf } from './wordLaneRecipe.js'

const num = v => typeof v === 'number' && Number.isFinite(v)
const wordsIn = s => String(s ?? '').trim().split(/\s+/).filter(Boolean)

/** Какие высказывания нужны в записи, по порядку: массив номеров кусков. Одно слово — три одинаковых */
export const utterances = n => (n <= 1 ? Array.from({ length: SLOT_COUNT }, () => [0]) : buildParts(n))

/** Текст для генерации озвучки: высказывания через точку */
export const phraseScript = chunks => utterances(chunks.length).map(parts => `${textOf(chunks, parts)}.`).join(' ')

/** Запас тишины перед первым словом высказывания, с: воспроизведение начинается чуть раньше слова (иначе обрежется его начало) */
export const LEAD_IN_S = 0.06
/** Запас после последнего слова, с */
export const TAIL_S = 0.08

/**
 * Тайминги слов ElevenLabs [{ w, t, e }] → клипы по высказываниям: [ [ {start,end} на каждый кусок ] на каждое высказывание ] или null, если слов не хватает. Два случая:
 *  1) в записи есть ВСЕ высказывания рецепта по порядку (utterances(): «I'm. trying. I'm trying. to learn. I'm trying to learn.») — каждому высказыванию свои клипы;
 *  2) в записи ТОЛЬКО ФРАЗА целиком («I'm trying to learn.») — клипы кусков берутся из неё, а высказывание из нескольких кусков — подряд идущие куски той же записи (куски фразы идут
 *     подряд, поэтому любое сочетание «1», «2», «1+2», «3», «1+2+3» — непрерывный отрезок). Так достаточно озвучить фразу один раз.
 * Сколько слов в куске — столько берём (слово = то, что между пробелами в тексте куска). Конец слова — e, а без него — начало следующего слова (или +0,6 с).
 */
export function clipsFromTimings(timings, chunks, duration = null) {
  if (!Array.isArray(timings) || !chunks?.length) return null
  const toks = timings.filter(x => x && num(x.t))
  const clipOf = (at, k) => {
    const first = toks[at]
    const last = toks[at + k - 1]
    const next = toks[at + k]
    const end = num(last.e) && last.e > first.t ? last.e : num(next?.t) && next.t > first.t ? next.t : first.t + 0.6
    return { start: +first.t.toFixed(3), end: +Math.min(end, num(duration) && duration > first.t ? duration : end).toFixed(3) }
  }
  const per = chunks.map(c => wordsIn(c).length)
  const full = utterances(chunks.length).flat().reduce((a, i) => a + per[i], 0)
  if (toks.length >= full) {
    let at = 0
    return utterances(chunks.length).map(parts => parts.map(i => { const c = clipOf(at, per[i]); at += per[i]; return c }))
  }
  const phrase = per.reduce((a, k) => a + k, 0)
  if (toks.length < phrase) return null
  let at = 0
  const byChunk = per.map(k => { const c = clipOf(at, k); at += k; return c })
  return utterances(chunks.length).map(parts => parts.map(i => byChunk[i]))
}

/** Клипы одного слова из старого таймлайна fills ([{start,end}] ×3): высказывание r — клип fills[r] */
export const clipsFromFills = fills => (Array.isArray(fills) && fills.length === SLOT_COUNT ? fills.map(f => [f]) : null)

/**
 * Клипы куска(ов) для повтора repIdx ступени с кусками parts: [{start,end} на каждый кусок] или null (нет записи — голос системы, длительности по оценке).
 * clips — результат clipsFromTimings / clipsFromFills, n — число кусков фразы.
 */
export function clipsFor(clips, n, parts, repIdx) {
  if (!clips) return null
  if (n <= 1) return clips[repIdx % clips.length] ?? null           // одно слово: у каждого повтора своя запись
  const row = utterances(n).findIndex(p => keyOf(p) === keyOf(parts)) // фраза: высказывание с теми же кусками
  return row >= 0 ? clips[row] ?? null : null
}

/** Отрезок файла для воспроизведения высказывания: от запаса перед первым словом до запаса после последнего (секунды) */
export const playSpan = row => ({ start: Math.max(0, row[0].start - LEAD_IN_S), end: row.at(-1).end + TAIL_S })

/** Оценка длительности куска без записи, мс: по числу слов */
export const EST_WORD_MS = 420
export const estChunkMs = text => Math.max(320, wordsIn(text).length * EST_WORD_MS)
