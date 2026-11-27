import { useEffect, useRef } from 'react'
import { createLagTrace, lagMark, LAG_MS, LAG_WEAK_MS } from '../../../../shared/lib/lagTrace.js'
import { sceneTrace } from '../../../../shared/lib/sceneTrace.js'
import { isWeakDevice } from '../../../../shared/lib/deviceTier.js'
import { watchFonts } from '../../../../shared/lib/fontLog.js'
import { pLog } from '../../../../shared/lib/debug.js'
import { frameTick, frameCancel } from './gameFrame.js'

// Трассер лагов в игре (shared/lib/lagTrace.js): включается только при отладочном интерфейсе (on = f.dbg.enabled — как шестерёнка и журнал; у ученика ничего не заводится). Кадры берёт из общего цикла
// игры (gameFrame.frameTick — своего requestAnimationFrame нет), на паузе не считает; сводку «[lag] итог: …» пишет на экране итога (done), на событии трассы end и при закрытии игры — один раз (повторная сводка без новой игры не пишется).
// Виновник от браузера: 'long-animation-frame' (Chromium 123+) — сколько шёл скрипт, какая функция дольше всех, сколько стили с раскладкой; иначе 'longtask' (только длина); в Safari нет ни того ни другого.

const fnName = s => s?.sourceFunctionName || String(s?.invoker ?? '').split('/').pop().slice(0, 40) || '?'
// Где в сборке этот скрипт (имена функций в сборке сжаты — `qu`, `lp`): файл и позиция символа; по ним в карте сборки находится настоящая функция. Только для тяжёлых скриптов (журнал Android v3.3.390: `qu` 541 мс, `lp` 312 мс — без позиции непонятно, чьи это кадры)
const where = s => (s?.sourceURL ? ` [${String(s.sourceURL).split('/').pop().split('?')[0].slice(-32)}:${s.sourceCharPosition ?? '?'}${s.invokerType ? `, ${s.invokerType}` : ''}]` : '')
/** Запись long-animation-frame → { start, dur, text } */
export function loafEntry(e) {
  const scripts = [...(e.scripts ?? [])].sort((a, b) => b.duration - a.duration), script = scripts.reduce((s, x) => s + x.duration, 0), forced = scripts.reduce((s, x) => s + (x.forcedStyleAndLayoutDuration ?? 0), 0), worst = scripts.reduce((m, x) => ((x.forcedStyleAndLayoutDuration ?? 0) > (m?.forcedStyleAndLayoutDuration ?? 0) ? x : m), null)
  const style = e.styleAndLayoutStart ? Math.max(0, e.startTime + e.duration - e.styleAndLayoutStart) : 0
  return { start: e.startTime, dur: e.duration, text: `кадр браузера ${Math.round(e.duration)} мс: скрипт ${Math.round(script)} мс${scripts[0] ? ` (дольше всех ${fnName(scripts[0])} ${Math.round(scripts[0].duration)} мс${scripts[0].duration >= 100 ? where(scripts[0]) : ''})` : ''}${forced >= 1 ? `, из них вынужденный пересчёт стилей ${Math.round(forced)} мс${forced >= 100 ? ` (больше всего в ${fnName(worst)}${where(worst)})` : ''}` : ''}, стили и раскладка ${Math.round(style)} мс` }
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

/** Трассер выключен ключом памяти pithy_lag_trace = '0' (замер цены самого трассера: _stand/race/perf-run.mjs LAG=0); '1' / нет ключа — работает. У владельца ключа нет */
export const lagTraceOff = () => { try { return globalThis.localStorage?.getItem('pithy_lag_trace') === '0' } catch { return false } }

/** on — отладочный интерфейс; paused — игра на паузе; done — игра дошла до экрана итога: сводка пишется сразу (её увидит и отправка журнала с экрана итога), а не при закрытии игры */
export function useLagTrace(on, paused, done = false) {
  const ref = useRef(null)
  useEffect(() => {
    if (!on || lagTraceOff()) return undefined
    const trace = ref.current = createLagTrace({ limit: isWeakDevice() ? LAG_WEAK_MS : LAG_MS })
    let id = 0
    const tick = ts => { id = frameTick(tick); trace.frame(ts) }
    id = frameTick(tick)
    const unwatch = watchLongFrames(trace), offEnd = sceneTrace.onEnd(() => trace.summary()), offFonts = watchFonts(pLog) // шрифты — в журнал рядом с [jank]: догрузка шрифта пересчитывает весь текст страницы
    return () => { frameCancel(id); unwatch(); offEnd(); offFonts(); trace.summary(); ref.current = null }
  }, [on])
  useEffect(() => { ref.current?.pause(paused) }, [paused, on])
  useEffect(() => { if (done) ref.current?.summary() }, [done, on])
}

/** Метка смены признака (перекраска дорожек при Мии): на первом показе молчит, на смене пишет on / off длиной ms */
export function useLagMarkOn(value, on, off, ms = 0) {
  const was = useRef(value)
  useEffect(() => { if (was.current === value) return; was.current = value; lagMark(value ? on : off, ms) }, [value, on, off, ms])
}
