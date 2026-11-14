import { createCatVoice } from './wordLaneCatVoice.js'
import { createMouthHold } from './wordLaneMouthHold.js'
import { drawCatMouth } from './wordLaneCatLook.js'
import { mouthTrack } from './wordLaneVisemes.js'

// Рот Мии (эпизод «Мия»): та же речь «по дорожке букв», что у Пита (createCatVoice), на голове Мии. Дорожка строится по тексту реплики и её длине (звук Мии идёт из слота,
// дорожки Rhubarb у неё нет — слова ложатся по тексту равномерно), выдержка формы — createMouthHold (форма держится ≥ 70 мс, DOM без лишних записей). Пока реплика идёт, усы Мии
// двигаются (look.talking), как у говорящего Пита. Голова — та, что сейчас видна (getHead(): смена лица меняет голову, redraw() рисует текущую форму в новой).
// Чистая обёртка без React: часы, кадры и таймеры приходят аргументами (тесты).
const NO_PEEK = { voice() {}, hold() {}, isUp: () => true }

export function createMiaMouth({ getHead, look, apply = drawCatMouth, ...timers }) {
  const hold = createMouthHold({ apply: key => apply(getHead(), key), now: timers.now, setTimer: timers.setTimer, clearTimer: timers.clearTimer })
  const voice = createCatVoice({ hold, look, peek: NO_PEEK, ...timers })
  return {
    /** Реплика Мии: рот идёт по тексту text ms мс */
    speak(text, ms, id = null) { voice.speak(mouthTrack(text, ms), ms, { id, kind: 'мия' }) },
    /** Лицо сменилось (другая голова): нарисовать текущую форму рта в ней */
    redraw() { hold.redraw() },
    busy: () => voice.busy(),
    stop() { voice.stop(); hold.dispose() },
  }
}
