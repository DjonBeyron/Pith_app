// «↶ Вернуть прежнюю озвучку» в карточке реплики (TimelineCheckNote.jsx): после «Озвучить заново» или своего файла прежний файл остаётся в хранилище под своим адресом — в запись реплики возвращаются его
// адрес, длительность и разметка рта. Текст реплики НЕ трогается; said — что говорит возвращённый файл (если текст с тех пор изменили, аудит честно покажет «текст изменён»).
// Тот же путь записи, что у admin/speech/raceLineActions.js: прочитать свежие настройки → normalizeLines → поменять одну запись → linesToSave → сохранить.
import { getCatLines, saveCatLines } from '../../../shared/api/catLinesApi.js'
import { normalizeLines, linesToSave } from '../../player/modules/rotate-phone/wordLaneCatLines.js'

/** prev — запись реплики до замены озвучки (из normalizeLines). → свежие реплики */
export async function restoreVoice(id, prev, { load = () => getCatLines({ fresh: true }), save = saveCatLines } = {}) {
  if (!prev?.url) throw new Error('прежней озвучки нет')
  const lines = normalizeLines(await load())
  if (!lines[id]) throw new Error(`нет реплики ${id}`)
  lines[id] = { ...lines[id], url: prev.url, duration: prev.duration ?? null, words: prev.words ?? null, said: prev.said ?? prev.text }
  await save(linesToSave(lines))
  return lines
}
