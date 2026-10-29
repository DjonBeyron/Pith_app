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
import { gameMicGesture } from './gameMicGesture.js'

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
let epoch = 0     // растёт при закрытии потока: открытие, начатое до закрытия, не должно оставить микрофон включённым после конца игры
let parked = false // режим 'close' (gameMicHold): поток закрыт нами на время речи Пита/диктора и откроется заново
let reopening = null // Promise<'granted'|'denied'|'unavailable'>, пока идёт повторное открытие после parkGameMic
let taken = false  // распознаватель взял поток (getGameMic) с момента последнего открытия — его сеанс жив на этих треках

// Живой и НЕ заглушённый системой: iOS при прерывании аудиосессии оставляет трек live, но muted — он пишет тишину
const live = s => !!s && s.getTracks().some(t => t.readyState === 'live' && !t.muted)

/** В тапе: открыть поток (диалог ОС — единственный). Возвращает 'granted' | 'denied' | 'unavailable' */
export async function openGameMic() {
  gameMicGesture.grant() // сюда приходит жест (автоматические пути проверяют gameMicGesture.needed() до вызова): «нужен жест» снят
  if (live(stream)) return 'granted'
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return 'unavailable'
  try {
    const constraints = gameMicConstraints()
    const mine = epoch
    const s = await navigator.mediaDevices.getUserMedia({ audio: constraints })
    if (mine !== epoch) { try { s.getTracks().forEach(t => t.stop()) } catch { /* уже остановлен */ } pLog('[mic] поток открылся уже после закрытия игры — закрыт'); return 'unavailable' }
    if (stream && stream !== s) { try { stream.getTracks().forEach(t => t.stop()) } catch { /* уже остановлен */ } } // прежний (оборванный/заглушённый) поток не оставляем висеть
    stream = s
    opened = constraints
    parked = false; taken = false
    sayPermission.markMicOk()
    pLog(`[mic] игровой поток открыт (один на игру): эхо ${constraints.echoCancellation ? 'вкл' : 'выкл'}, шумодав ${constraints.noiseSuppression ? 'вкл' : 'выкл'}`)
    return 'granted'
  } catch (e) {
    pLog(`[mic] доступ не получен: ${e?.name ?? e}`)
    if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') { sayPermission.markDenied(); return 'denied' }
    return 'unavailable'
  }
}

/**
 * Готовый живой поток или null (не открывали / оборвался / заглушён системой — тогда распознаватель откроет микрофон сам). Пока идёт повторное открытие после parkGameMic (режим 'close'),
 * вместо потока возвращается ОБЕЩАНИЕ потока (Promise<MediaStream|null>): voskEngine ждёт его (opts.stream), а не открывает свой микрофон с эхо/шумоподавлением
 */
export function getGameMic() {
  if (reopening) return reopening.then(r => (r === 'granted' ? getGameMic() : null))
  if (!stream) return null
  if (live(stream)) { taken = true; return stream }
  pLog(`[mic] игровой поток непригоден: ${stream.getTracks().map(t => `${t.readyState}${t.muted ? '/muted' : ''}`).join(',')}`)
  return null
}

/** Сам поток как есть (живой, заглушённый или оборванный) — для gameMicHold: выключить/включить дорожки, не проверяя их состояние */
export const peekGameMic = () => stream

/** Есть ли игровой поток (живой или нет) — по нему игра решает, переоткрывать ли микрофон, если распознаватель оглох. Закрытый нами в режиме 'close' (parked) потоком не считается */
export const hasGameMic = () => !!stream && !parked

/** Выбросить мёртвый поток (треки останавливаются) — следующий openGameMic откроет новый */
export const dropGameMic = () => closeGameMic()

/** Конец игры: поток закрывается, индикатор микрофона гаснет */
export function closeGameMic() {
  const s = stream
  stream = null
  opened = null
  parked = false; taken = false; reopening = null
  epoch += 1
  try { s?.getTracks().forEach(t => { try { t.stop() } catch { /* уже остановлен */ } }) } catch { /* ничего */ }
}

/** Распознаватель (сеанс Vosk) сейчас держит игровой поток: закрывать его посреди речи ученика нельзя без перезапуска слушателя */
export const isGameMicTaken = () => taken && !!stream
/** Режим 'close' закрыл поток и ждёт повторного открытия */
export const isGameMicParked = () => parked

/**
 * Режим 'close' (gameMicHold, «микрофон только в фазе ученика»): закрыть поток на время речи Пита/диктора — треки останавливаются, индикатор гаснет, аудиосессия не держит запись (приём «Сказать фразу»:
 * микрофон открыт только пока слушаем). force=false не трогает поток, который сейчас держит распознаватель (его сеанс жив на этих треках). Возвращает { parked, wasTaken } — wasTaken: поток держал распознаватель,
 * после повторного открытия слушатель надо перезапустить
 */
export function parkGameMic({ force = true } = {}) {
  if (reopening) return { parked: false, wasTaken: false, pending: true } // поток как раз открывается заново — закроем, когда откроется (gameMicHold)
  if (!stream || parked) return { parked: false, wasTaken: false }
  if (taken && !force) return { parked: false, wasTaken: true }
  const wasTaken = taken
  const s = stream
  stream = null; opened = null; taken = false; parked = true
  epoch += 1 // открытие, начатое до закрытия, больше не актуально
  try { s.getTracks().forEach(t => { try { t.stop() } catch { /* уже остановлен */ } }) } catch { /* ничего */ }
  pLog(`[mic] игровой поток закрыт на время речи (режим «микрофон только в фазе ученика»)${wasTaken ? ', его держал распознаватель' : ''}`)
  return { parked: true, wasTaken }
}

/** Открыть закрытый parkGameMic поток заново (без жеста, доступ уже выдан). Повторный вызов во время открытия возвращает тот же промис. 'granted' | 'denied' | 'unavailable'; закрыт и не парковали — 'unavailable' */
export function reopenGameMic() {
  if (reopening) return reopening
  if (gameMicGesture.needed()) return Promise.resolve('unavailable') // после паузы поток открывает только тап «Продолжить»
  if (!parked) return Promise.resolve(stream ? 'granted' : 'unavailable')
  const p = openGameMic().then(r => { if (reopening === p) reopening = null; if (r !== 'granted') pLog(`[mic] повторное открытие не удалось (${r}) — распознаватель откроет микрофон сам`); return r })
  reopening = p
  return p
}

/** Для отладочной выгрузки: с какими ограничениями открывается/открыт игровой поток, что реально дал браузер (track.getSettings — там видно, включил ли он эхо/шумодав) и платформа */
export function describeGameMic() {
  let settings = null
  let tracks = null
  try { settings = stream?.getTracks()[0]?.getSettings?.() ?? null } catch { /* трек уже выгружен */ }
  try { tracks = stream?.getTracks().map(t => ({ enabled: t.enabled, muted: !!t.muted, readyState: t.readyState })) ?? null } catch { /* трек уже выгружен */ }
  const ua = String((typeof navigator !== 'undefined' && navigator.userAgent) || '')
  return { constraints: opened ?? gameMicConstraints(), settings, platform: isIos() ? 'ios' : /Android/i.test(ua) ? 'android' : 'other', processing: isMicProcessingOn(), open: !!stream, parked, tracks, audioSessionMode: readAudioSessionMode(), micHoldMode: readMicHoldMode() }
}
