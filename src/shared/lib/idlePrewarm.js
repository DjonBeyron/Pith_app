// Прогрев чанков остальных экранов в простое — после того как лента уже
// показана. Пользователь, перешедший с ленты в другую вкладку или открывший
// урок, находит нужный код уже в HTTP-кэше. Принципы:
//  - не раньше ухода стартового сплэша (он уходит по первому кадру видео
//    ленты) плюс START_DELAY — первые секунды ленты не делим с докачкой;
//  - по одной задаче за раз, между ними пауза GAP, каждая — в простое
//    (requestIdleCallback; в Safari его нет — тогда обычный таймер);
//  - не на слабой сети (режим экономии трафика, 2g/slow-2g) — там фоновая
//    докачка только мешает ленте; в фоне (вкладка скрыта) — ждём возврата;
//  - упавшая задача (нет сети, чанк-сирота) тихо игнорируется: это только
//    ускорение, а реальная загрузка при открытии экрана сама всё повторит.
export const START_DELAY = 2000
export const GAP = 1200
export const IDLE_TIMEOUT = 5000

export function isSlowConnection(conn) {
  if (!conn) return false
  return !!conn.saveData || conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g'
}

// tasks — функции, каждая запускает загрузку (возвращает promise или ничего).
// env — подмена окружения для тестов. Возвращает функцию отмены.
export function startIdlePrewarm(tasks, env = {}) {
  const w = env.window ?? window
  const doc = env.document ?? document
  const conn = 'connection' in env ? env.connection : (typeof navigator !== 'undefined' ? navigator.connection : null)
  if (!tasks.length || isSlowConnection(conn)) return () => {}

  let stopped = false
  let timer = null
  let idleId = null
  let i = 0
  let offGone = null
  let offVisible = null

  function next() {
    timer = null
    if (stopped || i >= tasks.length) return
    if (doc.visibilityState === 'hidden') {
      // В фоне не качаем — продолжим, когда вернутся
      const onVis = () => {
        if (doc.visibilityState !== 'visible') return
        doc.removeEventListener('visibilitychange', onVis)
        offVisible = null
        next()
      }
      doc.addEventListener('visibilitychange', onVis)
      offVisible = () => doc.removeEventListener('visibilitychange', onVis)
      return
    }
    const run = () => {
      idleId = null
      if (stopped) return
      const task = tasks[i++]
      try { Promise.resolve(task()).catch(() => {}) } catch { /* только ускорение */ }
      timer = setTimeout(next, GAP)
    }
    if (typeof w.requestIdleCallback === 'function') idleId = w.requestIdleCallback(run, { timeout: IDLE_TIMEOUT })
    else timer = setTimeout(run, 300)
  }

  const begin = () => { timer = setTimeout(next, START_DELAY) }
  if (w.__pithySplashGone) begin()
  else {
    const onGone = () => { offGone = null; begin() }
    w.addEventListener('pithy:splash-gone', onGone, { once: true })
    offGone = () => w.removeEventListener('pithy:splash-gone', onGone)
  }

  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
    if (idleId != null && typeof w.cancelIdleCallback === 'function') w.cancelIdleCallback(idleId)
    offGone?.()
    offVisible?.()
  }
}
