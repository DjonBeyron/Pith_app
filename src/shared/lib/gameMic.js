// Один микрофонный поток на всю игру «Повтори за диктором» — для iPhone/iPad (micAccess.micNeedsHold): iOS (особенно приложение на домашнем экране) спрашивает разрешение при КАЖДОМ новом
// getUserMedia после остановки потока, а распознаватель на каждой ступени открывает микрофон заново — запросов было бы по числу ступеней. Поток открывается один раз в тапе «Начать» (это жест, и
// запрос приходит в понятный момент), живёт до конца игры/урока, а распознаватель каждой ступени берёт его готовым (voskEngine opts.stream) и не останавливает. Треки НЕ выключаем (enabled = false
// на iOS мог остановить захват): между ступенями поток просто никуда не подключён.
import { sayPermission } from './speech/sayPermission.js'
import { pLog } from './debug.js'

// БЕЗ эхо- и шумоподавления: пока на iPhone открыт поток с echoCancellation, iOS включает «голосовую обработку» (как в звонке) для ВСЕГО звука страницы — озвучка диктора хрипит и шипит, как плёнка.
// Без неё воспроизведение чистое; автоусиление оставлено — тихий голос слышно. Эхо диктора в микрофон не мешает: слушатель стартует после диктора, а ворота голоса глушат ноты-награды.
export const GAME_MIC_CONSTRAINTS = { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 }

let stream = null

// Живой и НЕ заглушённый системой: iOS при прерывании аудиосессии оставляет трек live, но muted — он пишет тишину
const live = s => !!s && s.getTracks().some(t => t.readyState === 'live' && !t.muted)

/** В тапе: открыть поток (диалог ОС — единственный). Возвращает 'granted' | 'denied' | 'unavailable' */
export async function openGameMic() {
  if (live(stream)) return 'granted'
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return 'unavailable'
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: GAME_MIC_CONSTRAINTS })
    sayPermission.markMicOk()
    pLog('[mic] игровой поток открыт (один на игру)')
    return 'granted'
  } catch (e) {
    pLog(`[mic] доступ не получен: ${e?.name ?? e}`)
    if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') { sayPermission.markDenied(); return 'denied' }
    return 'unavailable'
  }
}

/** Готовый живой поток или null (не открывали / оборвался / заглушён системой — тогда распознаватель откроет микрофон сам) */
export function getGameMic() {
  if (!stream) return null
  if (live(stream)) return stream
  pLog(`[mic] игровой поток непригоден: ${stream.getTracks().map(t => `${t.readyState}${t.muted ? '/muted' : ''}`).join(',')}`)
  return null
}

/** Есть ли игровой поток (живой или нет) — по нему игра решает, переоткрывать ли микрофон, если распознаватель оглох */
export const hasGameMic = () => !!stream

/** Выбросить мёртвый поток (треки останавливаются) — следующий openGameMic откроет новый */
export const dropGameMic = () => closeGameMic()

/** Конец игры: поток закрывается, индикатор микрофона гаснет */
export function closeGameMic() {
  const s = stream
  stream = null
  try { s?.getTracks().forEach(t => { try { t.stop() } catch { /* уже остановлен */ } }) } catch { /* ничего */ }
}
