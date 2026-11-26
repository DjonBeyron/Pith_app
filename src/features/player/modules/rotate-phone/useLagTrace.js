import { useEffect, useRef } from 'react'
import { createLagTrace, lagMark, LAG_MS, LAG_WEAK_MS } from '../../../../shared/lib/lagTrace.js'
import { sceneTrace } from '../../../../shared/lib/sceneTrace.js'
import { isWeakDevice } from '../../../../shared/lib/deviceTier.js'
import { frameTick, frameCancel } from './gameFrame.js'

// Трассер лагов в игре (shared/lib/lagTrace.js): включается только при отладочном интерфейсе (on = f.dbg.enabled — как шестерёнка и журнал; у ученика ничего не заводится). Кадры берёт из общего цикла
// игры (gameFrame.frameTick — своего requestAnimationFrame нет), на паузе не считает; сводку «[lag] итог: …» пишет на экране итога (done), на событии трассы end и при закрытии игры — один раз (повторная сводка без новой игры не пишется).
// Виновник от браузера: 'long-animation-frame' (Chromium 123+) — сколько шёл скрипт, какая функция дольше всех, сколько стили с раскладкой; иначе 'longtask' (только длина); в Safari нет ни того ни другого.

const fnName = s => s?.sourceFunctionName || String(s?.invoker ?? '').split('/').pop().slice(0, 40) || '?'
/** Запись long-animation-frame → { start, dur, text } */
export function loafEntry(e) {
  const scripts = [...(e.scripts ?? [])].sort((a, b) => b.duration - a.duration), script = scripts.reduce((s, x) => s + x.duration, 0), forced = scripts.reduce((s, x) => s + (x.forcedStyleAndLayoutDuration ?? 0), 0)
  const style = e.styleAndLayoutStart ? Math.max(0, e.startTime + e.duration - e.styleAndLayoutStart) : 0
  return { start: e.startTime, dur: e.duration, text: `кадр браузера ${Math.round(e.duration)} мс: скрипт ${Math.round(script)} мс${scripts[0] ? ` (дольше всех ${fnName(scripts[0])} ${Math.round(scripts[0].duration)} мс)` : ''}${forced >= 1 ? `, из них вынужденный пересчёт стилей ${Math.round(forced)} мс` : ''}, стили и раскладка ${Math.round(style)} мс` }
}

/** Подписка на длинные кадры браузера → отписка. Нет поддержки — пустая отписка */
export function watchLongFrames(trace, { PO = globalThis.PerformanceObserver } = {}) {
  try {
    const types = PO?.supportedEntryTypes ?? []
    const type = types.includes('long-animation-frame') ? 'long-animation-frame' : types.includes('longtask') ? 'longtask' : null
    if (!type) return () => {}
    const obs = new PO(list => { for (const e of list.getEntries()) trace.long(type === 'longtask' ? { start: e.startTime, dur: e.duration, text: `длинная задача ${Math.round(e.duration)} мс` } : loafEntry(e)) })
    obs.observe({ type })
    return () => obs.disconnect()
  } catch { return () => {} }
}

/** on — отладочный интерфейс; paused — игра на паузе; done — игра дошла до экрана итога: сводка пишется сразу (её увидит и отправка журнала с экрана итога), а не при закрытии игры */
export function useLagTrace(on, paused, done = false) {
  const ref = useRef(null)
  useEffect(() => {
    if (!on) return undefined
    const trace = ref.current = createLagTrace({ limit: isWeakDevice() ? LAG_WEAK_MS : LAG_MS })
    let id = 0
    const tick = ts => { id = frameTick(tick); trace.frame(ts) }
    id = frameTick(tick)
    const unwatch = watchLongFrames(trace), offEnd = sceneTrace.onEnd(() => trace.summary())
    return () => { frameCancel(id); unwatch(); offEnd(); trace.summary(); ref.current = null }
  }, [on])
  useEffect(() => { ref.current?.pause(paused) }, [paused, on])
  useEffect(() => { if (done) ref.current?.summary() }, [done, on])
}

/** Метка смены признака (перекраска дорожек при Мии): на первом показе молчит, на смене пишет on / off длиной ms */
export function useLagMarkOn(value, on, off, ms = 0) {
  const was = useRef(value)
  useEffect(() => { if (was.current === value) return; was.current = value; lagMark(value ? on : off, ms) }, [value, on, off, ms])
}
