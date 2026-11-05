// Порядок запуска «Гонки с Питом» (CONCEPT_RACE.md, «Попап внутри игры»), вынесенный из RotatePhoneModule, чтобы его можно было проверить без DOM. Две точки:
//  • openAsk — кнопка «Начать» / кнопка админ-блока: ТОЛЬКО открывает сцену игры с попапом (полный экран — из этого тапа). Ни звука, ни микрофона, ни startGameAudio, ни заставки, ни реплик, ни конвейера.
//  • answerAsk — «Говорю» / «Тапаю» (тап по кнопке попапа — жест): выбор и режим тапа, начало отсчёта «Пит через N мс», startGameAudio СИНХРОННО (микрофон, звук, ворота), игра открывается сразу (Пит выскакивает), часы игры стоят
//    (hold), пока звук реплик не готов (startGameAudio → onLineReady, не ждёт микрофон), но не дольше RACE_HOLD_MAX_MS; ответ startGameAudio приходит в onAudio (микрофон не дали / жест истёк — решает модуль), если запуск ещё актуален (current()).
import { RACE_HOLD_MAX_MS } from './raceStartTrace.js'

/** Кнопка запуска: открыть сцену с попапом. Больше ничего не стартует */
export function openAsk({ fullscreen, setPhase }) {
  fullscreen()
  setPhase('ask')
}

/** Ответ на попап (из обработчика тапа). → промис ответа startGameAudio (для тестов) */
export function answerAsk({ choice, ask, trace, startAudio, setPhase, setHold, onAudio, current = () => true, setTimer = setTimeout, clearTimer = clearTimeout, holdMaxMs = RACE_HOLD_MAX_MS }) {
  ask.pick(choice)                // выбор запоминается, режим тапа на эту игру выставлен ДО старта игры
  trace.begin(); setHold(true)    // часы игры стоят: сцена открыта, звук ещё готовится
  const audio = startAudio({ onLineReady: () => { if (current()) setHold(false) } }) // СИНХРОННО, до любых await: микрофон, тип аудиосессии, игровой AudioContext (жест). Звук реплик готов (resume + буферы + ворота первых реплик) — часы идут, МИКРОФОН ещё может открываться (v3.3.115: race_start его не ждёт)
  setPhase('game')                // игра монтируется сразу: Пит выскакивает, реплика ждёт звук
  const cap = setTimer(() => { if (current()) setHold(false) }, holdMaxMs)
  return Promise.resolve(audio).then(res => {
    clearTimer(cap)
    if (current()) onAudio?.(res)
    return res
  })
}
