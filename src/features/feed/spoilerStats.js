// Реестр активных канвасов-спойлера (PhraseBubbleSpoiler) — только для
// DBG-панели ленты: видно, сколько холстов сейчас реально анимируется
// (тёплые/активные слайды) и сколько шариков они суммарно рисуют за кадр —
// диагностика лагов ленты/скролла после появления спойлера.
const stats = new Map()
let seq = 0
// Счётчики работы за сессию: пересборки сетки шариков (buildGrid) и картинки покоя (toDataURL). В покое при открытой
// шторке «Ловли слов» не должны расти — автор смотрит на них в DBG
let rebuilds = 0
let stills = 0

export function nextSpoilerId() {
  return ++seq
}

export function setSpoilerStat(id, bubbles, warm) {
  if (!bubbles) { stats.delete(id); return }
  stats.set(id, { bubbles, warm })
}

export function clearSpoilerStat(id) {
  stats.delete(id)
}

export function countRebuild() { rebuilds++ }

export function countStill() { stills++ }

export function spoilerStats() {
  let canvases = 0, animating = 0, bubbles = 0, animatingBubbles = 0
  for (const s of stats.values()) {
    canvases++
    bubbles += s.bubbles
    if (s.warm) { animating++; animatingBubbles += s.bubbles }
  }
  return `canvases=${canvases} (тёплых=${animating}) bubbles=${bubbles} (тёплых=${animatingBubbles}) rebuilds=${rebuilds} stills=${stills}`
}
