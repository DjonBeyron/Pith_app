// Раскраска слов Vosk на стенде пилюль (CONCEPT_PILLSTAND.md, «Что слышит Vosk»): каждое слово черновика / итога → класс цвета по смыслу, чтобы на iPhone было видно не вглядываясь, что определил Vosk:
//  ok — слово цели, уже засчитанное (зелёный); back — засчитанное и откаченное (зачёркнуто); extra — слова нет в цели (оранжево-красный: «додумал» / неверное);
//  tgt — слово цели, ещё не засчитанное (цвет вида: итог — яркий, черновик — бледнее). Вид (kind) — 'final' | 'partial'. Состояние засчитанных — по событиям трассы цели до момента t
// (слово → засчитано, откат → снято; последнее событие слова решает). Чистые функции.
import { heardWords, targetSet, inTarget } from './pillStandWords.js'

export const COLOR_LEGEND = [['ok', 'засчитано'], ['final', 'итог'], ['partial', 'черновик'], ['extra', 'нет в цели'], ['back', 'откат']]

/** Засчитанные и откаченные слова: list — [{ t, text, gone }] в любом порядке → { counted: Set, gone: Set } (слова в нормальном виде) */
export function wordState(list) {
  const last = new Map()
  for (const e of [...list].sort((a, b) => a.t - b.t)) for (const w of heardWords(e.text)) last.set(w, !e.gone)
  const counted = new Set(), gone = new Set()
  for (const [w, on] of last) (on ? counted : gone).add(w)
  return { counted, gone }
}

/** Состояние слов на момент t по трассе: события цели, в которой стоит t (word — onWord / откат, listen — счёт слушателя слов); идёт с конца — на живом экране трасса длинная */
export function wordStateAt(events, t = Infinity) {
  let end = events.length
  while (end > 0 && events[end - 1].t > t) end--
  let from = end - 1
  while (from > 0 && events[from].k !== 'target') from--
  const list = []
  for (let i = Math.max(0, from); i < end; i++) {
    const e = events[i]
    if (e.k === 'word') list.push({ t: e.t, text: e.text, gone: !!e.gone })
    else if (e.k === 'listen' && e.seq?.length && e.heard) list.push({ t: e.t, text: e.heard, gone: false })
  }
  return wordState(list)
}

/** Слова строки Vosk → [{ w, c }]: c — 'ok' | 'back' | 'extra' | 'final' | 'partial' */
export function colorWords(text, { kind = 'partial', say = '', counted = new Set(), gone = new Set() } = {}) {
  const set = targetSet(say)
  return heardWords(text).map(w => {
    if (!inTarget(w, set)) return { w, c: 'extra' }
    if (counted.has(w)) return { w, c: 'ok' }
    if (gone.has(w)) return { w, c: 'back' }
    return { w, c: kind === 'final' ? 'final' : 'partial' }
  })
}
