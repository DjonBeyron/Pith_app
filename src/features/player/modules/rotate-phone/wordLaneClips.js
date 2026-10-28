// Звуки диктора на отдельных <audio> (слоты). Раньше высказывания играли из ОДНОГО mp3 перемоткой (currentTime) — на iPhone это ненадёжно: Safari не подгружает аудио заранее (readyState остаётся 0,
// пока не нажали play), перемотка до загрузки игнорируется, а у удалённой ссылки ещё нужна поддержка Range. В тесте файл к моменту первого слова оставался незагруженным — диктор молчал.
// Теперь файл один раз декодируется (decodeAudioData) в память, режется на клипы по высказываниям и каждый клип становится маленьким WAV — как ноты-награды, которые на iPhone играют хорошо:
// по одному <audio> на высказывание, «разбуженному» в тапе «Начать» (play внутри жеста), потом ему подставляется клип. Играет элемент с нулевой отметки — перематывать нечего.
import { getLessonMuted, getVoiceRate } from '../../lessonVolume.js'
import { pLog } from '../../../../shared/lib/debug.js'
import { speechBounds } from './wordLaneTrim.js'

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

// Слоты звука: по <audio> на каждый звук диктора. Ключ слота: `s:<отрезок>` — клип, вырезанный из записи автора (фраза целиком в финале), `w:<слово>` — озвучка куска из библиотеки озвучки слов
// (отдельный файл на кусок — основной источник диктора). Все слоты создаются и «будятся» тишиной в тапе «Начать» (play внутри жеста — иначе iPhone не даст играть по таймеру), настоящий
// звук подставляется следом.
let slots = null // { els: Map key → { a, woke, url }, urls: string[], silence, state }

const SILENCE_WAV = () => URL.createObjectURL(new Blob([sliceToWav(new Float32Array(640), 8000, 0, 0.08)], { type: 'audio/wav' }))

function ensureSlots() {
  slots ??= { els: new Map(), urls: [], silence: SILENCE_WAV(), state: 'loading' }
  return slots
}

/** Создать слот key и разбудить его (только в жесте). Повторный вызов с тем же ключом — тот же слот */
function wake(key) {
  const set = ensureSlots()
  if (set.els.has(key)) return set.els.get(key)
  const a = new Audio(set.silence)
  a.preload = 'auto'
  a.setAttribute('playsinline', '')
  const e = { a, woke: a.play().then(() => a.pause()).catch(() => {}), url: null }
  set.els.set(key, e)
  return e
}

function attach(set, e, url, own) {
  if (own) set.urls.push(url)
  e.url = url
  e.woke.then(() => { if (slots === set) { e.a.src = url; e.a.load() } })
}

/** Ключ слота слова из библиотеки */
export const wordSlotKey = key => `w:${key}`

/**
 * Из тапа «Начать» (жест!): слоты для озвучки кусков из библиотеки — items: [{ key (wordKey), url }]. Каждый файл подгружается blob-ом (как слова урока: play() без сети; CORS не пустил — прямая
 * ссылка). Возвращает промис «готово».
 */
export function prepareWords(items) {
  if (typeof Audio === 'undefined' || !items?.length) return Promise.resolve(false)
  let set
  try { set = ensureSlots(); items.forEach(it => wake(wordSlotKey(it.key))) } catch { releaseClips(); return Promise.resolve(false) }
  return Promise.all(items.map(async it => {
    const e = set.els.get(wordSlotKey(it.key))
    try {
      const res = await fetch(it.url)
      if (!res.ok) throw new Error(`http ${res.status}`)
      const blob = await res.blob()
      attach(set, e, URL.createObjectURL(blob), true)
      await measureSpeech(it.url, blob).catch(() => {}) // где в файле звучит голос — не вышло, играем по длине из библиотеки
    } catch { attach(set, e, it.url, false) } // прямая ссылка: браузер докачает при play()
  })).then(() => true, () => false)
}

