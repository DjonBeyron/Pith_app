// Определение «слабого» устройства — для более дешёвых анимаций (сейчас:
// спойлер шариками в ленте). Порядок надёжности сигналов на практике (по
// тестам на Redmi A2+ и iPhone 16 Pro) оказался ОБРАТНЫМ ожидаемому:
//
// 1. Название GPU — САМЫЙ надёжный статический признак. Конкретные семейства
//    (PowerVR SGX, старый Mali, старый Adreno) однозначно древние — в отличие
//    от «ядер», это не подделать высоким числом ядер у дешёвого SoC.
// 2. navigator.hardwareConcurrency/deviceMemory — врут в обе стороны: на
//    Redmi A2+ показывает cores=8 (реально слабый чип), а на iOS Safari
//    СПЕЦИАЛЬНО занижает hardwareConcurrency (анти-фингерпринтинг) — iPhone
//    16 Pro (реально 6 ядер) отдавал cores=4, из-за чего ЛЮБОЙ iPhone ложно
//    попадал в «слабые». Поэтому на iOS эта проверка вообще не используется.
// 3. Синхронный бенчмарк (рисуем пачку дуг, меряем performance.now()) —
//    самый шумный сигнал: чувствителен к моменту прогрева JIT, состоянию
//    вкладки и т.п. Используется как последний, самый слабый признак.
// 4. FPS ленты через requestAnimationFrame (см. feedDebug.js) — на самых
//    проблемных устройствах ненадёжен ещё сильнее: там, где rAF и так
//    душится перегруженным потоком, счётчик может не накопить данные вовсе.
//    Оставлен только как асинхронная подстраховка поверх остального.
//
// Результат кэшируется в localStorage — при следующем заходе решение уже
// готово с первого кадра.
const KEY = 'pithy_weak_device_v4'
const BENCH_ARCS = 3000
const BENCH_THRESHOLD_MS = 6

const WEAK_GPU_PATTERNS = [
  /powervr sgx/i, // 2010-2013е поколение, до сих пор ставится в самые дешёвые SoC
  /powervr rogue.*(ge8100|ge8300)/i, // младшие Rogue (MediaTek Helio A-серия)
  /mali-4\d\d/i,
  /mali-t6\d\d/i,
  /mali-t7\d\d/i,
  /adreno \(tm\) 3\d\d/i,
  /adreno \(tm\) 4\d\d/i,
]

function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
}

// GPU по WEBGL_debug_renderer_info — та же проба, что и в feedDebug.js для
// отображения в DBG (продублирована здесь намеренно: этот модуль не должен
// зависеть от feedDebug, а не наоборот — feedDebug импортирует решение отсюда)
export function probeGpu() {
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl')
    if (!gl) return 'нет WebGL'
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
  } catch {
    return 'ошибка определения'
  }
}

function gpuLooksWeak(gpu) {
  return WEAK_GPU_PATTERNS.some(re => re.test(gpu))
}

function staticGuess() {
  // iOS: hardwareConcurrency занижен намеренно (см. комментарий выше) —
  // не доверяем, полагаемся на GPU-строку/бенчмарк
  if (isIOS()) return false
  const cores = navigator.hardwareConcurrency ?? 8
  const mem = navigator.deviceMemory
  return cores <= 4 || (mem !== undefined && mem <= 2)
}

// Один прогон той же операции, что и в drawFloat/drawExplode спойлера
// (moveTo+arc в одном path, один fill) — чтобы замер отражал реальную цену
function benchOnce(ctx) {
  const t0 = performance.now()
  ctx.clearRect(0, 0, 200, 200)
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  for (let i = 0; i < BENCH_ARCS; i++) {
    const x = (i * 37) % 200, y = (i * 53) % 200
    ctx.moveTo(x + 1, y)
    ctx.arc(x, y, 1, 0, Math.PI * 2)
  }
  ctx.fill()
  return performance.now() - t0
}

// Первый прогон отбрасываем (JIT-компиляция + инициализация backing store
// искажают его). Берём минимум из двух прогретых прогонов
function benchmarkIsSlow() {
  try {
    const c = document.createElement('canvas')
    c.width = 200
    c.height = 200
    const ctx = c.getContext('2d')
    if (!ctx) return false
    benchOnce(ctx)
    const a = benchOnce(ctx)
    const b = benchOnce(ctx)
    return Math.min(a, b) > BENCH_THRESHOLD_MS
  } catch {
    return false
  }
}

let weak = null
try {
  const cached = localStorage.getItem(KEY)
  if (cached !== null) weak = cached === '1'
} catch { /* приватный режим/квота — не критично, посчитаем заново */ }
if (weak === null) {
  weak = gpuLooksWeak(probeGpu()) || staticGuess() || benchmarkIsSlow()
  try { localStorage.setItem(KEY, weak ? '1' : '0') } catch { /* не критично */ }
}

export function isWeakDevice() {
  return weak
}

// Зовётся из FPS-монитора, когда реально накопилось измерение — доп.
// подстраховка сверх остальных сигналов (мог не поймать «тормозит под
// нагрузкой», хоть сам по себе рисует быстро). Помечает слабым насовсем
export function markWeakDevice() {
  if (weak) return
  weak = true
  try { localStorage.setItem(KEY, '1') } catch { /* не критично */ }
}
