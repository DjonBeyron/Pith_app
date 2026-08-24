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
  const fileId = node.typeData?.[node.type]?.file_id
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
