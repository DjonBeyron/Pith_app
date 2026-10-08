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
// «Ловля слов»: наибольшее число частиц взрыва в воздухе разом и число рендеров слайда с открытым накрытием (на каждой
// клавише без оптимизации росло бы на 1; теперь клавиша слайд не перерисовывает)
let peakParticles = 0
let keyRenders = 0
let heavyRenders = 0 // рендеры тяжёлого видео-слоя (SlideVideo), пока накрытие открыто: после оптимизации на клавише не растут
let catchMounted = false

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

export function noteParticles(n) { if (n > peakParticles) peakParticles = n }

export function countKeyRender() { keyRenders++ }

// Накрытие «Ловли» на экране или нет (FeedSlide) — SlideVideo считает свои рендеры только пока оно открыто
export function setCatchMounted(v) { catchMounted = v }

export function countHeavyRender() { if (catchMounted) heavyRenders++ }

export function spoilerStats() {
  let canvases = 0, animating = 0, bubbles = 0, animatingBubbles = 0
  for (const s of stats.values()) {
    canvases++
    bubbles += s.bubbles
    if (s.warm) { animating++; animatingBubbles += s.bubbles }
  }
  return `canvases=${canvases} (тёплых=${animating}) nodes=${bubbles} (тёплых=${animatingBubbles}) particles=${peakParticles} keyRenders=${keyRenders} (SlideVideo=${heavyRenders}) rebuilds=${rebuilds} stills=${stills}`
}
