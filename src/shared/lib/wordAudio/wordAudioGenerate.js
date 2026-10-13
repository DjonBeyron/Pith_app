import { generateSpeech } from '../ttsApi.js'
import { probeAudioDuration } from '../audioUtils.js'
import { saveWordAudio } from './wordAudioApi.js'

// Одно слово: mp3 из TTS → длительность → R2 + общая база word_audio.
// Общий путь для меню 🔊 (ручная очередь) и авто-пополнения при сохранении урока.
export async function generateWordAudio(key, text) {
  const { file } = await generateSpeech(text)
  const url = URL.createObjectURL(file)
  const duration = await probeAudioDuration(url).catch(() => null)
  URL.revokeObjectURL(url)
  await saveWordAudio({ key, text, blob: file, duration, source: 'tts' })
}
