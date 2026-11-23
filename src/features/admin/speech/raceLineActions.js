import { getCatLines, saveCatLines } from '../../../shared/api/catLinesApi.js'
import { normalizeLines, linesToSave } from '../../player/modules/rotate-phone/wordLaneCatLines.js'
import { uploadToR2 } from '../../../shared/lib/r2.js'
import { probeAudioDuration } from '../../../shared/lib/audioUtils.js'
import { editedLine } from './raceLineText.js'

// Действия над одной репликой Пита / Мии сверх правки текста (raceLineText.saveLineText) и озвучки (rehearsalVoice.voicePitLines) — для карточки реплики на «Таймлайне игры» (features/timeline/timelineLineApi.js).
// Пишут в те же настройки app_settings.rotate_cat_lines тем же способом, что таблица «Озвучка Пита»: прочитать свежие → normalizeLines → поменять одну запись → linesToSave → saveCatLines. Формат настроек не меняется.
//  • setLineFile — свой аудиофайл для реплики: файл уходит в R2 тем же клиентским путём, что файл озвучки ElevenLabs (shared/lib/r2.uploadToR2), длительность — из самого файла (audioUtils.probeAudioDuration);
//    в запись ложится то же, что после озвучки (rehearsalVoice.voiceOne): url, duration, said = текущий текст и words — тайминги слов: у своего файла их нет, поэтому запись размечается
//    в браузере (shared/lib/vosk/voskAlign.js: Vosk слушает файл по известному тексту, ненайденные слова достраиваются по записи). Разметка идёт вместе с загрузкой файла и НЕ мешает ей:
//    сбой разметки (нет модели, файл не разобрался, не успела) — файл всё равно сохраняется, words = null (рот по тексту, как раньше), причина уходит в onAlign. Запись в настройки — одна.
//  • realignLine — «разметить рот заново» для уже загруженного файла (в том числе загруженного до появления разметки): файл скачивается по url и размечается; неудача тайминги не стирает.
//  • Ход и итог разметки («загружаю файл… → слушаю запись (Vosk)… → итог») уходят в onStep / onAlign; по умолчанию — подписчикам watchMouth (карточка таймлайна: useLineEdit.js).
//  • restoreLine — «вернуть прежний текст»: запись реплики возвращается к снимку prev целиком (текст и прежняя озвучка), если озвучку с тех пор не перезаписали; иначе возвращается только текст
//    (новый файл говорит другое — статус «текст изменён после озвучки», как после обычной правки).
const fresh = () => getCatLines({ fresh: true })
const alignAudio = (...a) => import('../../../shared/lib/vosk/voskAlign.js').then(m => m.alignAudio(...a)) // лениво: движок Vosk не попадает в чанк экрана, пока файл не выбрали

const watchers = new Set()
const tell = msg => watchers.forEach(fn => { try { fn(msg) } catch { /* подписчик не мешает загрузке */ } })
/** Подписка на ход разметки рта: fn({ id, step }) — шаг для человека, fn({ id, result }) — итог (voskAlign.alignAudio). → отписка */
export const watchMouth = fn => { watchers.add(fn); return () => watchers.delete(fn) }

/** Разметка рта, которая не бросает: → итог voskAlign.alignAudio либо { words: null, failed: true, notes: [причина] } */
export async function markMouth(src, text, { align = alignAudio, onStep = () => {} } = {}) {
  try { return await align(src, text, { onStep }) } catch (e) { return { words: null, found: 0, total: 0, method: 'even', approx: false, missing: [], failed: true, notes: [`разметка рта не вышла: ${e?.message ?? e}`] } }
}

/** Свой файл озвучки реплики id. → свежие реплики (normalizeLines). Нет реплики / файл не читается как звук — ошибка. onStep(текст) — ход; onAlign(итог разметки рта) — перед записью */
export async function setLineFile(id, file, { load = fresh, save = saveCatLines, upload = uploadToR2, probe = probeAudioDuration, align = alignAudio, onStep = step => tell({ id, step }), onAlign = result => tell({ id, result }) } = {}) {
  if (!file) throw new Error('файл не выбран')
  const lines = normalizeLines(await load())
  if (!lines[id]) throw new Error(`нет реплики ${id}`)
  const blob = URL.createObjectURL(file)
  let url, duration, mouth
  onStep('загружаю файл…')
  try { [url, duration, mouth] = await Promise.all([upload(file), probe(blob), markMouth(file, lines[id].text, { align, onStep })]) } finally { URL.revokeObjectURL(blob) }
  if (!(Number(duration) > 0)) throw new Error('не удалось узнать длительность файла — это точно звук?')
  onAlign(mouth)
  lines[id] = { ...lines[id], url, duration, words: mouth.words?.length ? mouth.words : null, said: lines[id].text }
  onStep('сохраняю…')
  await save(linesToSave(lines))
  return lines
}

/** Разметить рот заново по уже загруженному файлу реплики id (скачивается по url). → свежие реплики. Разметка не вышла — ошибка с причиной, прежние тайминги остаются */
export async function realignLine(id, { load = fresh, save = saveCatLines, align = alignAudio, fetchFile = (...a) => fetch(...a), onStep = step => tell({ id, step }), onAlign = result => tell({ id, result }) } = {}) {
  const line = normalizeLines(await load())[id]
  if (!line) throw new Error(`нет реплики ${id}`)
  if (!line.url) throw new Error('у реплики нет файла озвучки')
  if (line.said != null && line.said !== line.text) throw new Error('файл говорит прежний текст — сначала озвучь заново или выбери файл')
  onStep('скачиваю файл озвучки…')
  let data
  try { const r = await fetchFile(line.url); if (!r.ok) throw new Error(`ответ ${r.status}`); data = await r.arrayBuffer() } catch (e) { throw new Error(`файл озвучки не скачался (${e?.message ?? e}): нет сети или хранилище не отдаёт файл этой странице (CORS)`) }
  const mouth = await markMouth(data, line.text, { align, onStep })
  onAlign(mouth)
  if (!mouth.words?.length) throw new Error(mouth.notes?.join('; ') || 'слова не расставились')
  const lines = normalizeLines(await load()) // свежие: пока шла разметка, реплику могли поправить
  if (lines[id]?.url !== line.url || lines[id].text !== line.text) throw new Error('реплику изменили, пока шла разметка — повтори')
  lines[id] = { ...lines[id], words: mouth.words }
  onStep('сохраняю…')
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
