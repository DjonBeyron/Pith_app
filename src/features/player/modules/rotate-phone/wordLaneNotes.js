// «Лесенка нот» игры «Повтори за диктором»: каждая принятая пилюля ученика звучит нотой выше предыдущей (до — ми — соль), три слова складываются в мелодию, а не в «штраф за ошибку».
// Ноты — маленькие WAV, которые мы синтезируем сами (синус с мягким входом и затуханием, без файлов и сети). Играют обычные <audio>, не Web Audio: на iOS Web Audio идёт в другой
// категории аудиосессии (см. sounds.js). Автозапуск по таймеру iOS разрешает только тем элементам, что хоть раз стартовали в жесте, поэтому unlockNotes() зовут из тапа «Начать»:
// элемент играет тихий wav, затем ему подменяется src на ноту (как у primedAudio) и нота прогружается заранее — первое проигрывание без задержки. Звук урока «без звука» учитывается.
// ЧТО ЗВУЧИТ выбирает владелец (wordLaneMeow.js, админка «Голос» → «Звуки игры»): по умолчанию «мяу» (три готовых wav, тише нот вдвое), либо эти ноты, либо тишина; громкость — audio.volume (iOS её игнорирует). Слоты и прогрев у всех вариантов общие.
// РЕЖИМ 'custom' (настоящее «мяу» ElevenLabs или свой файл): ОДНА запись на все три слота, тоны делает playbackRate 1 / 1.26 / 1.5 при preservesPitch=false (+ webkitPreservesPitch) — высота растёт вместе со скоростью.
// load() сбрасывает playbackRate к defaultPlaybackRate, а preservesPitch надо поставить ДО play (в том числе у прогрева в тапе) — поэтому tuneSlot() зовут и в unlockNotes, и перед каждым play.
// ГРОМКОСТЬ НОТ ВЫРОВНЕНА: каждая нота нормируется по RMS (одна и та же энергия), третья — финальный аккорд, чуть длиннее и на 20 % громче, поэтому «тише предыдущих» по сигналу быть не может.
// Если на телефоне третья всё равно звучит тише — причина вне сигнала: микрофон закрывался как раз во время неё (wordLaneListen.FULL_STOP_MS отодвинут именно для этого).
import { getLessonMuted } from '../../lessonVolume.js'
import { getRewardSound, getRewardVolume, getRewardUrl, REWARD_RATES, MEOW_PATHS } from './wordLaneMeow.js'

export const NOTES = [
  { freqs: [523.25], ms: 380, level: 1 },                          // C5
  { freqs: [659.25], ms: 380, level: 1 },                          // E5
  { freqs: [783.99, 1046.5, 1318.5], ms: 560, level: 1.2 },        // финал: G5 + C6 + E6 — мажорный аккорд, звучит «победой»
]
export const NOTE_FREQS = NOTES.map(n => n.freqs[0])
export const NOTE_MS = NOTES[0].ms
export const TARGET_RMS = 2600  // из 32767 — комфортная громкость; peak ограничен PEAK_LIMIT
export const PEAK_LIMIT = 24000
const RATE = 22050

/** Один звук: сумма синусов freqs (Гц) длиной ms мс, мягкий вход (20 мс) и плавное затухание, нормирован по RMS (TARGET_RMS × level); 16-бит моно WAV → Uint8Array. freqs=[0] — тишина */
export function makeNoteWav(freqs, ms = NOTE_MS, level = 1, rate = RATE) {
  const list = Array.isArray(freqs) ? freqs : [freqs]
  const n = Math.floor((rate * ms) / 1000)
  const attack = Math.floor(rate * 0.02)
  const raw = new Float32Array(n)
  let sumSq = 0
  for (let i = 0; i < n; i++) {
    const env = Math.min(1, i / attack) * (1 - i / n) ** 1.6
    // основной тон и мягкая октава (только у одиночных нот): «звенит», а не гудит
    let x = 0
    list.forEach(f => { x += Math.sin((2 * Math.PI * f * i) / rate) })
    if (list.length === 1) x += 0.25 * Math.sin((2 * Math.PI * list[0] * 2 * i) / rate)
    raw[i] = x * env
    sumSq += raw[i] * raw[i]
  }
  const rms = Math.sqrt(sumSq / Math.max(1, n))
  let gain = rms > 0 ? (TARGET_RMS * level) / rms : 0
  const peak = raw.reduce((m, v) => Math.max(m, Math.abs(v)), 0) * gain
  if (peak > PEAK_LIMIT) gain *= PEAK_LIMIT / peak
  const buf = new ArrayBuffer(44 + n * 2)
  const v = new DataView(buf)
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true)
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(raw[i] * gain), true)
  return new Uint8Array(buf)
}

/** Среднеквадратичная громкость WAV (16 бит, моно) — для проверки, что ноты равны по энергии */
export function wavRms(wav) {
  const v = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  const n = (wav.length - 44) / 2
  let s = 0
  for (let i = 0; i < n; i++) { const x = v.getInt16(44 + i * 2, true); s += x * x }
  return Math.sqrt(s / Math.max(1, n))
}

