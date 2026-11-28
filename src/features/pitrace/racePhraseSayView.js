// Вид хода «Скажи» по проходам (racePhraseScene.js, одна пилюля на ход): что делают с маской и заливкой распознанные слова. Заливка — ТОЛЬКО по распознанным словам цели в обоих проходах
// (решение владельца 2026-11-08: шум и посторонний голос пилюлю не заливают; уровень микрофона сюда больше не приходит).
//  • Проход 1 — маска-кирпичики снимается по словам ПО ПОРЯДКУ: услышанное слово (и черновиком) — целиком белое, если все слова до него сказаны (слово «вперёд» остаётся кирпичиком, 2026-11-09:
//    ложное «meet» первым черновиком не белеет); откат слова (gone) — снова кирпичик, подсказка возвращается на него; заливка — по словам до границ, по непрерывному префиксу сказанных (racePhraseFill.fillGoal, saidPrefix: слово «вперёд» линию не двигает); подсказка — слово сразу за
//    сказанным проявляется целым словом до 20 % (racePhrasePeek.js; до первого слова подсказки нет); неверное слово (racePhraseWrongWord.js) — рывок кромки красным (racePhraseNudge.js),
//    заливка не меняется, журнал «[fill] неверное слово «…», ждём «…»» (onWrong — racePhraseSayTrace.wrong).
//  • Проход 2 — текст открыт ВСЕГДА (маску не трогаем), подсказки и рывка нет; заливка по словам одним движением, без ступенек (racePhraseGlide.js). Итог фразы (done) — 100 % в обоих проходах.
import { fillGoal, edgeAt, LAST_WORD_CAP } from './racePhraseFill.js'
import { createPeek, lineReached } from './racePhrasePeek.js'
import { createGlide } from './racePhraseGlide.js'
import { createWrongWord, WRONG_GAP_MS, VOICE_SOFT } from './racePhraseWrongWord.js'
import { createNudge } from './racePhraseNudge.js'
import { phraseWords } from './racePhraseData.js'

// ЗАЛИТО ДО КРАЯ БЕЗ ЗАЧЁТА (2026-11-28, владелец v3.3.394: «полностью заполнился, но не улетал — это вводит в заблуждение»): все слова сказаны (линия у LAST_WORD_CAP), а слух фразу не принял за FULL_WAIT_MS — линия отходит к границе
// перед последним словом: у края пилюля стоит только пока зачёт вот-вот придёт (обычно 0–400 мс). Принят итог — доезд до 100 % и взлёт как всегда; проверка слуха не меняется.
export const FULL_WAIT_MS = 800
export const RED_SIGNAL_GAP_MS = 700

const white = heard => { const m = new Map(); for (let i = 0; heard.has(i); i++) m.set(i, true); return m } // проход 1: сказанное слово — целиком (замечание владельца: «слово полностью белое»), только непрерывный префикс — как линия

/**
 * → { word(index, heard, t), ear(e), goal({ t, words, done }), frame(t, done), peekIndex(), stop() }. pass — 1 | 2, text — фраза, n — слов, mask — маска пилюли (racePhraseMaskView) или null;
 * nudge(on) — поставить / снять data-nudge на пилюле, el — её узел (animationend); onWrong(word, expect) — журнал неверного слова
 */
