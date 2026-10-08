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
// Оценка памяти под живые холсты/спрайты/картинки покоя: ключ `${id}:f|b|s|i` → байт (w·h·dpr²·4). f — холст плавания, b —
// холст взрыва (живёт только на время взрыва), s — спрайты оставшихся облачек, i — декодированная картинка покоя.
// Строка DBG: gpu≈ (f+b+s) и img≈ (i). Реальная память браузера больше (выравнивание, двойная буферизация) — это порядок величины
const mem = new Map()

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

// bytes ≤ 0 — убрать запись (холст освобождён)
export function noteGpu(key, bytes) {
  if (bytes > 0) mem.set(key, bytes)
  else mem.delete(key)
}

export const canvasBytes = (w, h, dpr = 1) => Math.round(w * dpr) * Math.round(h * dpr) * 4

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
  let gpu = 0, img = 0
  for (const [k, v] of mem) {
    if (k.endsWith(':i')) img += v
    else gpu += v
  }
  const mb = v => (v / 1048576).toFixed(2)
  return `gpu≈${mb(gpu)} MB img≈${mb(img)} MB canvases=${canvases} (тёплых=${animating}) nodes=${bubbles} (тёплых=${animatingBubbles}) particles=${peakParticles} keyRenders=${keyRenders} (SlideVideo=${heavyRenders}) rebuilds=${rebuilds} stills=${stills}`
}
