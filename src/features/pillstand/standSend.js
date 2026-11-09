// Отправка отчёта по теме стенда пилюль (CONCEPT_PILLSTAND.md, «Отправка по теме»): .txt отчёта (pillStandReport.js) — через saveDebugFile (wordLaneDebugExport.js: на iPhone — лист «Поделиться»,
// запасной путь — новая вкладка; на компьютере — скачивание). Файл — File с именем (лист «Поделиться» показывает имя). Звук записи (если выбран и был) — вторым файлом: на компьютере сразу за отчётом, на iPhone
// — по второму нажатию «📎 Звук» (второй «Поделиться» без нового нажатия Safari не откроет). Чистые функции над подставляемым save.
import { saveDebugFile } from '../player/modules/rotate-phone/wordLaneDebugExport.js'

const asFile = (parts, name, type) => (typeof File === 'function' ? new File(parts, name, { type }) : new Blob(parts, { type }))

/** Файл отчёта: { name, blob, size } */
export function textFile(name, text) {
  const blob = asFile([text], name, 'text/plain;charset=utf-8')
  return { name, blob, size: blob.size }
}

/** Файл звука записи под именем отчёта (или null) */
export function soundFile(audio, name) {
  if (!audio?.blob || !name) return null
  const blob = asFile([audio.blob], name, audio.type || audio.blob.type || 'audio/mp4')
  return { name, blob, size: blob.size }
}

const DONE = new Set(['download', 'share', 'tab'])

/** Отдать отчёт pack (и звук audio, если pack.audioName) → { how, audioHow, later } — later: файл звука, который надо отдать вторым нажатием */
export async function sendPack(pack, audio = null, save = saveDebugFile) {
  const how = await save(textFile(pack.name, pack.text))
  const snd = pack.audioName ? soundFile(audio, pack.audioName) : null
  if (!snd || !DONE.has(how)) return { how, audioHow: null, later: null }
  if (how === 'download') return { how, audioHow: await save(snd), later: null }
  return { how, audioHow: null, later: snd }
}
