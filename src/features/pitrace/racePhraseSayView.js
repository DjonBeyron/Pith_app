// Вид хода «Скажи» по проходам (racePhraseScene.js, одна пилюля на ход): что делают с маской и заливкой распознанные слова. Заливка — ТОЛЬКО по распознанным словам цели в обоих проходах
// (решение владельца 2026-11-08: шум и посторонний голос пилюлю не заливают; уровень микрофона сюда больше не приходит).
//  • Проход 1 — маска-кирпичики снимается по словам: услышанное слово (и черновиком) — целиком белое; заливка — по словам до границ, по непрерывному префиксу сказанных (racePhraseFill.fillGoal, saidPrefix: слово «вперёд» линию не двигает); подсказка — слово сразу за
//    сказанным проявляется целым словом до 20 % (racePhrasePeek.js; до первого слова подсказки нет); неверное слово (racePhraseWrongWord.js) — рывок кромки красным (racePhraseNudge.js),
//    заливка не меняется, журнал «[fill] неверное слово «…», ждём «…»» (onWrong — racePhraseSayTrace.wrong).
//  • Проход 2 — текст открыт ВСЕГДА (маску не трогаем), подсказки и рывка нет; заливка по словам одним движением, без ступенек (racePhraseGlide.js). Итог фразы (done) — 100 % в обоих проходах.
import { fillGoal } from './racePhraseFill.js'
import { createPeek } from './racePhrasePeek.js'
import { createGlide } from './racePhraseGlide.js'
import { createWrongWord } from './racePhraseWrongWord.js'
import { createNudge } from './racePhraseNudge.js'
import { phraseWords } from './racePhraseData.js'

const white = heard => new Map([...heard.keys()].map(i => [i, true])) // проход 1: сказанное слово — целиком (замечание владельца: «слово полностью белое»)

/**
 * → { word(index, heard, t), ear(e), goal({ t, words, done }), frame(t, done), peekIndex(), stop() }. pass — 1 | 2, text — фраза, n — слов, mask — маска пилюли (racePhraseMaskView) или null;
 * nudge(on) — поставить / снять data-nudge на пилюле, el — её узел (animationend); onWrong(word, expect) — журнал неверного слова
 */
export function createSayView({ pass, text, n, mask, log = () => {}, nudge = null, el = null, onWrong = () => {} }) {
  const two = pass === 2
  const peek = !two && mask ? createPeek({ mask, text }) : null
  const glide = two ? createGlide({ n, log }) : null
  const wrong = !two ? createWrongWord({ words: phraseWords(text) }) : null
  const jerk = !two && nudge ? createNudge({ mark: nudge, el }) : null
  let said = new Map()
  return {
    /** Слово цели услышано: heard — Map номер слова → подтверждено ли (сцена уже обновила) */
    word(index, heard, t) {
      said = heard
      if (two) return glide.word(index, t)
      if (peek) peek.show(white(heard), t); else mask?.set(white(heard))
    },
    /** Слух (onEar слушателя): сырые слова — для правила неверного слова */
    ear(e) { wrong?.ear(e) },
    /** Цель заливки на кадр: words — слова для заливки прохода 1 (Map, racePhraseFill.markWord), done — итог фразы */
    goal({ t, words, done }) {
      const edges = mask?.edges() ?? null
      return two ? glide.goal({ t, edges, done }) : fillGoal({ words, n, done, edges })
    },
    /** Кадр: проявление подсказки; неверное слово (пока нет итога) — рывок кромки */
    frame(t, done = false) {
      peek?.frame(t)
      const miss = wrong?.check(said, t)
      if (miss && !done) { jerk?.fire(); onWrong(miss.word, miss.expect) }
    },
    peekIndex: () => peek?.index() ?? -1,
    stop() { jerk?.stop() },
  }
}
