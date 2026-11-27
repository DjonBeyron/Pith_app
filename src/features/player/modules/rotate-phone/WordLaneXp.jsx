import { memo, useCallback, useEffect, useRef, useState } from 'react'
import WordLaneXpFloat from './WordLaneXpFloat.jsx'
import { XP_PULSE_MS, xpPulseFrames } from './WordLaneXpFlight.js'
import { XP_PULSE_EVENT } from './wordLaneRiseXp.js'

// Счётчик XP в углу и «+N XP» от него. Своё состояние (xp, events) живёт здесь, а не в сценарии игры. Снаружи — apiRef.current.add(amount, rect, arriveMs): награда придёт через arriveMs
// (пилюля летит в счётчик, wordLaneRiseXp.js); пилюля прилетела — число растёт, счётчик «распухает» (scale, XP_PULSE_MS; новый прилёт перезапускает) и от него вверх идёт «+N XP» (WordLaneXpFloat).
// Цифра из пилюли больше не летит (v3.3.271). У повтора из нескольких кусков награда одна — когда принят последний кусок. rect (пилюля) нужен только старому вызову без arriveMs.
const PULSE = xpPulseFrames()
export const XP_DEFER_MS = 34 // число и «+N XP» (React-перерисовка, новый узел, чтение рамки счётчика) — двумя кадрами ПОЗЖЕ пульса счётчика: пульс (одна анимация) и вся работа прилёта не в одном кадре (v3.3.392: микро-фриз на прилёте, замер Android-стенда CPU 4×)

function WordLaneXp({ apiRef }) {
  const [state, setState] = useState({ xp: 0, events: [] })
  const idRef = useRef(0)
  const boxRef = useRef(null)
  const pulseRef = useRef(null)
  const timers = useRef(new Set())
  const pulseAt = useRef(0)
  const pulse = useCallback(() => {
    const el = boxRef.current
    if (!el?.animate) return
    pulseAt.current = performance.now()
    pulseRef.current?.cancel()
    pulseRef.current = el.animate(PULSE, { duration: XP_PULSE_MS, easing: 'linear' })
  }, [])
  const arrive = useCallback(amount => { const id = ++idRef.current; setState(p => ({ xp: p.xp + amount, events: [...p.events, { id, amount }] })); if (performance.now() - pulseAt.current > 2 * XP_DEFER_MS + 60) pulse() }, [pulse]) // пульс уже пошёл от события пилюли (меньше ≈ 130 мс назад) — не перезапускаем его с нуля
  useEffect(() => {
    const all = timers.current
    apiRef.current = { add: (amount, _rect, arriveMs = 0) => { if (!(arriveMs > 0)) { arrive(amount); return } const t = setTimeout(() => { all.delete(t); arrive(amount) }, arriveMs + XP_DEFER_MS); all.add(t) } }
    return () => { apiRef.current = null; all.forEach(clearTimeout); all.clear() }
  }, [apiRef, arrive])
  useEffect(() => {
    const game = boxRef.current?.closest?.('.wl')
    game?.addEventListener(XP_PULSE_EVENT, pulse) // пилюля долетела / вышла за экран (wordLanePool.rise): счётчик «распухает», даже когда XP не начисляется (фразы)
    return () => { game?.removeEventListener(XP_PULSE_EVENT, pulse); pulseRef.current?.cancel() }
  }, [pulse])
  const getTarget = useCallback(() => boxRef.current, [])
  const done = useCallback(id => setState(p => ({ ...p, events: p.events.filter(e => e.id !== id) })), [])
  const { xp, events } = state
  return (
    <>
      <div ref={boxRef} className={`wlXp${xp > 0 || events.length ? ' wlXp--on' : ''}`} data-testid="wl-xp">{xp} XP</div>
      {events.map(ev => <WordLaneXpFloat key={ev.id} amount={ev.amount} getTarget={getTarget} onDone={() => done(ev.id)} />)}
    </>
  )
}

export default memo(WordLaneXp)