// Где в файле слова звучит голос (wordLaneTrim): { lead, ms } в мс — тишина до слова и длина самого слова без «хвоста». Живёт до перезагрузки: файл библиотеки не меняется
const speechCache = new Map()

/** Голос в файле по ссылке: { lead, ms } или null (файл ещё не измеряли / не вышло) */
export const speechOfUrl = url => speechCache.get(url) ?? null

const decodeBytes = async bytes => {
  const Ctx = typeof window !== 'undefined' ? window.OfflineAudioContext || window.webkitOfflineAudioContext : null
  return Ctx ? new Ctx(1, 1, 44100).decodeAudioData(bytes) : null
}

async function measureSpeech(url, blob) {
  if (speechCache.has(url)) return
  const audio = await decodeBytes(await blob.arrayBuffer())
  if (!audio) return
  const b = speechBounds(monoOf(audio), audio.sampleRate)
  speechCache.set(url, { lead: Math.round(b.start * 1000), ms: Math.round((b.end - b.start) * 1000) })
}

/**
 * Из тапа «Начать» (жест!): слоты под каждый отрезок записи автора (фраза целиком), а в фоне файл декодируется и нарезается. spans — [{ start, end }] в секундах файла.
 * Возвращает промис «готово» (true — нарезано; false — не вышло: диктор играет запасным путём). Без поддержки — тихо false.
 */
export function prepareClips(src, spans) {
  if (!src || !spans?.length || typeof Audio === 'undefined') return Promise.resolve(false)
  const uniq = [...new Map(spans.map(s => [spanKey(s), s])).values()]
  let set
  try { set = ensureSlots(); uniq.forEach(s => wake(`s:${spanKey(s)}`)) } catch { releaseClips(); return Promise.resolve(false) }
  return decodeAndSlice(src, uniq, set).then(ok => { if (slots === set) set.state = ok ? 'ready' : 'failed'; return ok })
}

async function decodeAndSlice(src, uniq, set) {
  try {
    const audio = await decodeBytes(await (await fetch(src)).arrayBuffer())
    if (!audio || slots !== set) return false
    const mono = monoOf(audio)
    for (const s of uniq) attach(set, set.els.get(`s:${spanKey(s)}`), URL.createObjectURL(new Blob([sliceToWav(mono, audio.sampleRate, s.start, s.end)], { type: 'audio/wav' })), true)
    pLog(`[word-lane] клипы записи нарезаны: ${uniq.length} шт., файл ${audio.duration.toFixed(1)} с`)
    return true
  } catch (err) {
    pLog(`[word-lane] клипы записи не нарезались (${err?.name ?? err}) — играем перемоткой файла`)
    return false
  }
}

/** Сыграть слот. false — слота нет/звук не готов (вызывающий идёт запасным путём; при «без звука» играет muted) */
function playSlot(key) {
  const e = slots?.els.get(key)
  if (!e?.url) return false
  try {
    if (e.a.src !== e.url) e.a.src = e.url // «разбудка» ещё не кончилась — подставляем сейчас
    e.a.muted = getLessonMuted()
    e.a.playbackRate = getVoiceRate()
    e.a.currentTime = 0
    e.a.play().catch(err => pLog(`[word-lane] звук не пошёл: ${err?.name ?? err}`))
    return true
  } catch { return false }
}

/** Клип записи автора по отрезку */
export const playClip = span => playSlot(`s:${spanKey(span)}`)
/** Озвучка куска из библиотеки по ключу слова (wordKey) */
export const playWordSlot = key => playSlot(wordSlotKey(key))
/** Есть ли готовая озвучка куска (слот с подгруженным звуком) */
export const hasWordSlot = key => !!slots?.els.get(wordSlotKey(key))?.url

export const clipsState = () => slots?.state ?? 'none'

/** Игра закрыта */
export function releaseClips() {
  if (!slots) return
  for (const { a } of slots.els.values()) { try { a.pause(); a.removeAttribute('src') } catch { /* уже свободен */ } }
  for (const u of slots.urls) URL.revokeObjectURL(u)
  URL.revokeObjectURL(slots.silence)
  slots = null
}
