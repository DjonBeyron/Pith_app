// Переоткрыть «оглохший» игровой поток — ОДИН путь для игры («Пинг-понг» / репетиция useWordLaneFlow, «Мини-игра 2.0» useGame2Flow, «Скажи вслух» useSayAloudGame) и стенда пилюль
// (pillstand/standMicHealth.js): слушатель слов отдал status 'dead' (RMS ровно 0 дольше DEAD_MS — iOS заглушил поток) → поток выбрасывается (dropGameMic) и открывается новый (openGameMic).
// После паузы (gameMicGesture.needed: поток открывает только тап «Продолжить», вне жеста iOS показал бы диалог доступа) автоматически не открываем — 'gesture'; нет игрового потока
// (распознаватель открывал свой) — 'none'. gesture: false — без проверки жеста («Скажи вслух» исторически переоткрывает всегда).
import { hasGameMic, dropGameMic, openGameMic } from './gameMic.js'
import { gameMicGesture } from './gameMicGesture.js'
import { pLog } from './debug.js'

/** → Promise<'granted' | 'denied' | 'unavailable' | 'gesture' | 'none'> */
export function renewGameMic({ why = '[mic] игровой поток отдаёт тишину', log = pLog, gesture = true } = {}) {
  if (!hasGameMic()) return Promise.resolve('none')
  if (gesture && gameMicGesture.needed()) return Promise.resolve('gesture')
  log(`${why} — переоткрываю`)
  dropGameMic(); return openGameMic()
}
