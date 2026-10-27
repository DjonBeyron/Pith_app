// Озвучка диктора отдельными короткими клипами. Раньше высказывания играли из ОДНОГО mp3 перемоткой (currentTime) — на iPhone это ненадёжно: Safari не подгружает аудио заранее (readyState остаётся 0,
// пока не нажали play), перемотка до загрузки игнорируется, а у удалённой ссылки ещё нужна поддержка Range. В тесте файл к моменту первого слова оставался незагруженным — диктор молчал.
// Теперь файл один раз декодируется (decodeAudioData) в память, режется на клипы по высказываниям и каждый клип становится маленьким WAV — как ноты-награды, которые на iPhone играют хорошо:
// по одному <audio> на высказывание, «разбуженному» в тапе «Начать» (play внутри жеста), потом ему подставляется клип. Играет элемент с нулевой отметки — перематывать нечего.
import { getLessonMuted, getVoiceRate } from '../../lessonVolume.js'
import { pLog } from '../../../../shared/lib/debug.js'

export const FADE_IN_S = 0.004
export const FADE_OUT_S = 0.012

/** Ключ отрезка файла: у одного отрезка (высказывания) один элемент на все повторы */
export const spanKey = span => `${span.start.toFixed(3)}-${span.end.toFixed(3)}`

/** WAV (моно, 16 бит) из куска samples [start, end) секунд при частоте rate; края сглажены (без щелчков) */
export function sliceToWav(samples, rate, start, end) {
  const a = Math.max(0, Math.floor(start * rate))
  const b = Math.min(samples.length, Math.ceil(end * rate))
  const n = Math.max(0, b - a)
  const buf = new ArrayBuffer(44 + n * 2)
  const v = new DataView(buf)
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true)
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, n * 2, true)
  const fin = Math.floor(FADE_IN_S * rate)
  const fout = Math.floor(FADE_OUT_S * rate)
  for (let i = 0; i < n; i++) {
    let g = 1
    if (i < fin) g = i / fin
    else if (i >= n - fout) g = (n - 1 - i) / fout
    const x = Math.max(-1, Math.min(1, samples[a + i] * g))
    v.setInt16(44 + i * 2, Math.round(x * 32767), true)
  }
  return new Uint8Array(buf)
}

/** Моно из AudioBuffer (несколько каналов усредняются) */
export function monoOf(audioBuffer) {
  const ch = audioBuffer.numberOfChannels
  const out = new Float32Array(audioBuffer.length)
  for (let c = 0; c < ch; c++) { const d = audioBuffer.getChannelData(c); for (let i = 0; i < out.length; i++) out[i] += d[i] / ch }
  return out
}

let set = null // { els: Map key → Audio, urls: string[], silence, spans, state }

const SILENCE_WAV = () => URL.createObjectURL(new Blob([sliceToWav(new Float32Array(640), 8000, 0, 0.08)], { type: 'audio/wav' }))

/**
 * Из тапа «Начать» (жест!): создать элементы под каждый отрезок и «разбудить» их тишиной, а в фоне декодировать файл и нарезать клипы. spans — [{ start, end }] в секундах файла (уникальные).
 * Возвращает промис «готово» (true — клипы нарезаны; false — не вышло: диктор играет запасным путём). Без поддержки — тихо false.
 */
export function prepareClips(src, spans) {
  releaseClips()
  if (!src || !spans?.length || typeof Audio === 'undefined') return Promise.resolve(false)
  const uniq = [...new Map(spans.map(s => [spanKey(s), s])).values()]
  try {
    const silence = SILENCE_WAV()
    const els = new Map(uniq.map(s => {
      const a = new Audio(silence)
      a.preload = 'auto'
      a.setAttribute('playsinline', '')
      const woke = a.play().then(() => a.pause()).catch(() => {})
      return [spanKey(s), { a, woke, url: null }]
    }))
    set = { els, silence, urls: [], state: 'loading' }
  } catch { set = null; return Promise.resolve(false) }
  const mine = set
  return decodeAndSlice(src, uniq, mine).then(ok => { if (set === mine) mine.state = ok ? 'ready' : 'failed'; return ok })
}

async function decodeAndSlice(src, uniq, mine) {
  try {
    const Ctx = typeof window !== 'undefined' ? window.OfflineAudioContext || window.webkitOfflineAudioContext : null
    if (!Ctx) return false
    const bytes = await (await fetch(src)).arrayBuffer()
    const audio = await new Ctx(1, 1, 44100).decodeAudioData(bytes)
    if (set !== mine) return false
    const mono = monoOf(audio)
    for (const s of uniq) {
      const e = mine.els.get(spanKey(s))
      const url = URL.createObjectURL(new Blob([sliceToWav(mono, audio.sampleRate, s.start, s.end)], { type: 'audio/wav' }))
      mine.urls.push(url); e.url = url
      e.woke.then(() => { if (set === mine) { e.a.src = url; e.a.load() } })
    }
    pLog(`[word-lane] клипы диктора нарезаны: ${uniq.length} шт., файл ${audio.duration.toFixed(1)} с`)
    return true
  } catch (err) {
    pLog(`[word-lane] клипы диктора не нарезались (${err?.name ?? err}) — играем перемоткой файла`)
    return false
  }
}

/** Сыграть клип отрезка. false — клипа нет/ещё не готов/звук урока выключен (вызывающий идёт запасным путём; при «без звука» запасной тоже молчит) */
export function playClip(span) {
  const e = set?.els.get(spanKey(span))
  if (!e?.url) return false
  try {
    if (e.a.src !== e.url) e.a.src = e.url // «разбудка» ещё не кончилась — подставляем сейчас
    e.a.muted = getLessonMuted()
    e.a.playbackRate = getVoiceRate()
    e.a.currentTime = 0
    e.a.play().catch(err => pLog(`[word-lane] клип не пошёл: ${err?.name ?? err}`))
    return true
  } catch { return false }
}

export const clipsState = () => set?.state ?? 'none'

/** Игра закрыта (и перед новой подготовкой) */
export function releaseClips() {
  if (!set) return
  for (const { a } of set.els.values()) { try { a.pause(); a.removeAttribute('src') } catch { /* уже свободен */ } }
  for (const u of set.urls) URL.revokeObjectURL(u)
  URL.revokeObjectURL(set.silence)
  set = null
}
