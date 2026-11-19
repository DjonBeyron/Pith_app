import { useCallback, useEffect, useRef } from 'react'
import { createBoxFree, FREE_WINDOW_MS, FREE_WATCHDOG_MS } from './miaBoxFree.js'

// Пит в коробке без Мии (директор гонки, useRaceActs; v3.3.290): Мия выпрыгнула одна (RaceMia → onStuck) → Пит просит помочь; касания по коробке (onHit) считает createBoxFree: два подряд — коробка снята (событие free,
// отлетает без Мии, Пит благодарит), одно без второго — «попробуй быстрее». Конец финала (стадия boss-end) держится, пока коробку не сняли и Пит не договорил (afterCount опрашивает), но не дольше сторожа.
// miaEvent(ev) — вход в машину Мии, mb — её рабочая коробка, rhAfter — обычный afterCount директора репетиции.
export const FREE_LEAVE_MS = 1300 // отлёт коробки (miaMotion.LEAVE.END) до реплики благодарности

export function useMiaBoxFree({ mb, miaEvent, mspeech, running, rhAfter, log }) {
  const bf = useRef(null), done = useRef(false), lockUntil = useRef(0), timers = useRef(new Set())
  const later = useCallback((fn, ms) => { const t = setTimeout(() => { timers.current.delete(t); fn() }, ms); timers.current.add(t) }, [])
  useEffect(() => { const ts = timers.current; return () => { ts.forEach(clearTimeout); ts.clear() } }, [])
  const free = useCallback(why => {
    if (mb.m.solo !== 'stuck') return
    log(`[mia] коробка снята (${why}): отлетает без Мии`)
    miaEvent({ t: 'free', stage: running })
    later(() => { done.current = true }, FREE_LEAVE_MS + mspeech.msOf('pit_back_1', 'pit') + 900)
  }, [mb, miaEvent, mspeech, running, later, log])
  const onStuck = useCallback(() => {
    if (mb.m.solo !== 'keep') return
    bf.current = createBoxFree(); done.current = false
    log('[mia] Мия выпрыгнула одна: Пит просит помочь, ждём два касания по коробке')
    miaEvent({ t: 'stuck', stage: running })
    later(() => free('сторож: касаний не было'), FREE_WATCHDOG_MS)
  }, [mb, miaEvent, running, later, free, log])
  const onHit = useCallback(() => {
    if (mb.m.solo !== 'stuck' || !bf.current || performance.now() < lockUntil.current) return // пока Пит говорит «можешь сильнее её поддеть», касания не считаются (владелец)
    const r = bf.current.hit(performance.now())
    if (r === 'free') free('касания')
    else if (r === 'one') later(() => { if (bf.current?.expired(performance.now())) { log('[mia] одно касание без второго: «можешь сильнее её поддеть», касания заблокированы, пока Пит договаривает'); lockUntil.current = performance.now() + mspeech.msOf('boss_pit_faster', 'pit') + 900; miaEvent({ t: 'faster', stage: running }) } }, FREE_WINDOW_MS + 60)
  }, [mb, miaEvent, mspeech, running, later, free, log])
  /** Обычный конец стадии — rhAfter; Пит в коробке — ждём, пока коробку снимут и Пит договорит (опрос раз в 300 мс) */
  const afterCount = useCallback(fn => {
    if (!mb.m.solo) { rhAfter(fn); return }
    const t0 = performance.now()
    const poll = () => { if (done.current || performance.now() - t0 > FREE_WATCHDOG_MS + 15000) rhAfter(fn); else later(poll, 300) }
    poll()
  }, [mb, rhAfter, later])
  return { onStuck, onHit, afterCount }
}
