// «Лесенка нот» игры «Повтори за диктором»: каждая принятая пилюля ученика звучит нотой выше предыдущей (до — ми — соль), три слова складываются в мелодию, а не в «штраф за ошибку».
// Ноты — маленькие WAV, которые мы синтезируем сами (синус с мягким входом и затуханием, без файлов и сети). Играют обычные <audio>, не Web Audio: на iOS Web Audio идёт в другой
// категории аудиосессии (см. sounds.js). Автозапуск по таймеру iOS разрешает только тем элементам, что хоть раз стартовали в жесте, поэтому unlockNotes() зовут из тапа «Начать»:
// элемент играет тихий wav, а позже ему подменяется src на ноту (как у primedAudio). Звук урока «без звука» учитывается.
import { getLessonMuted } from '../../lessonVolume.js'

export const NOTE_FREQS = [523.25, 659.25, 783.99] // C5, E5, G5
export const NOTE_MS = 380
const RATE = 22050

/** Один звук: синус freq Гц длиной ms мс, мягкий вход (20 мс) и плавное затухание; 16-бит моно WAV → Uint8Array */
export function makeNoteWav(freq, ms = NOTE_MS, rate = RATE) {
  const n = Math.floor((rate * ms) / 1000)
  const buf = new ArrayBuffer(44 + n * 2)
  const v = new DataView(buf)
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true)
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, n * 2, true)
  const attack = Math.floor(rate * 0.02)
  for (let i = 0; i < n; i++) {
    const env = Math.min(1, i / attack) * (1 - i / n) ** 1.6
    // основной тон и мягкая октава: нота «звенит», а не гудит
    const x = Math.sin((2 * Math.PI * freq * i) / rate) + 0.25 * Math.sin((2 * Math.PI * freq * 2 * i) / rate)
    v.setInt16(44 + i * 2, Math.round(x * env * 9000), true)
  }
  return new Uint8Array(buf)
}

let urls = null
let els = null
let silence = null // тихий звук для «пробуждения» элементов в жесте

function ensureUrls() {
  urls ??= NOTE_FREQS.map(f => URL.createObjectURL(new Blob([makeNoteWav(f)], { type: 'audio/wav' })))
  return urls
}

/** Из тапа «Начать»: создать элементы нот и «разбудить» их тихим звуком (play внутри жеста). Без поддержки — тихо ничего не делает */
export function unlockNotes() {
  if (els || typeof Audio === 'undefined') return
  try {
    ensureUrls()
    silence ??= URL.createObjectURL(new Blob([makeNoteWav(0, 80)], { type: 'audio/wav' })) // freq 0 → тишина 80 мс
    els = NOTE_FREQS.map(() => {
      const a = new Audio(silence)
      a.preload = 'auto'
      a.play().then(() => a.pause()).catch(() => {})
      return a
    })
  } catch { els = null }
}

/** Сыграть ноту k (0…2). false — не сыграла (нет элементов, звук урока выключен, не разрешили) */
export function playNote(k) {
  const a = els?.[Math.min(k, NOTE_FREQS.length - 1)]
  if (!a || getLessonMuted()) return false
  try {
    a.src = ensureUrls()[Math.min(k, NOTE_FREQS.length - 1)]
    a.currentTime = 0
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
