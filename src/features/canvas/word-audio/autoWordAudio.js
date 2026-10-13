import { cachedWordAudio, listWordAudio, missingWordAudio } from '../../../shared/lib/wordAudio/wordAudioApi.js'
import { generateWordAudio } from '../../../shared/lib/wordAudio/wordAudioGenerate.js'
import { dbg } from '../../../shared/lib/debug.js'

// Авто-пополнение общей базы слов: после сохранения урока недостающие слова
// озвучиваются сами (по одному, ElevenLabs) — не нужно открывать меню 🔊.
// Включается галочкой в меню (по умолчанию включено), хранится в браузере админа.
const KEY = 'pithy.wordAudio.auto'
let running = false

export function isAutoWordAudio() {
  try { return localStorage.getItem(KEY) !== '0' } catch { return true }
}

export function setAutoWordAudio(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* без хранилища — не сохраняем */ }
}

/** words — Map key → text слов урока; озвучивает те, которых нет в базе */
export async function fillMissingWords(words) {
  if (running || !words?.size) return 0
  running = true
  let made = 0
  try {
    const lib = cachedWordAudio() ?? await listWordAudio()
    for (const [key, text] of missingWordAudio(words, lib)) {
      try { await generateWordAudio(key, text); made += 1 } catch (e) { dbg('[auto word tts]', key, e.message) }
    }
  } finally {
    running = false
  }
  return made
}
