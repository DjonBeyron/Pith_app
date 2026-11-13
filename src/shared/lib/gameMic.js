// Один микрофонный поток на всю игру «Повтори за диктором» (и «Скажи вслух») — НА ВСЕХ ПЛАТФОРМАХ. iPhone/iPad: iOS (особенно приложение на домашнем экране) спрашивает разрешение при КАЖДОМ новом
// getUserMedia после остановки потока, а распознаватель на каждой ступени открывает микрофон заново — запросов было бы по числу ступеней. Android: распознаватель, открывая микрофон сам, просил
// echoCancellation/noiseSuppression (по умолчанию в браузере они включены) — Chrome переводит аудио страницы в «коммуникационный» режим, и голос диктора и ноты хрипят. Поэтому поток открывается один
// раз в тапе «Начать» (это жест, и запрос приходит в понятный момент) с ограничениями ниже, а распознаватель каждой ступени берёт его готовым (voskEngine opts.stream) и не останавливает.
// v3.3.148: ОДИН ПОТОК НА СЕАНС СТРАНИЦЫ. Пауза, конец игры, закрытие урока (closeGameMic) поток не останавливают — дорожка выключается (enabled = false, «жив, выключен»), следующий старт / «Продолжить»
// включает её без getUserMedia. После фона дорожку сначала проверяем (жива / заглушена — ждём MIC_REVIVE_MS / оборвана → запрашиваем заново, gameMicKeep.js). По-настоящему поток закрывают только
// pagehide с выгрузкой страницы, простой без игры дольше MIC_IDLE_CLOSE_MS и мёртвая дорожка (shutGameMic / dropGameMic). Глушение дорожки на время речи Пита и диктора — gameMicHold.js
// (pithy_game_mic_hold_v1), тип аудиосессии iOS — gameMicSession.js (pithy_game_audio_session_v1).
import { micWorked } from './speech/micWorked.js'
import { isIos } from './soundVolume.js'
import { pLog } from './debug.js'
import { readAudioSessionMode, readMicHoldMode } from './gameAudioSettings.js'
import { gameMicGesture } from './gameMicGesture.js'
import { micGainLogLine, readMicGain } from './gameMicGain.js'
import { micRequestBegin, micRequestEnd } from './gameMicRequest.js'
import { MIC_IDLE_CLOSE_MS, trackState, setTracksEnabled, stopTracks, reviveMuted, markMicMuted, createIdleCloser, onPageUnload } from './gameMicKeep.js'
import { closeKeptCapture } from './vosk/voskCapture.js'
import { markMicGranted } from './micGrantFlag.js'
import { autoNudgeAfterMic } from './gameVolumeNudge.js'
import { gameMediaKeep } from './gameMediaKeep.js'
import { gameAudioSession } from './gameMicSession.js'

export { micRequestPending } from './gameMicRequest.js' // blur/focus от нашего диалога доступа — не уход (wordLanePauseEvents.js)

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
let epoch = 0     // растёт при НАСТОЯЩЕМ закрытии потока (shutGameMic, parkGameMic): открытие, начатое до него, поток не оставляет
let releases = 0  // растёт при closeGameMic (пауза / конец игры): открытие, начатое до него, оставляет поток живым, но выключенным
let idle = false  // поток жив, но вне игры / на паузе: дорожки выключены (enabled = false)
let asking = null // Promise ответа идущего getUserMedia: второй вызов ждёт его, а не открывает второй диалог
let unloadOff = null
const idleCloser = createIdleCloser()
let parked = false // режим 'close' (gameMicHold): поток закрыт нами на время речи Пита/диктора и откроется заново
let reopening = null // Promise<'granted'|'denied'|'unavailable'>, пока идёт повторное открытие после parkGameMic
let taken = false  // распознаватель взял поток (getGameMic) с момента последнего открытия — его сеанс жив на этих треках

const lostSubs = new Set() // «дорожка микрофона заглушена/оборвалась системой» (iOS при уходе в фон): gameAudioSignals.js ставит паузу
/** Подписка на mute / ended дорожки игрового потока: cb(kind, { readyState, muted, idle }). idle — поток вне игры / на паузе (для паузы игры не сигнал). Свои stop() сюда не попадают. → отписка */
export function onGameMicLost(cb) { lostSubs.add(cb); return () => lostSubs.delete(cb) }
function watchTracks(s) {
  for (const t of s.getTracks?.() ?? []) {
    const fire = kind => () => { if (stream !== s) return; markMicMuted(kind === 'mute', { why: 'дорожка оборвана', log: pLog }); for (const cb of lostSubs) { try { cb(kind, { readyState: t.readyState, muted: !!t.muted, idle }) } catch { /* подписчик не должен ломать остальных */ } } }
    const unmute = () => { if (stream === s && trackState(s) === 'live') markMicMuted(false, { log: pLog }) } // «[mic] глух N мс (система)»
    try { t.addEventListener?.('mute', fire('mute')); t.addEventListener?.('ended', fire('ended')); t.addEventListener?.('unmute', unmute) } catch { /* без событий дорожки */ }
  }
}
/** Дорожки игрового потока одной строкой для журнала: «live», «live/muted», «live/off (жив, выключен)» — вне игры, или «нет потока» */
export const micTracksLine = () => {
  try {
    if (!stream) return 'нет потока'
    const line = stream.getTracks().map(t => `${t.readyState}${t.muted ? '/muted' : ''}${t.enabled === false ? '/off' : ''}`).join(',') || 'без дорожек'
    return idle && trackState(stream) !== 'ended' ? `${line} (жив, выключен)` : line
  } catch { return 'недоступно' }
}

