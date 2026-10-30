// Голос диктора в игре «Повтори за диктором»: слово звучит из библиотеки озвучки (word_audio, ключ wordKey), а если записи нет — голосом системы (speechSynthesis).
// Порядок попыток: прогретый <audio> приложения (primedAudio — ему iOS уже разрешил играть без свежего жеста, а слова в игре идут по таймеру) → проигрыватель слов урока (wordAudioPlayer) →
// речь системы. Звук урока «без звука» и скорость голоса из шапки учитываются во всех трёх. unlockVoice() звать из тапа «Начать»: будит синтезатор, чтобы он потом заговорил сам.
import { cachedWordAudio } from '../../../../shared/lib/wordAudio/wordAudioApi.js'
import { wordKey } from '../../../../shared/lib/wordAudio/wordKey.js'
import { playPrimed, stopPrimed } from '../../../../shared/lib/primedAudio.js'
import { playWord, stopWord } from '../../word-audio/wordAudioPlayer.js'
import { getLessonMuted, getVoiceRate } from '../../lessonVolume.js'
import { pLog } from '../../../../shared/lib/debug.js'

const synth = () => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null)

/** Из тапа «Начать»: разбудить синтезатор речи (iOS говорит по таймеру только после первого запуска из жеста). Тихо: пустая реплика */
export function unlockVoice() {
  try { const s = synth(); if (s) { s.cancel(); const u = new SpeechSynthesisUtterance(' '); u.volume = 0; s.speak(u) } } catch { /* без синтезатора голос диктора — из библиотеки */ }
}

/** Сказать слово. Возвращает чем: 'primed' | 'word' | 'synth' | null (тишина — слова нет в библиотеке и синтезатора нет) */
export function speakWord(word, lang = 'en-US') {
  const key = wordKey(word)
  const row = key ? cachedWordAudio()?.get(key) : null
  if (row?.url) {
    if (playPrimed(row.url, { muted: getLessonMuted(), rate: getVoiceRate() })) return 'primed'
    if (playWord(key)) return 'word'
  }
  const s = synth()
  if (!s || getLessonMuted()) return null
  try {
    s.cancel()
    const u = new SpeechSynthesisUtterance(String(word))
    u.lang = lang
    u.rate = getVoiceRate()
    s.speak(u)
    return 'synth'
  } catch (e) { pLog(`[word-lane] голос диктора не заговорил: ${e?.message ?? e}`); return null }
}

/**
 * Сказать реплику голосом системы — запасной путь реплик кота (Пита), когда слот озвучки не успел подготовиться (wordLaneLineGate.js). iOS без жеста синтезатору молчать не запрещает, но и не обещает голоса —
 * поэтому исход пишем: onResult({ play: 'ok' | 'rejected' | 'no-start', error?, ms }) — 'ok' по событию start, 'rejected' по error, 'no-start' если за timeoutMs ни того ни другого. false — не говорил (нет синтезатора, «без звука»).
 */
export function speakText(text, lang = 'ru-RU', onResult = null, { setTimer = setTimeout, now = () => performance.now(), timeoutMs = 700 } = {}) {
  const s = synth()
  if (!s || getLessonMuted() || !text) return false
  try {
    const t0 = now()
    let done = false
    const finish = (play, error) => { if (done) return; done = true; onResult?.({ play, ...(error ? { error } : {}), ms: Math.round(now() - t0) }) }
    s.cancel()
    const u = new SpeechSynthesisUtterance(String(text))
    u.lang = lang
    u.rate = getVoiceRate()
    u.onstart = () => finish('ok')
    u.onerror = ev => finish('rejected', ev?.error ?? 'error')
    s.speak(u)
    setTimer(() => finish('no-start'), timeoutMs)
    return true
  } catch (e) { pLog(`[word-lane] голос системы не заговорил: ${e?.message ?? e}`); return false }
}

let track = null   // <audio> озвучки автора (готовится в тапе «Начать», играет по таймеру фазы)
let trackSrc = null

