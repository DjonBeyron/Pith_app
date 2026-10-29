// Один микрофонный поток на всю игру «Повтори за диктором» (и «Скажи вслух») — НА ВСЕХ ПЛАТФОРМАХ. iPhone/iPad: iOS (особенно приложение на домашнем экране) спрашивает разрешение при КАЖДОМ новом
// getUserMedia после остановки потока, а распознаватель на каждой ступени открывает микрофон заново — запросов было бы по числу ступеней. Android: распознаватель, открывая микрофон сам, просил
// echoCancellation/noiseSuppression (по умолчанию в браузере они включены) — Chrome переводит аудио страницы в «коммуникационный» режим, и голос диктора и ноты хрипят. Поэтому поток открывается один
// раз в тапе «Начать» (это жест, и запрос приходит в понятный момент) с ограничениями ниже, живёт до конца игры/урока, а распознаватель каждой ступени берёт его готовым (voskEngine opts.stream) и не
// останавливает. Треки по умолчанию НЕ выключаем (enabled = false на iOS мог остановить захват): между ступенями поток просто никуда не подключён. Глушение дорожки на время речи Пита и диктора —
// отдельный режим для проверки на телефоне (gameMicHold.js, настройка pithy_game_mic_hold_v1), тип аудиосессии iOS — gameMicSession.js (pithy_game_audio_session_v1).
import { sayPermission } from './speech/sayPermission.js'
import { isIos } from './soundVolume.js'
import { pLog } from './debug.js'
import { readAudioSessionMode, readMicHoldMode } from './gameAudioSettings.js'

// БЕЗ эхо- и шумоподавления: пока открыт поток с echoCancellation, iOS включает «голосовую обработку» (как в звонке) для ВСЕГО звука страницы, а Android Chrome — коммуникационный режим: озвучка диктора
// хрипит и шипит, как плёнка. Без неё воспроизведение чистое; автоусиление оставлено — тихий голос слышно. Эхо диктора в микрофон не мешает: слушатель стартует после диктора, а ворота голоса глушат ноты-награды.
export const GAME_MIC_CONSTRAINTS = { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 }

// Тумблер для проверки на телефоне (Админ → «Голос»): '1' — открывать поток С обработкой системы (эхо/шум), как делает «Сказать фразу». По умолчанию выкл. Читается при каждом открытии потока.
export const MIC_PROCESSING_KEY = 'pithy_mic_processing_v1'
export const isMicProcessingOn = (store = globalThis.localStorage) => { try { return store?.getItem(MIC_PROCESSING_KEY) === '1' } catch { return false } }
export function setMicProcessingOn(on, store = globalThis.localStorage) {
  try { if (on) store?.setItem(MIC_PROCESSING_KEY, '1'); else store?.removeItem(MIC_PROCESSING_KEY) } catch { /* приватный режим — живёт до перезагрузки */ }
}

/** Ограничения getUserMedia для игры: без обработки (по умолчанию) либо с эхо/шумоподавлением системы (тумблер) */
export const gameMicConstraints = (store = globalThis.localStorage) => (isMicProcessingOn(store) ? { ...GAME_MIC_CONSTRAINTS, echoCancellation: true, noiseSuppression: true } : { ...GAME_MIC_CONSTRAINTS })

let stream = null
let opened = null // с какими ограничениями открыт текущий поток (для отладочной выгрузки)

// Живой и НЕ заглушённый системой: iOS при прерывании аудиосессии оставляет трек live, но muted — он пишет тишину
const live = s => !!s && s.getTracks().some(t => t.readyState === 'live' && !t.muted)

/** В тапе: открыть поток (диалог ОС — единственный). Возвращает 'granted' | 'denied' | 'unavailable' */
export async function openGameMic() {
  if (live(stream)) return 'granted'
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return 'unavailable'
  try {
    const constraints = gameMicConstraints()
    const s = await navigator.mediaDevices.getUserMedia({ audio: constraints })
    if (stream && stream !== s) { try { stream.getTracks().forEach(t => t.stop()) } catch { /* уже остановлен */ } } // прежний (оборванный/заглушённый) поток не оставляем висеть
    stream = s
    opened = constraints
    sayPermission.markMicOk()
    pLog(`[mic] игровой поток открыт (один на игру): эхо ${constraints.echoCancellation ? 'вкл' : 'выкл'}, шумодав ${constraints.noiseSuppression ? 'вкл' : 'выкл'}`)
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

/** Сам поток как есть (живой, заглушённый или оборванный) — для gameMicHold: выключить/включить дорожки, не проверяя их состояние */
export const peekGameMic = () => stream

/** Есть ли игровой поток (живой или нет) — по нему игра решает, переоткрывать ли микрофон, если распознаватель оглох */
export const hasGameMic = () => !!stream

/** Выбросить мёртвый поток (треки останавливаются) — следующий openGameMic откроет новый */
export const dropGameMic = () => closeGameMic()

/** Конец игры: поток закрывается, индикатор микрофона гаснет */
export function closeGameMic() {
  const s = stream
  stream = null
  opened = null
  try { s?.getTracks().forEach(t => { try { t.stop() } catch { /* уже остановлен */ } }) } catch { /* ничего */ }
}

/** Для отладочной выгрузки: с какими ограничениями открывается/открыт игровой поток, что реально дал браузер (track.getSettings — там видно, включил ли он эхо/шумодав) и платформа */
export function describeGameMic() {
  let settings = null
  let tracks = null
  try { settings = stream?.getTracks()[0]?.getSettings?.() ?? null } catch { /* трек уже выгружен */ }
  try { tracks = stream?.getTracks().map(t => ({ enabled: t.enabled, muted: !!t.muted, readyState: t.readyState })) ?? null } catch { /* трек уже выгружен */ }
  const ua = String((typeof navigator !== 'undefined' && navigator.userAgent) || '')
  return { constraints: opened ?? gameMicConstraints(), settings, platform: isIos() ? 'ios' : /Android/i.test(ua) ? 'android' : 'other', processing: isMicProcessingOn(), open: !!stream, tracks, audioSessionMode: readAudioSessionMode(), micHoldMode: readMicHoldMode() }
}
