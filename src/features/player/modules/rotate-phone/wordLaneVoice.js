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

let track = null // запасной <audio> озвучки автора, если прогретый элемент приложения недоступен

/** Озвучка автора (файл ElevenLabs ноды) целиком: прогретый элемент → обычный <audio>. Возвращает true, если пошла */
export function playTrack(src) {
  if (!src) return false
  if (playPrimed(src, { muted: getLessonMuted(), rate: getVoiceRate() })) return true
  try {
    track = new Audio(src)
    track.muted = getLessonMuted()
    track.playbackRate = getVoiceRate()
    track.play().catch(e => pLog(`[word-lane] озвучка автора не пошла: ${e?.name ?? e}`))
    return true
  } catch { return false }
}

export function stopVoice() {
  try { track?.pause() } catch { /* не играл */ }
  track = null
  try { stopPrimed() } catch { /* не играл */ }
  try { stopWord() } catch { /* не играл */ }
  try { synth()?.cancel() } catch { /* не играл */ }
}
