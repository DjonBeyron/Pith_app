// Комментарии владельца к этапам репетиции («Шлифовка репетиции»): хранение в localStorage браузера (по ключу этапа), экспорт одним JSON-файлом и краткая сводка текстом. Чистые функции без React и DOM — проверяются тестами.
// Ключ этапа — id из rehearsalOnly.js (intro, warmup, read, build, blind, discern, take, summary): у каждого этапа свой список и свой экспорт. На этап — не больше MAX_COMMENTS комментариев; 51-й вытесняет самый старый.
// Комментарий: { at (ISO, когда сохранён), t (мс от старта игры до тапа по 💬), stage { act, actTitle, name, sid, type, idx, phase }, text, screen (снимок экрана, commentSnapshot.js), settings (настройки на момент сохранения,
// commentSettings.js), changes ([{ t, key, label, from, to }] — что менял в окне комментария), log (последние строки журнала игры, commentLog.js) }.
import { ONLY_TITLES } from '../rehearsalOnly.js'
import { screenLine } from './commentSnapshot.js'
import { settingsLine } from './commentSettings.js'
import { lastLogLines } from './commentLog.js'

export const COMMENTS_KEY = 'pithy_rh_comments_v1'
export const MAX_COMMENTS = 50
export const EXPORT_VERSION = 1

const keyOf = act => `${COMMENTS_KEY}:${act}`
const sec = ms => `${(Math.max(0, Number(ms) || 0) / 1000).toFixed(1)} с`

/** Запись комментария: text — что написал владелец; snap — снимок экрана в момент тапа (commentSnapshot); settings — настройки сейчас; changes — что менял в окне; t — мс от старта игры до тапа; dump — dbg.dump() (журнал) */
export function makeComment({ text, snap, settings, changes = [], t = 0, dump = null, now = new Date() }) {
  return { at: now.toISOString(), t: Math.max(0, Math.round(t)), stage: snap?.stage ?? null, text: String(text ?? '').trim(), screen: snap ?? null, settings: settings ?? null, changes, log: lastLogLines(dump) }
}

/** Список комментариев этапа (старые — первыми); нет хранилища / мусор — пусто */
export function listComments(act, store = globalThis.localStorage) {
  try {
    const v = JSON.parse(store?.getItem(keyOf(act)) ?? 'null')
    return Array.isArray(v) ? v.filter(c => c && typeof c === 'object') : []
  } catch { return [] }
}

export const countComments = (act, store) => listComments(act, store).length

/** Добавить комментарий. Больше MAX_COMMENTS — самый старый вытесняется. → { ok, count, dropped } (ok: false — хранилище не приняло запись) */
export function addComment(act, comment, store = globalThis.localStorage) {
  const all = [...listComments(act, store), comment]
  const dropped = Math.max(0, all.length - MAX_COMMENTS)
  const keep = all.slice(dropped)
  try { store.setItem(keyOf(act), JSON.stringify(keep)); return { ok: true, count: keep.length, dropped } } catch { return { ok: false, count: all.length - 1, dropped: 0 } }
}

export function clearComments(act, store = globalThis.localStorage) {
  try { store?.removeItem(keyOf(act)) } catch { /* приватный режим — нечего чистить */ }
}

/** Сводка текстом (markdown): по строке на комментарий — когда, где, что написано, что на экране и в настройках; читать можно без разбора JSON */
export function summaryText(act, comments, { version = '', exportedAt = '' } = {}) {
  const title = ONLY_TITLES[act] ?? act
  const head = `# Комментарии к этапу «${title}»${version ? `, v${version}` : ''}: ${comments.length} шт.${exportedAt ? `, экспорт ${exportedAt}` : ''}`
  const body = comments.map((c, i) => {
    const where = [c.stage?.actTitle, c.stage?.sid || c.stage?.name].filter(Boolean).join(' / ')
    const lines = [`${i + 1}. [${sec(c.t)} · ${where}] ${String(c.text ?? '').trim() || '(без текста)'}`]
    if (c.screen) lines.push(`   Экран: ${screenLine(c.screen)}`)
    if (c.settings) lines.push(`   Настройки: ${settingsLine(c.settings)}`)
    if (c.changes?.length) lines.push(`   Менял в комментарии: ${c.changes.map(x => `${x.label} → ${x.to}`).join('; ')}`)
    return lines.join('\n')
  })
  return [head, ...body].join('\n')
}

/** Содержимое экспорта: { version, act, actTitle, appVersion, exportedAt, summary, comments } */
export function buildExport(act, comments, { version = '', now = new Date() } = {}) {
  const exportedAt = now.toISOString()
  return { version: EXPORT_VERSION, act, actTitle: ONLY_TITLES[act] ?? act, appVersion: version, exportedAt, summary: summaryText(act, comments, { version, exportedAt }), comments }
}

export const commentsFileName = act => `rehearsal-${act}-comments.json`

/** Файл для saveDebugFile (того же вида, что buildDebugFile: name, json, blob, size) — на iPhone уходит через «Поделиться» */
export function commentsFile(act, comments, { version = '', now = new Date() } = {}) {
  const json = JSON.stringify(buildExport(act, comments, { version, now }), null, 2)
  const name = commentsFileName(act)
  const type = 'application/json'
  const blob = typeof File === 'function' ? new File([json], name, { type }) : new Blob([json], { type })
  return { name, json, blob, size: json.length }
}
