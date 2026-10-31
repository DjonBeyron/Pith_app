import { useState, useEffect } from 'react'
import { quietSpec, quietState, quietDone, QUIET_POLL_MS } from './rehearsalQuiet.js'

// Состояние «тишины экрана» (rehearsalQuiet.js): пока Пит говорит реплику на старте стадии, rh.quiet = true. key — стадия (idx:at) или null, voiced — реплика озвучена, order — отсчёт 'before'/'after'/null,
// timing() → { lineAt, lineMs } считается в момент старта стадии (занятость кота и длина реплики известны только тогда), busyLeft() — сколько кот ещё занят. Синхронно с рендером (без вспышки плашки на первом кадре):
// quiet вычисляется из ключа, а таймеры лишь переключают «реплика началась» (для отсчёта «до») и «реплика кончилась».
export function usePitQuiet({ on, key, voiced, order, timing, busyLeft }) {
  const [armed, setArmed] = useState(null)
  const [ended, setEnded] = useState(null)
  useEffect(() => {
    if (!on || !key || !voiced) return undefined
    const t0 = Date.now()
    const spec = quietSpec({ voiced, order, ...timing() })
    if (!spec) return undefined
    const ids = []
    if (spec.from > 0) ids.push(setTimeout(() => setArmed(key), spec.from))
    ids.push(setInterval(() => {
      const elapsed = Date.now() - t0
      if (elapsed >= spec.from && quietDone(spec, elapsed, busyLeft())) { setEnded(key); ids.forEach(clearInterval) }
    }, QUIET_POLL_MS))
    return () => ids.forEach(id => { clearTimeout(id); clearInterval(id) })
    // timing / busyLeft берут свежие значения в момент старта; перезапускать из-за них не нужно
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, key, voiced, order])
  return on ? quietState({ key, voiced, order, armed, ended }) : { quiet: false, plateOk: true }
}
