// Сигналы «звук или микрофон игры потеряны» помимо ухода страницы (wordLanePauseEvents.js): iOS иногда не шлёт ни hidden, ни pagehide, а аудиосессию уже прервал.
//  • Игровой AudioContext ушёл в 'interrupted' / 'suspended' НЕ по нашей воле (мы его не приостанавливаем, а своё закрытие и пересоздание снимают onstatechange заранее). Сразу пробуем resume():
//    пока страница пишет микрофон, WebKit пускает его без жеста. Через CONFIRM_MS контекст так и не 'running' — сигнал (пауза, «Продолжить» — жёсткий перезапуск, gameAudioRestart.js).
//  • Дорожка игрового микрофона: 'ended' (оборвана системой; свой stop() события не даёт) — сигнал сразу; 'mute' — если через CONFIRM_MS дорожка всё ещё заглушена.
// Не сигнал: mute / ended дорожки, пока поток вне игры или на паузе (gameMic: «жив, выключен» — её проверит следующий старт), первые GRACE_MS после тапа «Начать» / «Продолжить» (getUserMedia и смена типа сессии прерывают контекст сами), окно «прерывание наше» (gameAudioWarm.selfWindow) и экспериментальные режимы,
// которые сами меняют сессию посреди игры (тип 'phases', микрофон 'close'). Каждое решение — строка «[audio] сигнал …» в журнале. Чистая подписка: источники и таймеры подставляются в тестах. → отписка.
import { onGameCtxState, gameCtxState, peekGameCtx } from './gameAudioCtx.js'
import { onGameMicLost, micTracksLine, isGameMicIdle } from './gameMic.js'
import { gameAudioWarm } from './gameAudioWarm.js'
import { gameStartTrace } from './gameStartTrace.js'
import { readAudioSessionMode, readMicHoldMode } from './gameAudioSettings.js'
import { pLog } from './debug.js'

const reporters = new Set() // прямые сигналы из кода: reportAudioLoss(why) → каждая живая подписка ставит паузу (сторож дорожки: «не ожила после глушения», v3.3.128)
/** Сигнал потери из кода (например, gameMicHold: дорожка мёртвая): пауза без переоткрытия микрофона вне жеста — иначе iOS показывает диалог доступа */
export const reportAudioLoss = why => { reporters.forEach(fn => { try { fn(why) } catch { /* подписчик сам пишет журнал */ } }) }

export const CONFIRM_MS = 1200 // прерывание должно продержаться столько (и пережить наш resume), чтобы считаться потерей звука
export const GRACE_MS = 4000   // столько после тапа старта сигналы контекста и микрофона не считаются

const LOST = new Set(['interrupted', 'suspended'])
const defaultSelf = () => gameAudioWarm.selfWindow() || readAudioSessionMode() === 'phases' || readMicHoldMode() === 'close'
const defaultSince = () => { const t = gameStartTrace.sinceTap?.(); return t == null ? Infinity : t }
const defaultResume = () => { try { Promise.resolve(peekGameCtx()?.resume?.()).catch(() => {}) } catch { /* решит подтверждение */ } }

export function subscribeAudioLoss(onLoss, {
  onCtx = onGameCtxState, ctxState = gameCtxState, resume = defaultResume, onMic = onGameMicLost, micLine = micTracksLine, micIdle = isGameMicIdle,
  isSelf = defaultSelf, sinceStart = defaultSince, setTimer = setTimeout, clearTimer = clearTimeout, log = pLog,
} = {}) {
  let ctxTimer = 0, micTimer = 0
  const direct = why => { log(`[audio] сигнал из кода: ${why} — пауза`); onLoss(why) }
  reporters.add(direct)
  const quiet = what => {
    if (sinceStart() < GRACE_MS) { log(`[audio] сигнал «${what}» не считается: старт игры был ${Math.round(sinceStart())} мс назад`); return true }
    if (isSelf()) { log(`[audio] сигнал «${what}» не считается: прерывание вызвали мы (смена сессии / микрофон)`); return true }
    return false
  }
  const offCtx = onCtx(state => {
    if (state === 'running') { clearTimer(ctxTimer); ctxTimer = 0; return }
    if (!LOST.has(state) || ctxTimer || quiet(`контекст ${state}`)) return
    resume()
    log(`[audio] сигнал: игровой контекст ${state} не по нашей воле — пробую resume, жду ${CONFIRM_MS} мс`)
    ctxTimer = setTimer(() => {
      ctxTimer = 0
      const now = ctxState()
      if (LOST.has(now)) { log(`[audio] сигнал подтверждён: контекст так и остался ${now} — пауза`); onLoss(`ctx-${now}`) }
      else log(`[audio] сигнал снят: контекст вернулся (${now ?? 'нет'})`)
    }, CONFIRM_MS)
  })
  const offMic = onMic((kind, info) => {
    if (info?.idle || micIdle()) { log(`[audio] сигнал «микрофон ${kind}» не считается: поток вне игры / на паузе (дорожка выключена)`); return }
    if (quiet(`микрофон ${kind}`)) return
    if (kind === 'ended') { log(`[audio] сигнал: дорожка микрофона оборвана системой (${micLine()}) — пауза`); onLoss('mic-ended'); return }
    if (micTimer) return
    log(`[audio] сигнал: дорожка микрофона заглушена системой (${micLine()}) — жду ${CONFIRM_MS} мс`)
    micTimer = setTimer(() => {
      micTimer = 0
      if (micIdle()) { log('[audio] сигнал снят: игра уже на паузе / закрыта (поток выключен)'); return }
      const line = micLine()
      if (line.includes('muted') || line.includes('ended') || !line.includes('live')) { log(`[audio] сигнал подтверждён: дорожка ${line} — пауза`); onLoss('mic-mute') } // «нет потока» — тоже не ожила (v3.3.128)
      else log(`[audio] сигнал снят: дорожка ожила (${line})`)
    }, CONFIRM_MS)
  })
  return () => { reporters.delete(direct); clearTimer(ctxTimer); clearTimer(micTimer); ctxTimer = 0; micTimer = 0; try { offCtx?.() } catch { /* уже */ } try { offMic?.() } catch { /* уже */ } }
}
