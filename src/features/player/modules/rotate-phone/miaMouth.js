import { createCatVoice } from './wordLaneCatVoice.js'
import { createMouthHold } from './wordLaneMouthHold.js'
import { drawCatMouth } from './wordLaneCatLook.js'
import { mouthTrack } from './wordLaneVisemes.js'

// Рот Мии (эпизод «Мия»): та же речь «по дорожке букв», что у Пита (createCatVoice), на голове Мии. Дорожка строится по тексту реплики и её длине (звук Мии идёт из слота,
// дорожки Rhubarb у неё нет; с v3.3.372 слова ставятся по таймингам озвучки, как у Пита, — раньше ложились по тексту равномерно, и после озвучки со знаками рот шёл мимо пауз), выдержка формы — createMouthHold (форма держится ≥ 70 мс, DOM без лишних записей). Пока реплика идёт, усы Мии
// двигаются (look.talking), как у говорящего Пита. Голова — та, что сейчас видна (getHead(): смена лица меняет голову, redraw() рисует текущую форму в новой).
// Чистая обёртка без React: часы, кадры и таймеры приходят аргументами (тесты).
const NO_PEEK = { voice() {}, hold() {}, isUp: () => true }

export function createMiaMouth({ getHead, look, apply = drawCatMouth, minHold, ...timers }) { // minHold — выдержка формы рта (слабое устройство: MOUTH_LITE_HOLD_MS)
  const hold = createMouthHold({ apply: key => apply(getHead(), key), minHold, now: timers.now, setTimer: timers.setTimer, clearTimer: timers.clearTimer })
  const voice = createCatVoice({ hold, look, peek: NO_PEEK, ...timers })
  return {
    /** Реплика Мии: рот идёт ms мс по таймингам слов озвучки words (как у Пита; ms — длина звука, она же длина файла), нет их — по тексту равномерно */
    speak(text, ms, id = null, words = null) { voice.speak(mouthTrack(text, ms, words, words ? ms / 1000 : null), ms, { id, kind: 'мия' }) },
    /** Лицо сменилось (другая голова): нарисовать текущую форму рта в ней */
    redraw() { hold.redraw() },
    busy: () => voice.busy(),
    stop() { voice.stop(); hold.dispose() },
  }
}
