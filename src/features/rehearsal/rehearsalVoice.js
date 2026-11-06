import { generateSpeech } from '../../shared/lib/ttsApi.js'
import { uploadToR2 } from '../../shared/lib/r2.js'
import { probeAudioDuration } from '../../shared/lib/audioUtils.js'
import { getCatLines, saveCatLines } from '../../shared/api/catLinesApi.js'
import { normalizeLines, linesToSave } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { REHEARSAL_LINES, lineVoiced } from './rehearsalLines.js'

// Озвучка реплик Пита-тренера из «Теста игры» и «Шлифовки репетиции» (Админ → «Голос»): те же настройки, что у CatLinesPanel в редакторе ноды (app_settings → rotate_cat_lines): ElevenLabs → R2 → запись в реплики.
// Озвучиваются только реплики репетиции без озвучки (или с устаревшей: текст в коде поменялся, rehearsalLines.js isStaleLine) и без {word} в тексте (такую озвучить нельзя: Пит произносит само слово из библиотеки слов). Слова и куски — отдельно (voiceMissingTexts → generateWordAudio).

/** Реплики репетиции (или другой набор list — «Гонка с Питом»: RACE_LINES), которым не хватает озвучки: [{ id, text }] */
export const missingPitLines = (lines, list = REHEARSAL_LINES) => list.map(d => ({ id: d.id, text: (lines?.[d.id]?.custom && lines[d.id].text) || d.text })).filter(d => !d.text.includes('{') && !lineVoiced(d.id, lines?.[d.id])) // текст — из кода, а поправленный в админке (custom) — сохранённый

/** Сколько реплик репетиции уже озвучено и сколько озвучивается вообще → { done, total } */
export function pitVoiceCount(lines, list = REHEARSAL_LINES) {
  const voiced = list.filter(d => !d.text.includes('{'))
  return { done: voiced.filter(d => lineVoiced(d.id, lines?.[d.id])).length, total: voiced.length }
}

/**
 * Озвучить недостающие реплики и записать в настройки приложения; onStep(id) — какая озвучивается. → число озвученных. Зависимости подставляются в тестах.
 * Реплика не получилась (ElevenLabs, R2, нет прав админа) — то, что успело озвучиться до неё, всё равно записывается, а ошибка уходит наверх.
 */
export async function voiceMissingPitLines({ list = REHEARSAL_LINES, onStep = () => {}, speak = generateSpeech, upload = uploadToR2, probe = probeAudioDuration, load = getCatLines, save = saveCatLines } = {}) {
  const lines = normalizeLines(await load())
  const todo = missingPitLines(lines, list)
  let done = 0
  try {
    for (const { id, text } of todo) {
      onStep(id)
      lines[id] = await voiceOne(lines[id], text, { speak, upload, probe })
      done++
    }
  } finally {
    if (done) await save(linesToSave(lines))
  }
  return done
}

/** Одна реплика: ElevenLabs → R2 → длительность; said — какой текст говорит файл */
async function voiceOne(line, text, { speak, upload, probe }) {
  const { file, wordTimings } = await speak(text)
  const blob = URL.createObjectURL(file)
  const [url, duration] = await Promise.all([upload(file), probe(blob)]).finally(() => URL.revokeObjectURL(blob))
  return { ...line, url, duration, words: wordTimings?.length ? wordTimings : null, said: text }
}

/**
 * Переозвучить выбранные реплики (ids) их текущим текстом, даже если они уже озвучены (таблица «Озвучка Пита», admin/speech/useRaceVoiceTable.js). Реплики с {word} и неизвестные id пропускаются.
 * Ошибка одной реплики не останавливает остальные: → { done, failed: { id: текст ошибки } }; удавшиеся записываются в настройки одним сохранением.
 */
export async function voicePitLines({ ids = [], onStep = () => {}, speak = generateSpeech, upload = uploadToR2, probe = probeAudioDuration, load = getCatLines, save = saveCatLines } = {}) {
  const lines = normalizeLines(await load())
  const failed = {}
  let done = 0
  for (const id of ids) {
    const text = lines[id]?.text
    if (!text || text.includes('{')) continue
    onStep(id)
    try { lines[id] = await voiceOne(lines[id], text, { speak, upload, probe }); done++ } catch (e) { failed[id] = e?.message || String(e) }
  }
  if (done) await save(linesToSave(lines))
  return { done, failed }
}

/** Озвучить куски и слова плана без озвучки в библиотеку слов (generateWordAudio: ElevenLabs → R2 → word_audio); onStep(key) — какой озвучивается. → { done, failed: { ключ: текст ошибки } } */
export async function voiceMissingTexts(rows, generate, onStep = () => {}) {
  const failed = {}
  let done = 0
  for (const r of rows.filter(x => x.key && !x.has)) {
    onStep(r.key)
    try { await generate(r.key, r.text); done++ } catch (e) { failed[r.key] = e?.message || String(e) }
  }
  return { done, failed }
}
