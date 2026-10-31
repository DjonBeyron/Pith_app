// Звуки игры в виде AudioBuffer (Web Audio): куски диктора и реплики Пита из библиотеки слов (буфер декодируется при замере голоса — wordLaneFetch.js) и звуки, которые игра делает сама / берёт файлом
// (мяу, ноты, плашка — wordLaneNotes.js, wordLanePlateSound.js). Играет всё это один игровой AudioContext (shared/lib/gameAudioCtx.js, gameBufferPlay.js).
//  • Слова: registerWordBuffer(key, url) связывает ключ слота (`w:<слово>` / `w:line:<id>`) с адресом файла; playWordBuffer(key, onResult, onStart) играет буфер: громкость 1 (0 при «без звука» урока — звука нет, а время идёт),
//    скорость — скорость голоса урока (playbackRate: у буфера тон меняется вместе со скоростью, поэтому при скорости не 1× слоты слов остаются ещё и на <audio> — wordLaneClips.prepareWords).
//  • Свои звуки: loadSoundBuffer(id, getBytes) — байты (WAV/mp3) → AudioBuffer, один раз на id; soundBuffer(id) — готовый буфер или null; dropSoundBuffers() — игра закрыта.
import { getLessonMuted, getVoiceRate } from '../../lessonVolume.js'
import { playGameBuffer } from '../../../../shared/lib/gameBufferPlay.js'
import { gameCtxState, webAudioOn } from '../../../../shared/lib/gameAudioCtx.js'
import { bufferOfUrl, decodeBytes, MAX_BUFFER_S } from './wordLaneFetch.js'

const keyUrls = new Map() // ключ слота → адрес файла

export const registerWordBuffer = (key, url) => { keyUrls.set(key, url) }
export const forgetWordBuffers = () => { keyUrls.clear() }
/** Декодированный звук слова/реплики по ключу слота или null */
export const wordBuffer = key => { const u = keyUrls.get(key); return u ? bufferOfUrl(u) : null }
/** Длительность звука слота в мс при скорости rate (по буферу — настоящая длина файла) или 0 */
export const wordBufferMs = (key, rate = 1) => { const b = wordBuffer(key); return b ? Math.round((b.duration * 1000) / (rate > 0 ? rate : 1)) : 0 }
/** Состояние слота-буфера для диагностики: { buffer: true, ms, ctx } или null, если буфера нет */
export const wordBufferInfo = key => { const b = wordBuffer(key); return b ? { buffer: true, ms: Math.round(b.duration * 1000), ctx: gameCtxState() } : null }

/** Сыграть буфер слота. false — буфера нет (идти на <audio>). onStart() — звук действительно стартовал; onResult({ play: 'started' | 'ctx-stuck' | 'rejected', ms, ctx }) — один раз */
export function playWordBuffer(key, onResult = null, onStart = null) {
  const buffer = wordBuffer(key)
  if (!buffer) return false
  return playGameBuffer(buffer, { rate: getVoiceRate(), gain: getLessonMuted() ? 0 : 1, onStart, onResult })
}

const ready = new Map()   // id → AudioBuffer
const loading = new Map() // id → промис (один раз на id)

/** Байты → AudioBuffer (id — ключ кэша). Не вышло / длиннее MAX_BUFFER_S / нет Web Audio → null (звук играет <audio>) и при следующем вызове попробуем заново */
export function loadSoundBuffer(id, getBytes) {
  if (!webAudioOn()) return Promise.resolve(null)
  if (ready.has(id)) return Promise.resolve(ready.get(id))
  if (!loading.has(id)) {
    const p = Promise.resolve().then(getBytes).then(bytes => decodeBytes(bytes)).then(a => (a && a.duration <= MAX_BUFFER_S ? a : null)).catch(() => null)
      .then(a => { loading.delete(id); if (a) ready.set(id, a); return a })
    loading.set(id, p)
  }
  return loading.get(id)
}
/** Готовый буфер своего звука или null */
export const soundBuffer = id => ready.get(id) ?? null
/** Игра закрыта */
export function dropSoundBuffers() { ready.clear(); loading.clear() }

/** Файл → байты (адрес из кэша браузера); отказ сети — исключение */
export const bytesOfUrl = url => fetch(url, { cache: 'force-cache' }).then(r => { if (!r.ok) throw new Error(`http ${r.status}`); return r.arrayBuffer() })
/** WAV (Uint8Array) → ArrayBuffer для decodeAudioData (отдельная копия: decode забирает буфер) */
export const bytesOfWav = wav => wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength)
