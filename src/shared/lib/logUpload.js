// Отправка логов в GitHub по нажатию кнопки (edge-функция send-log кладёт файлы в ветку logs, папка logs/).
// Claude по слову «читай» берёт их оттуда, разбирает и удаляет (правило — CLAUDE.md, «Логи из приложения»).
// Чистая часть (fitText, collectLogs, uploadLogs) получает всё внешнее аргументами — для тестов.
import { supabase } from '../api/supabase.js'
import { gameJournal, journalFileName } from './gameJournal.js'
import { getDebugLines } from './debug.js'
import { startModeHeadline } from './gameStartModeLog.js'
import { APP_VERSION } from './version.js'

export const MAX_TEXT = 3_000_000   // символов на файл; больше — режем (звук из json-отладки, потом хвост)
export const MAX_TOTAL = 4_500_000  // и на весь запрос

let lastFile = null // последний файл отладки, который человек выгрузил (saveDebugFile) — уходит вместе с журналом

/** Запомнить выгруженный файл: { name, blob } или { name, text } */
export function rememberLogFile(file) { lastFile = file?.name ? file : null }

/** Влезть в лимит: у json-отладки сначала выкидываем записанный звук, потом отрезаем начало (хвост важнее) */
export function fitText(name, text, max = MAX_TEXT) {
  if (text.length <= max) return text
  if (/\.json$/i.test(name)) {
    try {
      const o = JSON.parse(text)
      delete o.audio; delete o.audioMore
      o.audioDropped = 'звук не отправлен: файл больше лимита'
      const s = JSON.stringify(o)
      if (s.length <= max) return s
      text = s
    } catch { /* не json — режем как текст */ }
  }
  return `[обрезано: начало файла не отправлено]\n${text.slice(text.length - max)}`
}

async function textOf(file) {
  if (typeof file.text === 'string') return file.text
  try { return await file.blob.text() } catch { return '' }
}

/** Файл с комментарием владельца (попап перед отправкой): первым в списке — «читай» читает файлы по порядку имён, и комментарий идёт раньше журнала */
export function commentFile(comment, at = new Date(), version = APP_VERSION) {
  const text = String(comment ?? '').trim()
  if (!text) return null
  return { name: `pithy-comment-${at.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`, text: `Комментарий владельца к логам (v${version}):\n\n${text}` }
}

/** Что отправляем: комментарий (если есть) + journal (файл с шапкой, если есть) + строки дебага + последний выгруженный файл → [{ name, text }] */
export async function collectLogs({ journal = null, journalSrc = gameJournal, debugLines = getDebugLines(), last = lastFile, at = new Date(), comment = '', withLogs = true, extra = [] } = {}) { // extra — готовые файлы [{ name, text }] сверх журнала (отчёт «Таймлайна игры», features/timeline/timelineLog.js)
  const out = []
  const note = commentFile(comment, at)
  if (note) out.push(note)
  if (!withLogs) return out.map(f => ({ name: f.name, text: fitText(f.name, f.text) })) // галочка «Отправить логи» снята — уходит только комментарий
  const jText = journal?.text ?? journalSrc.text([`Pithy — журнал игры, v${APP_VERSION}`, startModeHeadline()])
  if (jText && jText.trim()) out.push({ name: journal?.name ?? journalFileName(at), text: jText })
  for (const f of extra ?? []) if (f?.name && f.text) out.push({ name: f.name, text: f.text })
  if (debugLines.length) out.push({ name: `pithy-debug-${at.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`, text: debugLines.join('\n') })
  if (last) { const t = await textOf(last); if (t) out.push({ name: last.name, text: t }) }
  let total = 0
  return out.map(f => ({ name: f.name, text: fitText(f.name, f.text) })).filter(f => (total += f.text.length) <= MAX_TOTAL)
}

/** Отправить файлы → строка для человека (не бросает) */
export async function uploadLogs(files, { client = supabase, version = APP_VERSION, append = false } = {}) {
  if (!files.length) return 'Нечего отправлять — журнал пуст (или напиши комментарий)'
  try {
    const { data, error } = await client.functions.invoke('send-log', { body: { files, version, ...(append ? { append: true } : {}) } })
    if (error) {
      let msg = error.message || 'ошибка'
      try { const j = await error.context?.json?.(); if (j?.error) msg = j.error } catch { /* тело ответа не прочиталось */ }
      return `Не отправилось: ${msg}`
    }
    return data?.ok ? `Отправлено в GitHub (${data.paths?.length ?? files.length} ф.) — напиши мне «читай»` : `Не отправилось: ${data?.error ?? 'нет ответа'}`
  } catch (e) { return `Не отправилось: ${e?.message ?? 'сеть'}` }
}

/** Собрать и отправить одним действием; journal — файл журнала с шапкой (необязательно), comment — комментарий из попапа (необязательно), withLogs: false — только комментарий, append: true — не заменять прежние файлы в GitHub (копить) */
export async function sendLogs(opts = {}) {
  try { return await uploadLogs(await collectLogs(opts), opts) } catch (e) { return `Не отправилось: ${e?.message ?? 'ошибка'}` }
}
