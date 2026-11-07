// Возврат из фона БЕЗ игры: страница возвращается в «чистое» состояние — все AudioContext закрываются (звуки интерфейса, игровой от прогрева «Начать», захваты). Зачем (gameAudioRenew.js, разбор WebKit):
// пока жив хоть один контекст, созданный до ухода в фон, WebKit считает аудиосессию активной и новый контекст может играть в пустоту. Закрываем через DELAY_MS после возврата (visibilitychange приходит
// раньше, чем iOS активирует приложение) или на первом pointerdown — что раньше. Идёт игра (прогрев игры следит за прерываниями) — не трогаем: её звук обновит «Продолжить». Новые контексты создаются лениво:
// звуки интерфейса — preloadSounds на ближайшем жесте урока (без контекста playSound играет <audio>), игровой — getGameCtx при старте. Журнал: «[audio] возврат из фона: закрыто N контекстов (…)».
import { onGameAudioReturn } from './gameAudioLife.js'
import { liveContexts, closeAll, describe } from './audioContextRegistry.js'
import { gameAudioWarm } from './gameAudioWarm.js'
import { pLog } from './debug.js'

export const DELAY_MS = 1000

let installed = null

/** Подписаться на возвраты из фона (идемпотентно). deps — подмена в тестах. → отписка */
export function installReturnClean({ onReturn = onGameAudioReturn, live = liveContexts, close = () => closeAll(), text = describe, gameOn = () => gameAudioWarm.status().watching,
  doc = typeof document !== 'undefined' ? document : null, log = pLog, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (installed) return installed
  let timer = 0, armed = null
  const disarm = () => { clearTimer(timer); timer = 0; if (armed && doc) doc.removeEventListener('pointerdown', armed, true); armed = null }
  const run = why => {
    disarm()
    if (gameOn()) return
    const list = live()
    if (!list.length) return
    const was = text(list)
    Promise.resolve(close()).then(r => log(`[audio] возврат из фона (${why}): закрыто ${r?.closed ?? list.length} контекстов (${was})`), () => {})
  }
  const offReturn = onReturn(() => {
    disarm()
    timer = setTimer(() => run(`через ${DELAY_MS / 1000} с`), DELAY_MS)
    if (doc) { armed = () => run('первое касание'); doc.addEventListener('pointerdown', armed, true) }
  })
  installed = () => { disarm(); offReturn(); installed = null }
  return installed
}
