// Подменный DOM для тестов постер-кадров. capturePosterFrame() работает с
// настоящим <video>, а тесты идут в node-окружении без jsdom — здесь минимум,
// который нужен реальному коду: createElement('video'|'canvas'), события,
// URL.createObjectURL. Сценарий поведения декодера задаёт сам тест, поэтому
// можно честно прогонять сотни вариантов (быстрый, медленный, зависший, битый).

function makeVideo(onSrc) {
  const handlers = {}
  let srcVal = null
  const v = {
    muted: false, playsInline: false,
    videoWidth: 0, videoHeight: 0, duration: 3, currentTime: 0,
    seeks: 0, loadCalls: 0,
    addEventListener(type, fn) { (handlers[type] ??= []).push(fn) },
    removeAttribute() {},
    load() { v.loadCalls++ },
    fire(type) { for (const fn of (handlers[type] ?? []).slice()) fn() },
    get src() { return srcVal },
    set src(val) { srcVal = val; onSrc(v) },
  }
  // currentTime = X в коде — это запрос перемотки; считаем их
  return new Proxy(v, {
    set(target, key, val) {
      if (key === 'currentTime' && target.currentTime !== val) target.seeks++
      target[key] = val
      return true
    },
  })
}

function makeCanvas(onToBlob) {
  return {
    width: 0, height: 0,
    getContext: () => ({ drawImage() {} }),
    toBlob(cb) { onToBlob?.(); cb({ size: 1234, type: 'image/jpeg' }) },
  }
}

// plans — очередь сценариев: n-й созданный <video> отыгрывает n-й сценарий.
// Сценарий получает элемент и сам решает, что и когда «сработает».
export function installFakeDom(plans = []) {
  const created = []
  const queue = [...plans]
  const prevDoc = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const prevCreate = URL.createObjectURL
  const prevRevoke = URL.revokeObjectURL
  let seq = 0
  let canvasCalls = 0

  globalThis.document = {
    createElement(tag) {
      if (tag === 'video') {
        const v = makeVideo(el => {
          const plan = queue.shift() ?? (() => {})
          plan(el)
        })
        created.push(v)
        return v
      }
      if (tag === 'canvas') return makeCanvas(() => { canvasCalls++ })
      return {}
    },
  }
  URL.createObjectURL = () => `blob:poster-${++seq}`
  URL.revokeObjectURL = () => {}

  return {
    created,
    push: plan => queue.push(plan),
    get canvasCalls() { return canvasCalls },
    restore() {
      if (prevDoc) Object.defineProperty(globalThis, 'document', prevDoc)
      else delete globalThis.document
      URL.createObjectURL = prevCreate
      URL.revokeObjectURL = prevRevoke
    },
  }
}

// Типовые сценарии декодера. ms — задержка до события.
export const PLANS = {
  // кадр отдаётся сразу на loadeddata (размеры уже известны)
  fast: (ms = 40) => v => setTimeout(() => {
    v.videoWidth = 320; v.videoHeight = 240; v.fire('loadeddata')
  }, ms),
  // размеры ещё не известны → код перематывает и ждёт seeked
  seek: (loadMs = 60, seekMs = 200) => v => setTimeout(() => {
    v.fire('loadeddata')
    setTimeout(() => { v.videoWidth = 320; v.videoHeight = 240; v.fire('seeked') }, seekMs)
  }, loadMs),
  // декодер молчит — сработает только таймаут внутри capturePosterFrame
  hang: () => () => {},
  // повреждённый/неподдерживаемый файл
  error: (ms = 30) => v => setTimeout(() => v.fire('error'), ms),
}

// Детерминированный ГПСЧ — прогоны воспроизводимы по номеру сида
export function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
