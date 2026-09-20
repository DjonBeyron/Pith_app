// Счётчик циклов requestAnimationFrame — для датчика производительности.
// Сколько rAF-колбэков сработало за секунду и кто они: 60/с = один цикл на
// 60fps, 180/с = три параллельных цикла. Именно живые rAF-циклы (волна,
// шарики-спойлер, зеркало видео…) не дают GPU и CPU уснуть и делают
// системную анимацию сворачивания iPhone дёрганой.
//
// Ставится только вместе с датчиком (appPerfProbe.js), в обычной работе
// window.requestAnimationFrame не тронут. Имя колбэка — cb.name; в прод-сборке
// имена минифицированы, поэтому там будет в основном общий счётчик, а
// осмысленные имена — на dev-сервере (ПК, Chrome).
let installed = false
let orig = null
let counts = new Map()

function tally(cb) {
  const label = (typeof cb === 'function' && cb.name) || 'anon'
  counts.set(label, (counts.get(label) || 0) + 1)
}

export function installRafProbe() {
  if (installed || typeof window === 'undefined') return
  installed = true
  orig = window.requestAnimationFrame
  window.requestAnimationFrame = function (cb) {
    tally(cb)
    return orig.call(window, cb)
  }
}

export function uninstallRafProbe() {
  if (!installed) return
  window.requestAnimationFrame = orig
  installed = false
  counts = new Map()
}

// Снять счётчики за прошедшую секунду и обнулить: { total, top }
export function takeRafStats() {
  let total = 0
  for (const n of counts.values()) total += n
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([k, n]) => `${k}:${n}`).join(',')
  counts = new Map()
  return { total, top }
}