let urls = null
let els = null
let silence = null // тихий звук для «пробуждения» элементов в жесте

function ensureUrls() {
  urls ??= NOTES.map(n => URL.createObjectURL(new Blob([makeNoteWav(n.freqs, n.ms, n.level)], { type: 'audio/wav' })))
  return urls
}
/** Адреса трёх звуков выбранного варианта: файлы «мяу» или blob-ссылки нот */
const sourcesFor = mode => {
  if (mode === 'custom') { const u = getRewardUrl(); return [u, u, u] }
  return mode === 'meow' ? MEOW_PATHS : ensureUrls()
}
/** Тон k у <audio>: для 'custom' — скорость REWARD_RATES[k] без сохранения высоты (preservesPitch=false), иначе обычная скорость. Зовут до play и после смены src */
export function tuneSlot(a, k, mode = getRewardSound()) {
  const rate = mode === 'custom' ? (REWARD_RATES[Math.min(Math.max(0, k), REWARD_RATES.length - 1)] ?? 1) : 1
  try {
    if (mode === 'custom') { a.preservesPitch = false; a.webkitPreservesPitch = false; a.mozPreservesPitch = false }
    a.defaultPlaybackRate = rate // load() вернёт скорость сюда, а не к 1
    a.playbackRate = rate
  } catch { /* старый браузер без playbackRate */ }
}
/** a.src всегда абсолютный — относительный адрес сравниваем после приведения */
const absUrl = u => { try { return new URL(u, globalThis.location?.href).href } catch { return String(u) } }

/** Из тапа «Начать»: создать элементы звуков награды и «разбудить» их тихим звуком (play внутри жеста), затем подменить src на свой (мяу или нота) и прогрузить. «Без звука» в админке — ничего не создаём. Без поддержки — тихо ничего не делает */
export function unlockNotes() {
  if (els || typeof Audio === 'undefined') return
  const mode = getRewardSound()
  if (mode === 'off') return
  try {
    const own = sourcesFor(mode)
    silence ??= URL.createObjectURL(new Blob([makeNoteWav([0], 80)], { type: 'audio/wav' })) // тишина 80 мс
    els = NOTES.map((_, k) => {
      const a = new Audio(silence)
      a.preload = 'auto'
      a.volume = getRewardVolume()
      tuneSlot(a, k, mode) // preservesPitch до первого play (в жесте)
      a.play().then(() => { a.pause(); a.src = own[k]; a.load(); tuneSlot(a, k, mode) }).catch(() => {})
      return a
    })
  } catch { els = null }
}

/** Сыграть звук k (0…2) выбранного варианта. false — не сыграл (нет элементов, «без звука» в админке или в уроке, не разрешили) */
export function playNote(k) {
  if (getRewardSound() === 'off') return false
  const i = Math.min(k, NOTES.length - 1)
  const a = els?.[i]
  if (!a || getLessonMuted()) return false
  try {
    const mode = getRewardSound()
    const want = sourcesFor(mode)[i]
    if (absUrl(a.src) !== absUrl(want)) a.src = want // прогрузка ещё не успела (или вариант сменили) — подставляем сейчас
    tuneSlot(a, i, mode)
    a.volume = getRewardVolume() // iOS игнорирует; Android/десктоп слушаются
    a.currentTime = 0
    a.play().catch(() => {})
    return true
  } catch { return false }
}

/** Админка, из тапа: проиграть тон k выбранным вариантом при текущей громкости (отдельный элемент, слоты игры не трогает). false — «без звука» или нечем */
export function previewReward(k) {
  const mode = getRewardSound()
  if (mode === 'off' || typeof Audio === 'undefined') return false
  try {
    const i = Math.min(Math.max(0, k), NOTES.length - 1)
    if (mode === 'custom') return previewUrl(getRewardUrl(), i)
    const n = NOTES[i]
    const blob = mode !== 'meow' ? URL.createObjectURL(new Blob([makeNoteWav(n.freqs, n.ms, n.level)], { type: 'audio/wav' })) : null
    const a = new Audio(blob ?? MEOW_PATHS[i])
    a.volume = getRewardVolume()
    if (blob) a.addEventListener('ended', () => URL.revokeObjectURL(blob), { once: true })
    a.play().catch(() => {})
    return true
  } catch { return false }
}

/** Админка, из тапа: проиграть любую запись url тоном k (скорость 1 / 1.26 / 1.5 без сохранения высоты) при текущей громкости — предпрослушка кандидата до «Сделать звуком награды» */
export function previewUrl(url, k = 0) {
  if (!url || typeof Audio === 'undefined') return false
  try {
    const a = new Audio(url)
    a.volume = getRewardVolume()
    tuneSlot(a, k, 'custom')
    a.play().catch(() => {})
    return true
  } catch { return false }
}

/** Игра закрыта: отпустить элементы и blob-ссылки */
export function releaseNotes() {
  els?.forEach(a => { try { a.pause(); a.removeAttribute('src') } catch { /* уже свободен */ } })
  urls?.forEach(u => URL.revokeObjectURL(u))
  if (silence) URL.revokeObjectURL(silence)
  els = null; urls = null; silence = null
}
