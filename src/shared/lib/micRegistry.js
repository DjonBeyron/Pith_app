import { pLog } from './debug.js'

// Реестр ВСЕХ открытых микрофонных потоков страницы (v3.3.215). Владелец: после выхода из игры в ленте горит точка микрофона iPhone, хотя игровой поток закрывают shutGameMic / closeGameMic.
// Значит, дорожку держит кто-то ещё (распознаватель со своим getUserMedia, запись, проба). getUserMedia обёрнут один раз: каждый выданный поток запоминается, stopAllMics() останавливает
// все живые дорожки независимо от того, кто их открыл. Зовётся только при выходе из игры / закрытии урока (gameMicLeave.js), не при каждом закрытии игрового потока.
const streams = new Set()
let installed = false

const liveTracks = s => { try { return s.getTracks().filter(t => t.readyState === 'live') } catch { return [] } }

/** Обернуть navigator.mediaDevices.getUserMedia (один раз). → true, если обёртка поставлена */
export function installMicRegistry(md = globalThis.navigator?.mediaDevices) {
  if (installed || !md || typeof md.getUserMedia !== 'function') return false
  installed = true
  const orig = md.getUserMedia.bind(md)
  md.getUserMedia = (...a) => orig(...a).then(s => { try { for (const o of streams) if (!liveTracks(o).length) streams.delete(o); if (s?.getAudioTracks?.().length) streams.add(s) } catch { /* реестр не мешает потоку */ } return s })
  return true
}

/** Сколько потоков с живой дорожкой сейчас помнит реестр */
export const openMicCount = () => [...streams].filter(s => liveTracks(s).length).length

/** Остановить все живые дорожки всех запомненных потоков. → сколько дорожек остановлено */
export function stopAllMics(why = 'выход') {
  let n = 0
  for (const s of streams) for (const t of liveTracks(s)) { try { t.stop(); n++ } catch { /* уже остановлена */ } }
  streams.clear()
  if (n) { try { pLog(`[mic] реестр: остановлено ещё ${n} живых дорожек микрофона (${why}) — их держал не игровой поток`) } catch { /* журнал не мешает */ } }
  return n
}

installMicRegistry()
