// Возврат из фона БЕЗ игры: страница возвращается в «чистое» состояние — все AudioContext закрываются (звуки интерфейса, игровой от прогрева «Начать», захваты). Зачем (gameAudioRenew.js, разбор WebKit):
// пока жив хоть один контекст, созданный до ухода в фон, WebKit считает аудиосессию активной и новый контекст может играть в пустоту. Закрываем через DELAY_MS после возврата (visibilitychange приходит
// раньше, чем iOS активирует приложение) или на первом pointerdown — что раньше. Новые контексты создаются лениво: звуки интерфейса — preloadSounds на ближайшем жесте урока (без контекста playSound
// играет <audio>), игровой — getGameCtx при старте. Журнал: «[audio] возврат из фона: закрыто N контекстов (…)».
// v3.3.147 (журнал владельца: уборка через 1 с после диалога микрофона закрыла только что созданные «Продолжить» контексты → «контекст closed»). Уборка НЕ идёт («[audio] уборка после возврата отложена: …»):
//  • игра смонтирована (идёт, на паузе, ждёт «Продолжить», финал — gameAudioLife.gameMounted) или прогрев игры следит за прерываниями — её звук обновит «Продолжить»;
//  • идёт старт / перезапуск: с тапа «Начать» / «Продолжить» прошло меньше BUSY_MS (gameAudioLife.sinceGameTap);
//  • возврат после blur/focus без hidden (короткая потеря фокуса: диалог доступа, шторка) — старые контексты не «старше фона».
import { onGameAudioReturn, gameMounted, sinceGameTap } from './gameAudioLife.js'
import { liveContexts, closeAll, describe } from './audioContextRegistry.js'
import { gameAudioWarm } from './gameAudioWarm.js'
import { pLog } from './debug.js'

export const DELAY_MS = 1000
export const BUSY_MS = 10000 // столько после тапа старта/перезапуска уборка не трогает контексты

let installed = null

/** Почему уборку делать нельзя → строка или null. info — { hidden } из gameAudioLife (был ли настоящий hidden) */
export function cleanBlocked({ info = null, gameOn, mounted, sinceTap }) {
  if (mounted()) return 'игра смонтирована'
  if (gameOn()) return 'идёт игра (прогрев следит за прерываниями)'
  const t = sinceTap()
  if (t < BUSY_MS) return `идёт перезапуск/старт (тап ${Math.round(t)} мс назад)`
  if (info?.hidden === false) return 'короткий blur (фокус терялся без ухода в фон)'
  return null
}

/** Подписаться на возвраты из фона (идемпотентно). deps — подмена в тестах. → отписка */
export function installReturnClean({ onReturn = onGameAudioReturn, live = liveContexts, close = () => closeAll(), text = describe, gameOn = () => gameAudioWarm.status().watching,
  mounted = gameMounted, sinceTap = () => sinceGameTap(), doc = typeof document !== 'undefined' ? document : null, log = pLog, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (installed) return installed
  let timer = 0, armed = null
  const disarm = () => { clearTimer(timer); timer = 0; if (armed && doc) doc.removeEventListener('pointerdown', armed, true); armed = null }
  const run = (why, info) => {
    disarm()
    const list = live()
    if (!list.length) return
    const blocked = cleanBlocked({ info, gameOn, mounted, sinceTap })
    if (blocked) { log(`[audio] уборка после возврата отложена: ${blocked} — контексты (${text(list)}) не трогаю`); return }
    const was = text(list)
    Promise.resolve(close()).then(r => log(`[audio] возврат из фона (${why}): закрыто ${r?.closed ?? list.length} контекстов (${was})`), () => {})
  }
  const offReturn = onReturn((_what, info = null) => {
    disarm()
    timer = setTimer(() => run(`через ${DELAY_MS / 1000} с`, info), DELAY_MS)
    if (doc) { armed = () => run('первое касание', info); doc.addEventListener('pointerdown', armed, true) }
  })
  installed = () => { disarm(); offReturn(); installed = null }
  return installed
}