// Живой и НЕ заглушённый системой: iOS при прерывании аудиосессии оставляет трек live, но muted — он пишет тишину
const live = s => !!s && s.getTracks().some(t => t.readyState === 'live' && !t.muted)

/** Что реально применил браузер к дорожке (getSettings): iOS Safari не всегда выполняет autoGainControl — по этой строке видно, помогает ли системное автоусиление */
const trackLine = s => { try { const tr = s.getTracks()[0], t = tr?.getSettings?.() ?? {}; return `[mic] дорожка применила: эхо ${t.echoCancellation ?? '—'}, шумодав ${t.noiseSuppression ?? '—'}, автоусиление ${t.autoGainControl ?? '—'}, устройство «${tr?.label || '—'}», частота ${t.sampleRate ?? '—'}` } catch { return '[mic] настройки дорожки недоступны' } }

/** Включить живой поток (enabled = true), снять таймер простоя */
function takeStream() { setTracksEnabled(stream, true); idle = false; idleCloser.disarm() }

/** Поток уже есть (прошлая игра, пауза, фон): жива (live и НЕ muted) — берёт openGameMic; заглушена — включаем и ждём unmute до MIC_REVIVE_MS; оборвана / не ожила — останавливаем. → true, если можно брать */
async function reuseStream() {
  const s = stream
  const was = idle
  const say = text => { if (was) pLog(`[mic] дорожка после фона: ${text}`) }
  if (trackState(s) === 'muted') {
    const ok = await reviveMuted(s, { say })
    if (stream !== s) return false
    if (ok) { takeStream(); return true }
  } else say('оборвана → запрашиваем')
  if (stream === s) shutGameMic('дорожка мертва')
  return false
}

/** В тапе: включить поток сеанса или открыть его (диалог ОС — только если потока нет или он мёртв). Возвращает 'granted' | 'denied' | 'unavailable' */
/** Открыть игровой поток (из нажатия). После успеха режим сессии 'playback' ставит тип playback на весь сеанс (gameMicSession.afterMic); остальные режимы — no-op */
export async function openGameMic() {
  const r = await openGameMicInner()
  if (r === 'granted') { try { gameAudioSession.afterMic?.() } catch { /* сессия не мешает микрофону */ } }
  return r
}

async function openGameMicInner() {
  gameMediaKeep.start() // СИНХРОННО в нажатии: беззвучный <audio> на время игры — иначе звук игры вдвое тише (gameMediaKeep.js)
  gameMicGesture.grant() // сюда приходит жест (автоматические пути проверяют gameMicGesture.needed() до вызова): «нужен жест» снят
  if (asking) { const r = await asking; return r === 'granted' ? openGameMicInner() : r } // запрос уже идёт — второй диалог не открываем
  if (trackState(stream) === 'live') { if (idle) pLog('[mic] дорожка после фона: жива → используем'); takeStream(); return 'granted' } // синхронно, без await
  if (stream && await reuseStream()) return 'granted'
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return 'unavailable'
  const p = requestStream()
  asking = p
  try { return await p } finally { if (asking === p) asking = null }
}

async function requestStream() {
  try {
    const constraints = gameMicConstraints()
    const mine = epoch, rel = releases
    micRequestBegin() // диалог доступа iOS даёт blur/focus — пауза их не считает, пока ждём ответа и ещё 1,5 с
    let s
    try { s = await navigator.mediaDevices.getUserMedia({ audio: constraints }) } catch (e) { micRequestEnd(e?.name ?? 'ошибка'); throw e }
    micRequestEnd(mine !== epoch ? 'granted (поток уже закрыт)' : 'granted')
    if (mine !== epoch) { stopTracks(s); pLog('[mic] поток открылся уже после настоящего закрытия — закрыт'); return 'unavailable' }
    if (stream && stream !== s) { stopTracks(stream); markMicMuted(false, { why: 'новый поток', log: pLog }) } // прежний (оборванный/заглушённый) поток не оставляем висеть
    stream = s
    watchTracks(s)
    opened = constraints
    parked = false; taken = false
    micWorked.markOk(); markMicGranted()
    if (!unloadOff) unloadOff = onPageUnload(() => shutGameMic('страница выгружается (pagehide)'))
    pLog(`[mic] игровой поток открыт (один на сеанс страницы): эхо ${constraints.echoCancellation ? 'вкл' : 'выкл'}, шумодав ${constraints.noiseSuppression ? 'вкл' : 'выкл'}`)
    pLog(micGainLogLine())
    pLog(trackLine(s))
    if (rel !== releases) { idle = false; closeGameMic(); pLog('[mic] поток открылся уже после закрытия игры — оставлен живым и выключенным (следующий старт без диалога)'); return 'granted' }
    idle = false; idleCloser.disarm()
    gameMediaKeep.refresh() // сессия сменилась на запись → беззвучный <audio> перезапускаем (как делала кнопка «Встряхнуть: <audio>»)
    autoNudgeAfterMic() // настройка «Встряска громкости» (Админ → «Голос»): после открытия микрофона вывод iPhone дёргаем, не трогая поток
    return 'granted'
  } catch (e) {
    pLog(`[mic] доступ не получен: ${e?.name ?? e}`)
    if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') { micWorked.markDenied(); return 'denied' }
    return 'unavailable'
  }
}

