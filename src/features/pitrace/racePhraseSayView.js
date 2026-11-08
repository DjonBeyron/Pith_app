// Вид хода «Скажи» по проходам (racePhraseScene.js, одна пилюля на ход): что делают с маской и заливкой слова и голос слушателя фраз.
//  • Проход 1 — маска-кирпичики снимается по словам (черновик — бледно), заливка — по словам до границ (racePhraseFill.fillGoal), подсказка следующего слова по буквам (racePhrasePeek.js)
//    начинается с первого голоса или слова.
//  • Проход 2 — текст открыт ВСЕГДА (маску не трогаем: раньше mask.set по услышанным словам снова прятал неуслышанные), заливка «под звук» (racePhraseVoiceFill.js): непрерывно, пока слышен голос,
//    с якорями на границах услышанных слов. Итог фразы (done) — 100 % в обоих проходах.
import { fillGoal } from './racePhraseFill.js'
import { createPeek } from './racePhrasePeek.js'
import { createVoiceFill, isVoice } from './racePhraseVoiceFill.js'

/** → { word(index, heard, t), level(rms, held, t), goal({ t, dt, words, done, shown }), frame(t) }. pass — 1 | 2, text — фраза, n — слов, mask — маска пилюли (racePhraseMaskView) или null */
export function createSayView({ pass, text, n, mask, log = () => {} }) {
  const two = pass === 2
  const peek = !two && mask ? createPeek({ mask, text }) : null
  const voice = two ? createVoiceFill({ n, log }) : null
  return {
    /** Слово цели услышано: heard — Map номер слова → подтверждено ли (сцена уже обновила) */
    word(index, heard, t) {
      if (two) return voice.word(index)
      if (peek) peek.start(heard, t); else mask?.set(heard)
    },
    /** Кусок звука микрофона: проход 2 — голос для заливки, проход 1 — первый голос начинает подсказку */
    level(rms, held, t, heard) {
      if (two) return voice.level(rms, held, t)
      if (peek && !peek.started() && isVoice(rms, held)) peek.start(heard, t)
    },
    /** Цель заливки на кадр: words — слова для заливки прохода 1 (Map, racePhraseFill.markWord), done — итог фразы */
    goal({ t, dt, words, done, shown }) {
      const edges = mask?.edges() ?? null
      return two ? voice.goal({ t, dt, edges, done, shown }) : fillGoal({ words, n, done, edges })
    },
    frame(t) { peek?.frame(t) },
    peekIndex: () => peek?.index() ?? -1,
  }
}
