import { getCatLines, saveCatLines } from '../../../shared/api/catLinesApi.js'
import { normalizeLines, linesToSave, MAX_LINE_CHARS } from '../../player/modules/rotate-phone/wordLaneCatLines.js'

// Правка текста реплики Пита из таблицы «Озвучка Пита» (RaceVoiceTable): текст пишется в те же настройки app_settings.rotate_cat_lines с пометкой custom — тогда он главнее каталога кода
// (normalizeLines не сбрасывает его как устаревший), игра говорит и показывает именно его. Озвучка остаётся прежней, а said хранит, что она говорит: до переозвучки статус «текст изменён после озвучки».

/** Новая запись реплики после правки текста: url и тайминги прежние, said — текст, который говорит файл (если файла нет — said не нужен) */
export function editedLine(line, text) {
  const t = String(text ?? '').trim().slice(0, MAX_LINE_CHARS)
  const said = line?.url ? (line.said ?? line.text) : undefined
  return { ...line, text: t, custom: true, ...(said != null ? { said } : {}) }
}

/** Сохранить текст реплики id; пустой текст — ошибка. → свежие реплики (normalizeLines) */
export async function saveLineText(id, text, { load = getCatLines, save = saveCatLines } = {}) {
  if (!String(text ?? '').trim()) throw new Error('пустой текст')
  const lines = normalizeLines(await load())
  if (!lines[id]) throw new Error(`нет реплики ${id}`)
  lines[id] = editedLine(lines[id], text)
  await save(linesToSave(lines))
  return lines
}
