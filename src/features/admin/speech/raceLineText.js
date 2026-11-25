import { getCatLines, saveCatLines } from '../../../shared/api/catLinesApi.js'
import { normalizeLines, linesToSave, MAX_LINE_CHARS } from '../../player/modules/rotate-phone/wordLaneCatLines.js'
import { ttsProblem } from '../../rehearsal/tts/ttsText.js'

// Правка текста реплики Пита из таблицы «Озвучка Пита» (RaceVoiceTable): текст пишется в те же настройки app_settings.rotate_cat_lines с пометкой custom — тогда он главнее каталога кода
// (normalizeLines не сбрасывает его как устаревший), игра говорит и показывает именно его. Озвучка остаётся прежней, а said хранит, что она говорит: до переозвучки статус «текст изменён после озвучки».

/** Новая запись реплики после правки текста: url и тайминги прежние, said — текст, который говорит файл (если файла нет — said не нужен) */
export function editedLine(line, text) {
  const t = String(text ?? '').trim().slice(0, MAX_LINE_CHARS)
  const said = line?.url ? (line.said ?? line.text) : undefined
  const { tts, ...rest } = line ?? {}
  return { ...rest, text: t, custom: true, ...(said != null ? { said } : {}), ...(tts && !ttsProblem(t, tts) ? { tts } : {}) } // свой текст диктора остаётся, только если слова новой реплики те же (иначе он от прежнего текста)
}

/** Сохранить текст реплики id; пустой текст — ошибка. → свежие реплики (normalizeLines) */
export async function saveLineText(id, text, { load = () => getCatLines({ fresh: true }), save = saveCatLines } = {}) {
  if (!String(text ?? '').trim()) throw new Error('пустой текст')
  const lines = normalizeLines(await load())
  if (!lines[id]) throw new Error(`нет реплики ${id}`)
  lines[id] = editedLine(lines[id], text)
  await save(linesToSave(lines))
  return lines
}

export const MAX_TTS_CHARS = MAX_LINE_CHARS + 40 // знаки препинания поверх текста реплики

/**
 * Сохранить «текст для диктора» реплики id (карточка реплики на «Таймлайне игры»): тот же текст со знаками препинания — он уходит в ElevenLabs вместо чистого (rehearsal/tts/ttsText.js).
 * Пустая строка — своя правка убирается (диктору снова идёт текст каталога или текст + точка). Отличается от текста реплики чем-то, кроме знаков и регистра, — ошибка с объяснением.
 * Текст реплики, озвучка и said не трогаются: аудит сам покажет «текст для диктора изменён — переозвучить». → свежие реплики (normalizeLines)
 */
export async function saveLineTts(id, tts, { load = () => getCatLines({ fresh: true }), save = saveCatLines } = {}) {
  const lines = normalizeLines(await load())
  if (!lines[id]) throw new Error(`нет реплики ${id}`)
  const t = String(tts ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_TTS_CHARS)
  const bad = ttsProblem(lines[id].text, t)
  if (bad) throw new Error(`Текст для диктора не подходит: ${bad}`)
  const { tts: _old, ...rest } = lines[id] // прежняя правка убирается
  lines[id] = t ? { ...rest, tts: t } : rest
  await save(linesToSave(lines))
  return lines
}
