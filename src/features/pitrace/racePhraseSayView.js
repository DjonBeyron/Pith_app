// Вид хода «Скажи» по проходам (racePhraseScene.js, одна пилюля на ход): что делают с маской и заливкой распознанные слова. Заливка — ТОЛЬКО по распознанным словам цели в обоих проходах
// (решение владельца 2026-11-08: шум и посторонний голос пилюлю не заливают; уровень микрофона сюда больше не приходит).
//  • Проход 1 — маска-кирпичики снимается по словам: услышанное слово (и черновиком) — целиком белое; заливка — по словам до границ (racePhraseFill.fillGoal); подсказка следующего слова
//    по буквам (racePhrasePeek.js) — с первого кадра пилюли.
//  • Проход 2 — текст открыт ВСЕГДА (маску не трогаем), подсказки нет; заливка по словам одним движением, без ступенек (racePhraseGlide.js). Итог фразы (done) — 100 % в обоих проходах.
import { fillGoal } from './racePhraseFill.js'
import { createPeek } from './racePhrasePeek.js'
import { createGlide } from './racePhraseGlide.js'

const white = heard => new Map([...heard.keys()].map(i => [i, true])) // проход 1: сказанное слово — целиком (замечание владельца: «слово полностью белое»)

/** → { word(index, heard, t), goal({ t, words, done }), frame(t), peekIndex() }. pass — 1 | 2, text — фраза, n — слов, mask — маска пилюли (racePhraseMaskView) или null, t — кадр появления пилюли */
export function createSayView({ pass, text, n, mask, t = 0, log = () => {} }) {
  const two = pass === 2
  const peek = !two && mask ? createPeek({ mask, text, t }) : null
  const glide = two ? createGlide({ n, log }) : null
  return {
    /** Слово цели услышано: heard — Map номер слова → подтверждено ли (сцена уже обновила) */
    word(index, heard, t) {
      if (two) return glide.word(index, t)
      if (peek) peek.show(white(heard), t); else mask?.set(white(heard))
    },
    /** Цель заливки на кадр: words — слова для заливки прохода 1 (Map, racePhraseFill.markWord), done — итог фразы */
    goal({ t, words, done }) {
      const edges = mask?.edges() ?? null
      return two ? glide.goal({ t, edges, done }) : fillGoal({ words, n, done, edges })
    },
    frame(t) { peek?.frame(t) },
    peekIndex: () => peek?.index() ?? -1,
  }
}
