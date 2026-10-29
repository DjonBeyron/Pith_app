import { generateSpeech } from '../../shared/lib/ttsApi.js'
import { uploadToR2 } from '../../shared/lib/r2.js'
import { probeAudioDuration } from '../../shared/lib/audioUtils.js'
import { getCatLines, saveCatLines } from '../../shared/api/catLinesApi.js'
import { normalizeLines, linesToSave } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { REHEARSAL_LINES } from './rehearsalLines.js'

// Озвучка реплик Пита-тренера из «Теста игры» (Админ → «Голос»): те же настройки, что у CatLinesPanel в редакторе ноды (app_settings → rotate_cat_lines): ElevenLabs → R2 → запись в реплики.
// Озвучиваются только реплики репетиции без озвучки и без {word} в тексте (такую озвучить нельзя: Пит произносит само слово из библиотеки слов). Слова и куски — отдельно, generateWordAudio.

/** Реплики репетиции, которым не хватает озвучки: [{ id, text }] */
export const missingPitLines = lines => REHEARSAL_LINES.filter(d => !d.text.includes('{') && !lines?.[d.id]?.url).map(d => ({ id: d.id, text: lines?.[d.id]?.text ?? d.text }))

/** Сколько реплик репетиции уже озвучено и сколько озвучивается вообще → { done, total } */
export function pitVoiceCount(lines) {
  const voiced = REHEARSAL_LINES.filter(d => !d.text.includes('{'))
  return { done: voiced.filter(d => lines?.[d.id]?.url).length, total: voiced.length }
}

/** Озвучить недостающие реплики и записать в настройки приложения; onStep(id) — какая озвучивается. → число озвученных. Зависимости подставляются в тестах */
export async function voiceMissingPitLines({ onStep = () => {}, speak = generateSpeech, upload = uploadToR2, probe = probeAudioDuration, load = getCatLines, save = saveCatLines } = {}) {
  const lines = normalizeLines(await load())
  const todo = missingPitLines(lines)
  for (const { id, text } of todo) {
    onStep(id)
    const { file, wordTimings } = await speak(text)
    const blob = URL.createObjectURL(file)
    const [url, duration] = await Promise.all([upload(file), probe(blob)]).finally(() => URL.revokeObjectURL(blob))
    lines[id] = { ...lines[id], url, duration, words: wordTimings?.length ? wordTimings : null }
  }
  if (todo.length) await save(linesToSave(lines))
  return todo.length
}
