import { isValidUrl } from '../../player/preloadQueue.js'
import { sceneNodeAudioUrls } from '../../scene/v2/sceneNode.js'
import { diagnoseMedia } from '../injectR2Urls.js'
import { nodeText } from '../../player/admin/playerEditLabel.js'

// «Сломанные ноды» урока — чистая логика (без React и сети): какие ссылки у каких нод проверять и как по результатам проб
// (urlProbe.js) собрать список. Ссылки — те же, что качает прогрев урока (preloadQueue.nodeDownloads: голосовые, видео,
// кружки, фото, стикеры, таблицы, фото-варианты, озвучка реплик сцен). Повод: в уроке «To» после замены JSON у части
// голосовых файл в R2 оказался стёрт — плеер молча получал 404 (PROJECT.md, раунд 3).

export const PROBE_UNKNOWN = 'unknown'
// Типы, которые «⚡ Массовая генерация» умеет сделать заново (batchGenPlan.js) — для кнопки «Озвучить и сгенерировать сломанные»
export const FIXABLE_TYPES = new Set(['audio', 'table', 'photo', 'sticker', 'photo_choice'])

// Ссылки ноды для проверки — по ЗАПИСИ файла урока, а не по r2Url в typeData: после перезаписи озвучки у ноды новый file_id, а
// r2Url в typeData — старый (его обновляет только сохранение, injectR2Urls) — и проверка по нему снова видела 404 («озвучил, проверил
// снова — всё равно ошибка»). Локальная запись без r2Url — файл ещё не загружен («ждёт сохранения»): проверять нечего, это не поломка.
// [{ url, fileId?, photoId? }], pending — сколько файлов ноды ждут сохранения
function nodeCheckUrls(n, files) {
  const urls = []
  let pending = 0
  const byFile = (fileId, fallbackUrl, extra = {}) => {
    const f = fileId ? files.find(x => x.id === fileId) : null
    if (f) { if (isValidUrl(f.r2Url)) urls.push({ url: f.r2Url, fileId, ...extra }); else if (f.status === 'local' && f.localFile) pending += 1; return }
    if (!fileId && isValidUrl(fallbackUrl)) urls.push({ url: fallbackUrl, ...extra })
  }
  if (n.type === 'scene') {
    for (const url of sceneNodeAudioUrls(n.typeData?.scene)) { if (isValidUrl(url)) urls.push({ url }) }
  } else if (n.type === 'photo_choice') {
    for (const ph of n.typeData?.photo_choice?.photos ?? []) byFile(ph.fileId, ph.photoUrl, { fileId: ph.fileId, photoId: ph.id })
  } else {
    const d = n.typeData?.[n.type]
    if (d) byFile(d.file_id, d.r2Url)
  }
  const seen = new Set()
  return { urls: urls.filter(u => (seen.has(u.url) ? false : seen.add(u.url))), pending }
}

/** Ноды с медиа и их ссылки: [{ id, seq, type, urls: [url], refs: [{url, fileId, photoId}], pending }] */
export function collectNodeUrls(nodes, files) {
  const out = []
  for (const n of nodes ?? []) {
    const { urls, pending } = nodeCheckUrls(n, files ?? [])
    if (urls.length || pending) out.push({ id: n.id, seq: n.seq, type: n.type, urls: urls.map(u => u.url), refs: urls, pending })
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
  const push = (n, reason, badFile = null) => {
    const row = byId.get(n.id) ?? { id: n.id, seq: n.seq, type: n.type, label: labelOf(n.id), reasons: [], badFiles: [], fixable: FIXABLE_TYPES.has(n.type) }
    if (!row.reasons.includes(reason)) row.reasons.push(reason)
    if (badFile) row.badFiles.push(badFile)
    byId.set(n.id, row)
  }
  for (const d of diagnoseMedia(nodes, files)) push({ id: d.nodeId, seq: d.seq, type: d.type }, d.reason)
  let unknown = 0
  let checked = 0
  let pending = 0
  const total = allUrls(entries).length
  const seen = new Set()
  for (const e of entries) {
    pending += e.pending ?? 0
    for (const ref of e.refs ?? e.urls.map(url => ({ url }))) {
      const p = probes?.get(ref.url)
      const v = classifyProbe(p)
      if (!seen.has(ref.url)) { seen.add(ref.url); if (p) checked += 1; if (p && v.ok === null) unknown += 1 }
      if (v.ok === false) push(e, `${v.reason}: ${short(ref.url)}`, { fileId: ref.fileId ?? null, photoId: ref.photoId ?? null })
    }
  }
  const broken = [...byId.values()].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
  return { broken, unknown, checked, total, pending }
}
