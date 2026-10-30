// Звук появления плашки игры «Повтори за диктором» («Теперь твоя очередь», название раунда): короткий мягкий «блюп» — синус с лёгким подъёмом тона (480 → 720 Гц), плавный вход (8 мс) и затухание, 130 мс, тихий
// (RMS вдвое ниже нот награды): ровно перед очередью ученика слушатель уже поднимается под плашкой, а долгий звук попал бы в него. Как и ноты (wordLaneNotes.js), это маленький WAV, который мы синтезируем сами,
// и играет его обычный <audio>, не Web Audio: на iOS Web Audio идёт в другой категории аудиосессии (см. sounds.js). Автозапуск по таймеру iOS разрешает только тем элементам, что хоть раз стартовали в жесте,
// поэтому unlockPlate() зовёт startGameAudio (wordLaneStart.js, тап «Начать» и повторный прогрев) рядом с unlockNotes(), а releaseNotes() — releasePlate(): слот живёт и умирает вместе с нотами.
// Звук уважает тишину приложения: «полная тишина» (soundQuiet.holdSilence — вкладка «Голос» и т. п.), «без звука» в уроке (lessonVolume) и громкость игры (админка «Звуки игры»); каждое проигрывание пишется в кольцо
// soundLog (диагностика «что играло перед записью»). «Без звука» у награды плашку не выключает: плашка — не награда.
// Диагностика тишины (iPhone): каждое проигрывание оставляет строку «[plate-sound] play() → …» (исход play(), readyState, userActivation, audioSession.type, мс с тапа) и событие 'plate-sound' в журнале отладки — как реплики кота.
import { getLessonMuted } from '../../lessonVolume.js'
import { isSilenced } from '../../../../shared/lib/soundQuiet.js'
import { logElementSound } from '../../../../shared/lib/soundLog.js'
import { getRewardVolume } from '../../../../shared/lib/rewardSound.js'
import { gameAudioNote } from '../../../../shared/lib/gameAudioSink.js'
import { pLog } from '../../../../shared/lib/debug.js'
import { watchPlay } from './wordLanePlayWatch.js'
import { audioEnv, PLAY_TEXT } from './wordLaneCatVoiceLog.js'

export const PLATE_MS = 130        // длина звука: ≤ 150 мс, чтобы не залезть в слушатель
export const PLATE_FROM_HZ = 480   // тон в начале
export const PLATE_TO_HZ = 720     // и в конце подъёма: «появилось», а не «ошибка»
export const PLATE_RMS = 1300      // из 32767 — вдвое тише нот награды (TARGET_RMS 2600)
const PLATE_PEAK = 12000
const RATE = 22050

/** 16-битный моно WAV из отсчётов → Uint8Array */
function wav16(samples, rate = RATE) {
  const n = samples.length
  const buf = new ArrayBuffer(44 + n * 2)
  const v = new DataView(buf)
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true)
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, samples[i], true)
  return new Uint8Array(buf)
}

/** WAV плашки: синус с подъёмом тона PLATE_FROM_HZ → PLATE_TO_HZ, мягкая октава (×0,2), вход 8 мс и затухание, нормирован по RMS = PLATE_RMS */
export function makePlateWav(ms = PLATE_MS, rate = RATE) {
  const n = Math.floor((rate * ms) / 1000)
  const attack = Math.floor(rate * 0.008)
  const raw = new Float32Array(n)
  let phase = 0, sumSq = 0
  for (let i = 0; i < n; i++) {
    const t = i / n
    phase += (2 * Math.PI * (PLATE_FROM_HZ + (PLATE_TO_HZ - PLATE_FROM_HZ) * t)) / rate
    raw[i] = (Math.sin(phase) + 0.2 * Math.sin(2 * phase)) * Math.min(1, i / attack) * (1 - t) ** 1.8
    sumSq += raw[i] * raw[i]
  }
  const rms = Math.sqrt(sumSq / Math.max(1, n))
  let gain = rms > 0 ? PLATE_RMS / rms : 0
  const peak = raw.reduce((m, v) => Math.max(m, Math.abs(v)), 0) * gain
  if (peak > PLATE_PEAK) gain *= PLATE_PEAK / peak
  return wav16(Int16Array.from(raw, x => Math.round(x * gain)), rate)
}

let el = null
let url = null
let hush = null // тихий звук для «пробуждения» элемента в жесте

/** Из тапа «Начать» (wordLaneStart.js, рядом с unlockNotes): создать элемент и «разбудить» его тихим звуком (play внутри жеста), затем подменить src на звук плашки и прогрузить. Без поддержки — тихо ничего не делает */
export function unlockPlate() {
  if (el || typeof Audio === 'undefined') return
  try {
    url ??= URL.createObjectURL(new Blob([makePlateWav()], { type: 'audio/wav' }))
    hush ??= URL.createObjectURL(new Blob([wav16(new Int16Array(Math.floor((RATE * 80) / 1000)))], { type: 'audio/wav' }))
    const a = new Audio(hush)
    a.preload = 'auto'
    a.volume = getRewardVolume()
    a.play().then(() => { a.pause(); a.src = url; a.load() }).catch(err => { pLog(`[plate-sound] пробуждение слота отклонено (${err?.name ?? err}) — звук плашки может молчать до следующего прогрева`); gameAudioNote('plate-sound', { wake: 'rejected', error: err?.name ?? String(err ?? 'error') }) })
    el = a
  } catch { el = null }
}

/** Исход play() плашки → строка журнала плеера и событие отладки */
function reportPlate(res, env) {
  const d = { play: res.play, ...(res.error ? { error: res.error } : {}), playMs: res.ms, rs: res.rs, activation: env.activation, as: env.as, sinceTap: env.sinceTap, sinceSettle: env.sinceSettle, interrupts: env.interrupts }
  try { pLog(`[plate-sound] play() → ${PLAY_TEXT[d.play] ?? d.play}${d.error ? ` (${d.error})` : ''}, ${d.playMs} мс; readyState=${d.rs ?? '—'}; userActivation=${d.activation === 'alive' ? 'жив' : d.activation === 'expired' ? 'истёк' : '—'}; audioSession.type=${d.as ?? '—'}; с тапа ${d.sinceTap ?? '—'} мс; прерываний с тапа ${d.interrupts ?? '—'}`) } catch { /* журнал не мешает игре */ }
  gameAudioNote('plate-sound', d)
}

/** Сыграть звук плашки. false — не сыграл (нет элемента, «без звука» в уроке, полная тишина приложения, не разрешили) */
export function playPlate() {
  if (!el || getLessonMuted() || isSilenced()) return false
  try {
    if (el.src !== url) el.src = url // прогрузка ещё не успела — подставляем сейчас
    el.volume = getRewardVolume()    // iOS игнорирует; Android/десктоп слушаются
    el.currentTime = 0
    logElementSound('audio-play', 'wl-plate', el)
    const env = audioEnv()
    const p = el.play()
    watchPlay(el, p, res => reportPlate(res, env))
    p?.catch?.(() => {})
    return true
  } catch { return false }
}

/** Игра закрыта (releaseNotes): отпустить элемент и blob-ссылки */
export function releasePlate() {
  if (el) { try { el.pause(); el.removeAttribute('src') } catch { /* уже свободен */ } }
  if (url) URL.revokeObjectURL(url)
  if (hush) URL.revokeObjectURL(hush)
  el = null; url = null; hush = null
}