export function createSayView({ pass, text, n, mask, log = () => {}, nudge = null, el = null, onWrong = () => {}, onRed = null }) {
  const two = pass === 2
  const peek = !two && mask ? createPeek({ mask, text }) : null
  const glide = two ? createGlide({ n, log }) : null
  const wrong = createWrongWord({ words: phraseWords(text), fast: two }) // подпись неверного слова — в обоих проходах (v3.3.277: в проходе 2 её не было), рывок кромки — только в проходе 1
  const jerk = !two && nudge ? createNudge({ mark: nudge, el, log }) : null
  let fullAt = null, backed = false // fullAt — когда цель впервые дошла до LAST_WORD_CAP без итога; backed — линия отведена (журнал один раз)
  let said = new Map(), jerkAt = -Infinity, redAt = null, redSigAt = -Infinity // redSigAt — когда в последний раз давали сигнал уровня пилюли (RED_SIGNAL_GAP_MS) // redAt — номер слова, красного сейчас (для журнала «красное снято»)
  return {
    /** Слово цели услышано (gone — откат, проход 1): heard — Map номер слова → подтверждено ли (сцена уже обновила) */
    word(index, heard, t, gone = false) {
      said = heard
      if (redAt != null && heard.has(redAt)) { log(`[fill] красное «${phraseWords(text)[redAt] ?? ''}» снято: слово сказано`); redAt = null }
      if (two) return gone ? undefined : glide.word(index, t)
      if (peek) peek.show(white(heard), t); else mask?.set(white(heard))
    },
    /** Слух (onEar слушателя): сырые слова — для правила неверного слова */
    ear(e) { wrong?.ear(e) },
    /** Цель заливки на кадр: words — слова для заливки прохода 1 (Map, racePhraseFill.markWord), done — итог фразы */
    goal({ t, words, done }) {
      const edges = mask?.edges() ?? null
      const g = two ? glide.goal({ t, edges, done }) : fillGoal({ words, n, done, edges })
      if (done || n < 2 || g < LAST_WORD_CAP - 1e-9) { fullAt = null; if (backed && !done) { backed = false } return g }
      fullAt ??= t
      if (t - fullAt < FULL_WAIT_MS) return g
      if (!backed) { backed = true; log(`[fill] слова все сказаны, зачёта нет ${Math.round(t - fullAt)} мс — заливка не стоит у края, отхожу к границе перед последним словом`) }
      return edgeAt(n - 1, n, edges)
    },
    /** Кадр: проявление подсказки; неверное слово (пока нет итога) — рывок кромки */
    frame(t, done = false, fill = 1) {
      const k = peek?.index() ?? -1, e = mask?.edges?.() ?? null
      peek?.frame(t, lineReached(fill, k, e, n)) // кирпичик слова k гаснет, когда линия заливки дошла до него (владелец, v3.3.275)
      const miss = wrong?.check(said, t), shown = wrong?.shown()
      if (wrong?.retracted()) mask?.unwrong?.() // итог захода не подтвердил слово из черновика — подпись «сказано вместо» снимаем
      let kw = 0; while (said.has(kw)) kw++ // первое несказанное слово — его и красим
      const mark = why => { if (mask?.missing?.(kw)) { redAt = kw; log(`[fill] ${why}: «${phraseWords(text)[kw] ?? ''}» красным`); if (two && onRed && t - redSigAt >= RED_SIGNAL_GAP_MS) { redSigAt = t; onRed() } } } // проход 2 (v3.3.402): красное слово на движущейся пилюле не видно — первое появление даёт сигнал всей пилюле (красная обводка, дрожь, слабый налив), не чаще раза в RED_SIGNAL_GAP_MS; заливку и рывок не трогает // v3.3.305 (владелец): над пилюлей ничего не пишем, ожидаемое слово — красным на своём месте
      const soft = shown === VOICE_SOFT && !miss // громкий голос без слов цели: красное слово, но без рывка (мягче, чем при распознанном неверном слове)
      if (shown) mark(soft ? 'громкий голос без слов цели' : `сказано «${shown}»`)
      if (miss && !done) { onWrong(miss.word, miss.expect); mark(`неверное слово «${miss.word}»`) } // неверное слово — красное ожидаемое слово
      if ((shown || miss) && !soft && !done) { // рывок на КАЖДОЕ неверное слово (проход 1), в том числе слово цели не на своём месте («you» вместо «are»); в журнале — и когда он не сработал (проход 2 / частота), чтобы было видно «почему не дёрнулось»
        const why = miss ? `неверное слово «${miss.word}»` : `сказано «${shown}»`
        if (!jerk) log(`[fill] рывка нет (проход 2): ${why}`)
        else if (t - jerkAt >= WRONG_GAP_MS) { jerkAt = t; log(`[fill] рывок кромки: ${why}, заливка ${Number(fill).toFixed(2).replace('.', ',')}`); jerk.fire(fill) }
        else log(`[fill] рывок пропущен: ${why}, с прошлого ${Math.round(t - jerkAt)} мс < ${WRONG_GAP_MS}`)
      }
    },
    edges: () => mask?.edges() ?? null,
    peekIndex: () => peek?.index() ?? -1,
    stop() { jerk?.stop() },
  }
}
