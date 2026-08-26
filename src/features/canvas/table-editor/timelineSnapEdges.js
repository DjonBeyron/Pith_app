// Границы всех клипов таймлайна — цели для магнита кроме плейхеда: подводишь
// край одного слоя к краю другого, и они встают ровно встык.
//
// Помечаем каждую границу её слоем: свои границы дорожка отбрасывает сама
// (TableTimelineTrack), иначе клип липнул бы сам к себе и не двигался.
// Считаются все клипы слоя: подсветка, проявление, повторы и очистки.
export function collectSnapEdges(layers) {
  const list = []
  for (const l of layers ?? []) {
    for (const c of [...(l.clips ?? []), ...(l.repeats ?? []), ...(l.clears ?? [])]) {
      if (!c) continue
      list.push({ t: c.start, layerId: l.id }, { t: c.end, layerId: l.id })
    }
  }
  return list
}