// Тихий звук для «пробуждения» элемента в жесте (как у нот): iOS разрешает автозапуск только элементу, что уже играл по тапу
const silenceUrl = (() => { let u = null; return () => (u ??= URL.createObjectURL(new Blob([makeSilenceWav()], { type: 'audio/wav' }))) })()
function makeSilenceWav(ms = 80, rate = 8000) {
  const n = Math.floor((rate * ms) / 1000)
  const buf = new ArrayBuffer(44 + n)
  const v = new DataView(buf)
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true)
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true)
  str(36, 'data'); v.setUint32(40, n, true)
  new Uint8Array(buf, 44).fill(128) // 8-бит беззнаковый: 128 — тишина
  return new Uint8Array(buf)
}

/**
 * Из тапа «Начать»: заранее готовим элемент для озвучки автора. Его «будит» тихий звук внутри жеста (иначе iOS не даст включить файл по таймеру), затем подменяем src на файл и прогружаем —
 * к моменту audioAt файл уже декодирован, и звук стартует без задержки (раньше первый play() ждал декодирования 100–400 мс, и картинка расходилась со звуком). Нет src — ничего не делает.
 */
export function prepareTrack(src) {
  if (!src || typeof Audio === 'undefined') return
  try {
    releaseTrack()
    const a = new Audio(silenceUrl())
    a.preload = 'auto'
    track = a; trackSrc = src
    a.play().then(() => { if (track !== a) return; a.pause(); a.src = src; a.load() }).catch(() => { if (track === a) { a.src = src; a.load() } })
  } catch { track = null; trackSrc = null }
}

/** После прерывания аудиосессии (в жесте): элемент записи автора мёртв — готовим новый тем же путём, что в тапе «Начать». Нет записи — ничего */
export function rewakeTrack() { const src = trackSrc; if (src) prepareTrack(src) }

function releaseTrack() { if (track) { try { track.pause(); track.removeAttribute('src') } catch { /* уже свободен */ } } track = null; trackSrc = null }

let clipTimer = 0

/**
 * Озвучка автора (файл ElevenLabs ноды): целиком или ОТРЕЗКОМ span { start, end } (секунды файла) — так проигрывается одно высказывание из общего файла: перемотка на start, play, пауза в end.
 * Заранее подготовленный элемент → (целиком) прогретый элемент приложения → обычный <audio>. Возвращает элемент или null. Новый вызов обрывает предыдущий отрезок.
 */
export function playTrack(src, span = null) {
  if (!src) return null
  clearTimeout(clipTimer)
  const start = span?.start ?? 0
  const rate = getVoiceRate()
  const stopAt = el => { if (span) clipTimer = setTimeout(() => { try { el.pause() } catch { /* уже остановлен */ } }, Math.max(60, ((span.end - start) * 1000) / (rate > 0 ? rate : 1))) }
  if (track && trackSrc === src) {
    try {
      if (track.src !== src && !track.src.endsWith(src)) { track.src = src }
      track.muted = getLessonMuted()
      track.playbackRate = rate
      track.currentTime = start
      track.play().catch(e => pLog(`[word-lane] озвучка автора не пошла: ${e?.name ?? e}`))
      stopAt(track)
      return track
    } catch { /* пробуем прогретый элемент */ }
  }
  const primed = span ? null : playPrimed(src, { muted: getLessonMuted(), rate })
  if (primed) return primed
  try {
    track = new Audio(src)
    trackSrc = src
    track.muted = getLessonMuted()
    track.playbackRate = rate
    track.currentTime = start
    track.play().catch(e => pLog(`[word-lane] озвучка автора не пошла: ${e?.name ?? e}`))
    stopAt(track)
    return track
  } catch { return null }
}

export function stopVoice() {
  clearTimeout(clipTimer)
  releaseTrack()
  try { stopPrimed() } catch { /* не играл */ }
  try { stopWord() } catch { /* не играл */ }
  try { synth()?.cancel() } catch { /* не играл */ }
}
