// Часы вместо <audio> — чтобы таймлайн таблицы можно было монтировать и
// проигрывать без озвучки.
//
// Весь код таймлайна (редактор и плеер) читает время из `audioRef.current`:
// `currentTime`, `play()`, `pause()`, `paused`. Часы повторяют ровно этот
// кусок интерфейса, поэтому их можно подсунуть вместо аудио-элемента, и
// ничего вокруг переписывать не приходится.
export function createSilentClock(duration, { onEnded } = {}) {
  let offset  = 0                 // время в ролике на момент последнего старта
  let started = 0                 // performance.now() этого старта
  let paused  = true
  let endId   = null

  const now = () => (paused ? offset : Math.min(duration, offset + (performance.now() - started) / 1000))

  const clock = {
    duration,
    get paused() { return paused },
    get ended() { return now() >= duration },
    play() {
      if (!paused) return Promise.resolve()
      // Доиграли до конца и жмём play — начинаем сначала, как это делает <audio>
      if (offset >= duration) offset = 0
      paused = false
      started = performance.now()
      watch()
      return Promise.resolve()
    },
    pause() {
      if (paused) return
      offset = now()
      paused = true
      stop()
    },
    stop,
  }

  Object.defineProperty(clock, 'currentTime', {
    get: now,
    set(v) {
      offset = Math.max(0, Math.min(duration, v || 0))
      started = performance.now()
    },
  })

  // Единственная задача таймера — сообщить о конце ролика. Само время считает
  // performance.now(), а не накопление по кадрам, поэтому оно не плывёт.
  // Таймер, а не requestAnimationFrame: в фоновой вкладке кадры не приходят
  // вовсе, и конец прогона там просто не наступал бы.
  function watch() {
    stop()
    const left = Math.max(0, (duration - now()) * 1000)
    endId = setTimeout(() => {
      endId = null
      offset = duration
      paused = true
      onEnded?.()
    }, left)
  }

  function stop() {
    if (endId) clearTimeout(endId)
    endId = null
  }

  return clock
}