/**
 * Готовый живой поток или null (не открывали / оборвался / заглушён системой — тогда распознаватель откроет микрофон сам). Пока идёт повторное открытие после parkGameMic (режим 'close'),
 * вместо потока возвращается ОБЕЩАНИЕ потока (Promise<MediaStream|null>): voskEngine ждёт его (opts.stream), а не открывает свой микрофон с эхо/шумоподавлением
 */
export function getGameMic() {
  if (reopening) return reopening.then(r => (r === 'granted' ? getGameMic() : null))
  if (!stream || idle) return null // вне игры / на паузе дорожка выключена — включает её только openGameMic
  if (live(stream)) { taken = true; return stream }
  pLog(`[mic] игровой поток непригоден: ${stream.getTracks().map(t => `${t.readyState}${t.muted ? '/muted' : ''}`).join(',')}`)
  return null
}

/** Сам поток как есть (живой, заглушённый или оборванный) — для gameMicHold: выключить/включить дорожки, не проверяя их состояние */
export const peekGameMic = () => stream

/** Есть ли игровой поток (живой или нет) — по нему игра решает, переоткрывать ли микрофон, если распознаватель оглох. Закрытый нами в режиме 'close' (parked) потоком не считается */
export const hasGameMic = () => !!stream && !parked

/** Выбросить мёртвый поток (треки останавливаются) — следующий openGameMic откроет новый (диалог) */
export const dropGameMic = () => shutGameMic('поток мёртв')

/** Поток жив, но выключен (вне игры / на паузе) */
export const isGameMicIdle = () => idle && !!stream
/** Есть поток с живой дорожкой (пусть заглушённой или выключенной): следующий старт, скорее всего, обойдётся без диалога */
export const gameMicAlive = () => { const st = trackState(stream); return st === 'live' || st === 'muted' }

/**
 * Пауза / конец игры / закрытие урока: поток НЕ останавливается — дорожки выключаются (enabled = false), индикатор микрофона iOS может остаться. Следующий openGameMic включает их без диалога.
 * Без игры дольше MIC_IDLE_CLOSE_MS — закрытие по-настоящему (shutGameMic). Открытие, идущее сейчас, оставит новый поток выключенным
 */
export function closeGameMic() {
  gameMediaKeep.stop()
  closeKeptCapture('пауза / конец игры') // контекст захвата живёт между ходами одной игры (voskCapture.js)
  releases += 1
  parked = false; taken = false; reopening = null
  if (!stream || idle) return
  idle = true
  setTracksEnabled(stream, false)
  idleCloser.arm(() => shutGameMic(`простой ${Math.round(MIC_IDLE_CLOSE_MS / 60000)} мин без игры`))
  pLog(`[mic] игра на паузе / закрыта: поток жив, дорожка выключена (${micTracksLine()}) — следующий старт без диалога`)
}

/** Закрыть поток по-настоящему: треки останавливаются, индикатор гаснет, следующий openGameMic — снова getUserMedia (диалог на iPhone) */
export function shutGameMic(why = 'закрыт') {
  try { gameAudioSession.micGone?.() } catch { /* сессия не мешает закрытию */ } // режим 'playback': поток закрыт по-настоящему — playback не держим
  gameMediaKeep.stop()
  const s = stream
  stream = null; opened = null
  parked = false; taken = false; reopening = null; idle = false
  epoch += 1
  idleCloser.disarm()
  stopTracks(s)
  markMicMuted(false, { why: 'поток закрыт', log: pLog }); closeKeptCapture(why)
  if (s) pLog(`[mic] поток закрыт по-настоящему (${why}) — следующий старт спросит разрешение`)
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
  stopTracks(s)
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
  return { constraints: opened ?? gameMicConstraints(), settings, platform: isIos() ? 'ios' : /Android/i.test(ua) ? 'android' : 'other', processing: isMicProcessingOn(), open: !!stream, idle, parked, tracks, audioSessionMode: readAudioSessionMode(), micHoldMode: readMicHoldMode(), gain: readMicGain() }
}
