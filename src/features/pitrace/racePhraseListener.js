// Какой слушатель фраз берёт сцена этапа 2 (racePhraseScene.js): настоящий createPhraseListener из racePhraseListen.js (контракт этапа 2: Vosk, словарь из слов всех кандидатов) с игровым
// микрофоном, английской моделью и окном речи Пита по умолчанию. setPhraseListener(factory) — стенд и тесты подставляют свой (подставной racePhraseListenStub.js: речь подаёт драйвер).
import { createPhraseListener, PHRASE_OK } from './racePhraseListen.js'
import { getGameMic } from '../../shared/lib/gameMic.js'
import { gameMicHold } from '../../shared/lib/gameMicHold.js'
import { guardStream } from '../../shared/lib/gameMicGesture.js'

export { PHRASE_OK }
let forced = null

/** Подставить фабрику слушателя (null — снова настоящий) */
export const setPhraseListener = factory => { forced = factory }

/** Фабрика: подставленная или настоящая */
export const phraseFactory = () => forced ?? createPhraseListener

/** Пит говорит (окно речи): фразы в это время не слушаем, а тишину не считаем */
export const pitTalking = () => gameMicHold.active()

/** Слушатель фраз по контракту: { phrases, onWord, onPhrase, onError } + английская модель, игровой микрофон и окно речи Пита */
export const phraseListen = o => phraseFactory()({ lang: 'en', getStream: guardStream(getGameMic), isHeld: gameMicHold.active, ...o })
