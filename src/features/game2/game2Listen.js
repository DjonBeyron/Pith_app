import { createWordListener } from '../player/modules/rotate-phone/wordLaneListen.js'
import { getGameMic } from '../../shared/lib/gameMic.js'
import { guardStream } from '../../shared/lib/gameMicGesture.js'
import { gameMicHold } from '../../shared/lib/gameMicHold.js'

// Слушатель «Мини-игры 2.0»: обёртка над слушателем игры (wordLaneListen.js, только Vosk). Цели — слова фразы по порядку, словарь Vosk закрытый (слова фразы и [unk]). Каждое новое слово в seq
// слушателя превращается в событие onHeard({ text, index, at, tap }): at — момент прихода (performance.now()), tap — слово «сказано» тапом по пилюле (режим «тап вместо речи» — слушатель.tap).
// Микрофон слушатель берёт из потока игры (guardStream: после паузы микрофон открывает только тап). Словарь растёт степенью от длины фразы, поэтому за один заход — не больше GRAMMAR_MAX слов;
// длинная фраза слушается несколькими заходами подряд (слово на стыке заходов может потеряться — известное ограничение, CONCEPT_GAME2.md).
export const GRAMMAR_MAX = 4

/** Сколько слов подряд умещает словарь на фразу из n слов */
export const grammarMax = n => Math.max(1, Math.min(n, GRAMMAR_MAX))

export function createGame2Listener({ words, expected = words.length, onHeard, onStatus = null, listenerRef = null, create = createWordListener, getStream = guardStream(getGameMic), isHeld = gameMicHold.active, now = () => performance.now() }) {
  let seen = 0
  let tapping = false
  const l = create({
    targets: words, expected: Math.max(1, expected), maxWords: grammarMax(words.length), getStream, isHeld,
    onChange: ({ status, seq }) => {
      onStatus?.(status)
      for (; seen < seq.length; seen++) onHeard({ text: words[seq[seen]], index: seq[seen], at: now(), tap: tapping })
    },
  })
  if (listenerRef) listenerRef.current = l
  return {
    start: () => l.start(),
    /** «Тап вместо речи»: слово words[index] считается сказанным сейчас */
    tap(index) { tapping = true; try { l.tap(index) } finally { tapping = false } },
    available: () => l.available(),
    dispose() { if (listenerRef?.current === l) listenerRef.current = null; l.dispose() },
  }
}
