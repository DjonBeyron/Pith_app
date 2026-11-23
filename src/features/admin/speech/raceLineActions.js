import { getCatLines, saveCatLines } from '../../../shared/api/catLinesApi.js'
import { normalizeLines, linesToSave } from '../../player/modules/rotate-phone/wordLaneCatLines.js'
import { uploadToR2 } from '../../../shared/lib/r2.js'
import { probeAudioDuration } from '../../../shared/lib/audioUtils.js'
import { editedLine } from './raceLineText.js'

// Действия над одной репликой Пита / Мии сверх правки текста (raceLineText.saveLineText) и озвучки (rehearsalVoice.voicePitLines) — для карточки реплики на «Таймлайне игры» (features/timeline/timelineLineApi.js).
// Пишут в те же настройки app_settings.rotate_cat_lines тем же способом, что таблица «Озвучка Пита»: прочитать свежие → normalizeLines → поменять одну запись → linesToSave → saveCatLines. Формат настроек не меняется.
//  • setLineFile — свой аудиофайл для реплики: файл уходит в R2 тем же клиентским путём, что файл озвучки ElevenLabs (shared/lib/r2.uploadToR2), длительность — из самого файла (audioUtils.probeAudioDuration);
//    в запись ложится то же, что после озвучки (rehearsalVoice.voiceOne): url, duration, said = текущий текст; words (тайминги слов) у своего файла нет — null.
//  • restoreLine — «вернуть прежний текст»: запись реплики возвращается к снимку prev целиком (текст и прежняя озвучка), если озвучку с тех пор не перезаписали; иначе возвращается только текст
//    (новый файл говорит другое — статус «текст изменён после озвучки», как после обычной правки).
const fresh = () => getCatLines({ fresh: true })

/** Свой файл озвучки реплики id. → свежие реплики (normalizeLines). Нет реплики / файл не читается как звук — ошибка */
export async function setLineFile(id, file, { load = fresh, save = saveCatLines, upload = uploadToR2, probe = probeAudioDuration } = {}) {
  if (!file) throw new Error('файл не выбран')
  const lines = normalizeLines(await load())
  if (!lines[id]) throw new Error(`нет реплики ${id}`)
  const blob = URL.createObjectURL(file)
  let url, duration
  try { [url, duration] = await Promise.all([upload(file), probe(blob)]) } finally { URL.revokeObjectURL(blob) }
  if (!(Number(duration) > 0)) throw new Error('не удалось узнать длительность файла — это точно звук?')
  lines[id] = { ...lines[id], url, duration, words: null, said: lines[id].text }
  await save(linesToSave(lines))
  return lines
}

/** Вернуть реплику id к снимку prev (запись реплики до правки, из normalizeLines). → свежие реплики */
export async function restoreLine(id, prev, { load = fresh, save = saveCatLines } = {}) {
  if (!prev) throw new Error('нечего возвращать')
  const lines = normalizeLines(await load())
  if (!lines[id]) throw new Error(`нет реплики ${id}`)
  lines[id] = (lines[id].url ?? null) === (prev.url ?? null) ? { ...prev } : editedLine(lines[id], prev.text)
  await save(linesToSave(lines))
  return lines
}
