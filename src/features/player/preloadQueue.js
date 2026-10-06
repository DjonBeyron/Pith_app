// Чистые функции построения очереди предзагрузки — без состояния и рефов,
// ничего не знают про React. Вынесены из usePlayerPreload.js, который
// вокруг них — уже сам стейт-менеджер закачки/вытеснения (eviction).

export function isValidUrl(url) {
  return typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))
}

export function bfsOrder(nodes) {
  if (!nodes.length) return []
  const byId  = Object.fromEntries(nodes.map(n => [n.id, n]))
  const entry = nodes.find(n => n.seq === 1)
    ?? nodes.slice().sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))[0]
  const visited = new Set()
  const queue   = [entry]
  const ordered = []
  while (queue.length) {
    const n = queue.shift()
    if (visited.has(n.id)) continue
    visited.add(n.id)
    ordered.push(n)
    for (const t of (n.triggers ?? [])) {
      if (t.then && byId[t.then] && !visited.has(t.then)) queue.push(byId[t.then])
    }
  }
  for (const n of nodes) if (!visited.has(n.id)) ordered.push(n)
  return ordered
}

export function forwardReachable(node, byId) {
  const reach = new Set()
  const q     = [node]
  while (q.length) {
    const n = q.shift()
    if (reach.has(n.id)) continue
    reach.add(n.id)
    for (const t of (n.triggers ?? [])) {
      if (t.then && byId[t.then]) q.push(byId[t.then])
    }
  }
  return reach
}

// Ключ файла ноды для прогрева и blobMap: file_id, а без него — сама ссылка
// r2Url. Уроки, пришедшие из черновика (lesson-drafts) или с «подложенными»
// файлами, несут только r2Url — раньше такие ноды в очередь прогрева не
// попадали вовсе: кружок/голосовые/фото стримились с R2 прямо в чат (чёрный
// кружок, поздние фото и тайминги), а гейт «печатает» считал их готовыми
export function nodeFileKey(node) {
  const td = node?.typeData?.[node.type]
  if (!td) return null
  if (td.file_id) return td.file_id
  return isValidUrl(td.r2Url) ? td.r2Url : null
}

export function nodeDownloads(node, files) {
  if (node.type === 'photo_choice') {
    return (node.typeData?.photo_choice?.photos ?? [])
      .map(ph => {
        const f   = files.find(fl => fl.id === ph.fileId)
        const url = f?.r2Url ?? ph.photoUrl ?? null
        return isValidUrl(url) ? { id: ph.fileId, url, size: f?.size ?? 0, nodeType: 'photo_choice' } : null
      })
      .filter(Boolean)
  }
  const fileId = nodeFileKey(node)
  if (!fileId) return []
  const f   = files.find(fl => fl.id === fileId)
  const url = f?.r2Url ?? node.typeData?.[node.type]?.r2Url ?? null
  return isValidUrl(url) ? [{ id: fileId, url, size: f?.size ?? 0, nodeType: node.type }] : []
}

export function buildItemQueue(nodes, files, mediaTypes) {
  const mediaNodes = bfsOrder(nodes).filter(n => mediaTypes.has(n.type))
  return mediaNodes.flatMap((n, nodeIdx) =>
    nodeDownloads(n, files).map(d => ({ ...d, nodeSeq: n.seq, nodeId: n.id, nodeIdx }))
  )
}

export function revokeEntry(entry) {
  if (!entry) return
  if (entry.blobUrl)   URL.revokeObjectURL(entry.blobUrl)
  if (entry.posterUrl) URL.revokeObjectURL(entry.posterUrl)
}

// Плеер так и не открылся (сервер отказал: нет энергии) — карточка запуска
// уже отдала blob-ы в payload и сама их не отзовёт. Отзываем здесь
export function revokePayloadBlobs(payload) {
  Object.values(payload?.blobMap ?? {}).forEach(revokeEntry)
  if (typeof payload?.teacherLogo === 'string' && payload.teacherLogo.startsWith('blob:')) {
    URL.revokeObjectURL(payload.teacherLogo)
  }
}

// План прогрева карточки запуска. Без точки входа — первые lookahead медиа-нод
// по BFS от начала урока. С точкой входа («Продолжить урок»): очередь
// переставляется (достижимое от точки — вперёд), прогрев — первые lookahead
// нод по реальному пути от неё, а гейт по BFS-индексу поднимается, чтобы их
// пропустить (у середины урока индексы большие). Раньше карточка с чекпойнтом
// ждала прогрева НАЧАЛА урока, а точка возобновления прогревалась «как
// получится»
export function warmupPlan(queue, entryNodeId, byId, lookahead) {
  const entry = entryNodeId ? byId[entryNodeId] : null
  if (!entry) {
    const ids = [...new Set(queue.filter(i => i.nodeIdx < lookahead).map(i => i.nodeId))]
    return { queue, warmupIds: ids, allowUpTo: lookahead }
  }
  const reach = forwardReachable(entry, byId)
  // reach — Set в порядке обхода в ширину ОТ ТОЧКИ ВХОДА: ближайшие по пути
  // ноды первыми (а не по BFS от начала урока, где ближняя к точке нода
  // может стоять далеко позади чужих веток)
  const rank = new Map([...reach].map((id, i) => [id, i]))
  const active = queue.filter(i => reach.has(i.nodeId)).sort((a, b) => rank.get(a.nodeId) - rank.get(b.nodeId))
  const speculative = queue.filter(i => !reach.has(i.nodeId))
  const warmupIds = []
  for (const i of active) {
    if (!warmupIds.includes(i.nodeId)) warmupIds.push(i.nodeId)
    if (warmupIds.length >= lookahead) break
  }
  const warmSet = new Set(warmupIds)
  const maxIdx = active.filter(i => warmSet.has(i.nodeId)).reduce((m, i) => Math.max(m, i.nodeIdx), -1)
  return { queue: [...active, ...speculative], warmupIds, allowUpTo: Math.max(lookahead, maxIdx + 1) }
}
