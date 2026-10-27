// Один микрофонный поток на всю игру «Повтори за диктором» — для iPhone/iPad (micAccess.micNeedsHold): iOS (особенно приложение на домашнем экране) спрашивает разрешение при КАЖДОМ новом
// getUserMedia после остановки потока, а распознаватель на каждой ступени открывает микрофон заново — запросов было бы по числу ступеней. Поток открывается один раз в тапе «Начать» (это жест, и
// запрос приходит в понятный момент), живёт до конца игры, а распознаватель каждой ступени берёт его готовым (voskEngine opts.stream) и не останавливает. Между ступенями треки выключаются
// (enabled = false): звук с микрофона не идёт, пока слушать нечего.
import { sayPermission } from './speech/sayPermission.js'
import { pLog } from './debug.js'

let stream = null

const live = s => !!s && s.getTracks().some(t => t.readyState === 'live')

/** В тапе: открыть поток (диалог ОС — единственный). Возвращает 'granted' | 'denied' | 'unavailable' */
export async function openGameMic() {
  if (live(stream)) return 'granted'
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return 'unavailable'
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
    stream.getTracks().forEach(t => { t.enabled = false })
    sayPermission.markMicOk()
    pLog('[mic] игровой поток открыт (один на игру)')
    return 'granted'
  } catch (e) {
    pLog(`[mic] доступ не получен: ${e?.name ?? e}`)
    if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') { sayPermission.markDenied(); return 'denied' }
    return 'unavailable'
  }
}

/** Готовый живой поток или null (не открывали / оборвался — тогда распознаватель откроет микрофон сам) */
export const getGameMic = () => (live(stream) ? stream : null)

/** Включить/выключить звук с микрофона (поток остаётся открытым) */
export function setGameMicActive(on) { try { stream?.getTracks().forEach(t => { t.enabled = !!on }) } catch { /* поток уже закрыт */ } }

/** Конец игры: поток закрывается, индикатор микрофона гаснет */
export function closeGameMic() {
  const s = stream
  stream = null
  try { s?.getTracks().forEach(t => { try { t.stop() } catch { /* уже остановлен */ } }) } catch { /* ничего */ }
}
