import { nodeDownloads } from '../../player/preloadQueue.js'
import { diagnoseMedia } from '../injectR2Urls.js'
import { nodeText } from '../../player/admin/playerEditLabel.js'

// «Сломанные ноды» урока — чистая логика (без React и сети): какие ссылки у каких нод проверять и как по результатам проб
// (urlProbe.js) собрать список. Ссылки — те же, что качает прогрев урока (preloadQueue.nodeDownloads: голосовые, видео,
// кружки, фото, стикеры, таблицы, фото-варианты, озвучка реплик сцен). Повод: в уроке «To» после замены JSON у части
// голосовых файл в R2 оказался стёрт — плеер молча получал 404 (PROJECT.md, раунд 3).

export const PROBE_UNKNOWN = 'unknown'

/** Ноды с медиа и их ссылки: [{ id, seq, type, urls }] (без дублей ссылок внутри ноды) */
export function collectNodeUrls(nodes, files) {
  const out = []
  for (const n of nodes ?? []) {
    const urls = [...new Set(nodeDownloads(n, files ?? []).map(d => d.url))]
    if (urls.length) out.push({ id: n.id, seq: n.seq, type: n.type, urls })
  }
  return out
}

/** Все ссылки урока без повторов — на проверку */
export function allUrls(entries) {
  return [...new Set(entries.flatMap(e => e.urls))]
}

/**
 * Вердикт по пробе одной ссылки { status, contentType, contentLength, error }:
 * { ok: true } | { ok: false, reason } | { ok: null, reason } (не удалось проверить — сеть/CORS, не считаем сломанной)
 */
export function classifyProbe(p) {
  if (!p) return { ok: null, reason: 'ещё не проверено' }
  if (p.error && !p.status) return { ok: null, reason: `не удалось проверить (${p.error})` }
  if (p.status === 404 || p.status === 403 || p.status === 410) return { ok: false, reason: `файла нет на сервере (HTTP ${p.status})` }
  if (p.status >= 400) return { ok: false, reason: `сервер ответил HTTP ${p.status}` }
  if (p.contentLength === 0) return { ok: false, reason: 'файл пустой (0 байт)' }
  const ct = String(p.contentType ?? '').toLowerCase()
  if (ct.startsWith('text/html') || ct.startsWith('application/xml') || ct.startsWith('text/xml')) return { ok: false, reason: `вместо файла — ${ct.split(';')[0]} (страница ошибки)` }
  return { ok: true }
}

const short = url => String(url).split('/').pop().split('?')[0].slice(0, 28)

/**
 * Сводка: broken — ноды с хотя бы одной сломанной ссылкой или потерянным файлом (diagnoseMedia),
 * unknown — сколько ссылок не удалось проверить, checked/total — ход проверки.
 * probes — Map url → проба (может быть неполной, пока идёт проверка).
 */
export function buildHealth(nodes, files, probes) {
  const entries = collectNodeUrls(nodes, files)
  const byId = new Map()
  const byNodeId = new Map((nodes ?? []).map(n => [n.id, n]))
  const labelOf = id => { const t = nodeText(byNodeId.get(id) ?? {}); return t.length > 48 ? `${t.slice(0, 48)}…` : t }
  const push = (n, reason) => {
    const row = byId.get(n.id) ?? { id: n.id, seq: n.seq, type: n.type, label: labelOf(n.id), reasons: [] }
    if (!row.reasons.includes(reason)) row.reasons.push(reason)
    byId.set(n.id, row)
  }
  for (const d of diagnoseMedia(nodes, files)) push({ id: d.nodeId, seq: d.seq, type: d.type }, d.reason)
  let unknown = 0
  let checked = 0
  const total = allUrls(entries).length
  const seen = new Set()
  for (const e of entries) {
    for (const url of e.urls) {
      const p = probes?.get(url)
      const v = classifyProbe(p)
      if (!seen.has(url)) { seen.add(url); if (p) checked += 1; if (p && v.ok === null) unknown += 1 }
      if (v.ok === false) push(e, `${v.reason}: ${short(url)}`)
    }
  }
  const broken = [...byId.values()].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
  return { broken, unknown, checked, total }
}
