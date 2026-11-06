// Порядок запуска «Встряхни память» («Гонка с Питом», CONCEPT_RACE.md, «Попап внутри игры»), вынесенный из RotatePhoneModule (проводка — useRaceLaunch.js), чтобы его можно было проверить без DOM:
//  • openAsk — кнопка «Начать» / кнопка админ-блока (жест): открывает сцену игры с попапом (полный экран — из этого тапа) и ПРОГРЕВАЕТ звук (prewarm → raceWarm.js: AudioContext открыт в жесте, первые реплики
//    и слова декодируются в память). Тишина: ни звука, ни микрофона, ни startGameAudio, ни заставки, ни реплик, ни конвейера.
//  • answerAsk — тап по «Говорю» / «Тапаю» (жест): выбор и режим тапа (ask.pick), отсчёт ожидания в попапе (trace.ask), дальше два пути:
//    «Говорю» — startGameAudio СИНХРОННО в жесте (тип сессии, getUserMedia, контекст), попап остаётся (setWait 'mic' → 'sound'), игра НЕ открывается, пока система не ответила о микрофоне и звук не улёгся после смены
//      аудиосессии (промис startGameAudio). Доступ дан → вход в игру (enter: trace.begin, setPhase('game'); звук реплик уже готов — часы не стоят). Отказ / ошибка → onDenied: остаёмся в попапе с подсказкой, «Тапаю» доступно;
//    «Тапаю» — startGameAudio без микрофона (mic: false: ни getUserMedia, ни сессии записи), игра открывается сразу, часы стоят (hold), пока звук реплик не готов (onLineReady), но не дольше RACE_HOLD_MAX_MS.
//  Ответ startGameAudio уходит в onAudio, если запуск ещё актуален (current()).
import { RACE_HOLD_MAX_MS } from './raceStartTrace.js'

/** Кнопка запуска (жест): открыть сцену с попапом и прогреть звук заранее (без звука и микрофона) */
export function openAsk({ fullscreen, setPhase, prewarm = null }) {
  fullscreen()
  try { prewarm?.() } catch { /* прогрев только ускоряет */ }
  setPhase('ask')
}

/** Вход в игру: отсчёт до первой реплики; часы стоят, только если звук ещё не готов (не дольше holdMaxMs). → таймер потолка или null */
function enter(o, { ready, needsTap = false }) {
  const { trace, setPhase, setHold, onEnter, current = () => true, setTimer = setTimeout, holdMaxMs = RACE_HOLD_MAX_MS } = o
  trace.begin(); setHold(!ready)
  try { onEnter?.() } catch { /* журнал не мешает игре */ }
  setPhase(needsTap ? 'tap' : 'game')
  return ready ? null : setTimer(() => { if (current()) setHold(false) }, holdMaxMs)
}

/** Ответ на попап (из обработчика тапа). → промис ответа startGameAudio (для тестов) */
export function answerAsk(o) {
  const { choice, ask, trace, startAudio, setHold, setWait = () => {}, onAudio, onDenied, current = () => true, clearTimer = clearTimeout } = o
  ask.pick(choice) // выбор запоминается, режим тапа на эту игру выставлен ДО старта игры
  trace.ask?.(choice) // и шаг «[start] тап «Говорю» / «Тапаю»» хронологии (raceStartChron.js)
  let ready = false
  const onLineReady = () => { ready = true; if (current()) setHold(false) }
  if (choice !== 'voice') { // «Тапаю»: без микрофона, игра сразу
    const audio = startAudio({ mic: false, onLineReady }) // СИНХРОННО, до любых await: игровой AudioContext (жест), звук реплик
    const cap = enter(o, { ready: false })
    return Promise.resolve(audio).then(res => { if (cap != null) clearTimer(cap); if (current()) onAudio?.(res); return res })
  }
  setWait('mic') // «Разрешите микрофон…»: попап остаётся, второго нажатия нет
  const audio = startAudio({ mic: true, onLineReady, onMic: m => { if (current() && m === 'granted') setWait('sound') } }) // СИНХРОННО в жесте: тип сессии → getUserMedia → контекст; звук будится параллельно
  return Promise.resolve(audio).catch(() => ({ mic: 'unavailable', needsTap: false })).then(res => {
    if (!current()) return res
    setWait(null)
    if (res?.mic !== 'granted') { trace.cancel?.(); onDenied?.(res); return res } // попап остаётся: подсказка, «Тапаю» доступно
    enter(o, { ready, needsTap: !!res.needsTap })
    onAudio?.(res)
    return res
  })
}
