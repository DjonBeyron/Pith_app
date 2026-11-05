import { createWordListener } from '../player/modules/rotate-phone/wordLaneListen.js'
import { getGameMic } from '../../shared/lib/gameMic.js'
import { guardStream } from '../../shared/lib/gameMicGesture.js'
import { gameMicHold } from '../../shared/lib/gameMicHold.js'
import { phraseForms } from '../../shared/lib/speech/speechMatch.js'

// Слушатель «Мини-игры 2.0»: обёртка над слушателем игры (wordLaneListen.js, только Vosk) — тот же путь, что у репетиции (useWordLaneFlow): createWordListener с целями-словами, микрофон из потока игры
// (guardStream(getGameMic): после паузы открывает только тап), isHeld = gameMicHold.active (дорожку глушит сама игра на речь Пита — это не «оглох»), уровень голоса (level) для индикатора микрофона, onDebug для журнала.
// Цели — слова фразы по порядку; слушатель сам приводит их к нижнему регистру и раскрывает «i'm» → «i am» / «i'm» (tokenize, phraseForms). Словарь Vosk закрытый и растёт степенью от числа записей слов,
// поэтому длина высказывания в словаре (maxWords) подбирается под размер фразы (grammarMax); длинная фраза слушается несколькими заходами подряд (слово на стыке может потеряться — CONCEPT_GAME2.md).
// Что делает обёртка сверх слушателя:
//  • каждое засчитанное слово отдаёт событием onHeard({ text, index, at, tap }); считает по ЧИСЛУ засчитанных целей (не по позиции в seq): Vosk на ходу переслушивает черновик («trying» → «i am trying»), и раньше слово,
//    вставшее перед уже отданным, терялось; at — момент прихода (performance.now()), tap — слово «сказано» тапом по пилюле («тап вместо речи»);
//  • ready() — промис «слушатель открыл микрофон и готов» (статус listening; нет модели / ошибка / 4 с — тоже готов, чтобы лента не стояла): лента запускает часы только после него, иначе первые слова фразы уходят
//    в компиляцию словаря и в открытие микрофона; restart() — начать заново на том же потоке (микрофон «не ожил» после глушения, ровный ноль, долгий заход): счётчики обнуляются, лента остаётся.
export const GRAMMAR_MAX = 4        // сколько слов подряд умещает словарь, если записей слов немного
export const GRAMMAR_PHRASES = 1600 // потолок числа фраз словаря: больше — компиляция в телефоне долгая, Vosk тормозит
export const READY_MAX_MS = 4000

/** Сколько фраз в словаре из f записей слов при длине высказывания до m слов: (f+1) + (f+1)² + … */
export const phrasesCount = (f, m) => { let n = 0, p = 1; for (let k = 1; k <= m; k++) { p *= f + 1; n += p } return n }

/** Сколько слов подряд берёт словарь на фразу words: до GRAMMAR_MAX, но не больше GRAMMAR_PHRASES фраз (не меньше 2 — «слово слово» подряд должно распознаваться) */
export function grammarMax(words) {
  const f = new Set(words.flatMap(w => phraseForms(w))).size
  for (let m = Math.min(GRAMMAR_MAX, Math.max(1, words.length)); m > 2; m--) if (phrasesCount(f, m) <= GRAMMAR_PHRASES) return m
  return Math.min(2, Math.max(1, words.length))
}

export function createGame2Listener({ words, expected = words.length, maxWords = null, onHeard, onStatus = null, onDebug = null, listenerRef = null, level = undefined, create = createWordListener, getStream = guardStream(getGameMic), isHeld = gameMicHold.active, now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout }) {
  let cur = null
  let reported = new Map() // номер цели → сколько раз уже отдано
  let tapping = false
  let disposed = false
  let readyDone = null
  const ready = new Promise(r => { readyDone = r })
  const readyTimer = setTimer(() => readyDone('timeout'), READY_MAX_MS)
  const settle = why => { clearTimer(readyTimer); readyDone(why) }

  function build() {
    reported = new Map()
    const mine = create({
      targets: words, expected: Math.max(1, expected), maxWords: maxWords ?? grammarMax(words), level, getStream, isHeld, onDebug,
      onChange: ({ status, seq }) => {
        if (disposed || cur !== mine) return
        onStatus?.(status)
        if (status === 'listening' || status === 'unavailable' || status === 'error') settle(status)
        const counts = new Map()
        for (const k of seq) counts.set(k, (counts.get(k) ?? 0) + 1)
        for (const [k, c] of counts) for (let n = reported.get(k) ?? 0; n < c; n++) { reported.set(k, n + 1); onHeard({ text: words[k], index: k, at: now(), tap: tapping }) }
        if (status === 'timeout') api.restart() // слушатель отработал своё время (120 с): новый, счёт режима начинается заново
      },
    })
    cur = mine
    if (listenerRef) listenerRef.current = mine
    return mine
  }
  const api = {
    start: () => build().start(),
    /** Начать слушать заново (микрофон переоткрыт или слушатель «оглох»): прежний закрывается, счёт слов обнуляется, лента не трогается */
    restart() {
      if (disposed) return
      try { cur?.dispose() } catch { /* уже свободен */ }
      build().start()
    },
    /** «Тап вместо речи»: слово words[index] считается сказанным сейчас */
    tap(index) { tapping = true; try { cur?.tap(index) } finally { tapping = false } },
    ready: () => ready,
    available: () => !!cur?.available(),
    dispose() {
      disposed = true; clearTimer(readyTimer); readyDone('disposed')
      if (listenerRef && listenerRef.current === cur) listenerRef.current = null
      try { cur?.dispose() } catch { /* уже свободен */ }
    },
  }
  return api
}
