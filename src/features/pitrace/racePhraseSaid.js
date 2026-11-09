// Слова хода «Скажи» (racePhraseScene.js; вынесено из сцены 2026-11-09 — она на 249 строках): что из фразы-цели услышано, по событиям слушателя onWord (racePhraseListen.js).
// lit — номера услышанных слов (доля для продления у края и зачёта), heard — номер → подтверждено ли (маска, подсказка, неверное слово), fill — для линии заливки (racePhraseFill.markWord),
// times — номер → когда впервые услышано (проход 2: паузы; журнал «→ 100 %»; продление у края в проходе 1 — продвигается ли ученик).
// ОТКАТ (2026-11-09, журнал владельца v3.3.176, «Nice to meet you», проход 1: первый черновик «meet» вместо «nice» — «meet» засчитано навсегда, линия перепрыгнула его место): слушатель
// в проходе 1 отдаёт onWord с gone: true, когда черновое слово выпало из услышанного по порядку, — слово забывается везде (кирпичик снова закрыт, подсказка возвращается на него,
// линия плавно отходит назад — wordLaneFillView, вниз 1,2/с). Подтверждённое итогом слово слушатель не откатывает.
import { markWord } from './racePhraseFill.js'

export function createSaid() {
  let lit, heard, fill, times
  const reset = () => { lit = new Set(); heard = new Map(); fill = new Map(); times = new Map() }
  reset()
  return {
    /** onWord слушателя: { index, draft, gone? }; t — сейчас */
    word(e, t) {
      const i = e.index
      if (e.gone) { lit.delete(i); heard.delete(i); fill.delete(i); times.delete(i); return }
      lit.add(i); markWord(fill, i, e.draft, t); if (!times.has(i)) times.set(i, t)
      if (!e.draft || !heard.has(i)) heard.set(i, !e.draft)
      for (const [j, full] of heard) if (!full && j < i) heard.set(j, true) // слова до него — подтверждены (их перекрыло следующее)
    },
    reset,
    count: () => lit.size,
    heard: () => heard,
    fill: () => fill,
    times: () => [...times.values()],
    /** Когда впервые услышано самое позднее из слов (null — ни одного) */
    last: () => (times.size ? Math.max(...times.values()) : null),
  }
}
