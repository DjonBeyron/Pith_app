import { memo, useCallback, useEffect, useRef, useState } from 'react'
import WordLaneXpParticle from './WordLaneXpParticle.jsx'
import { XP_PULSE_MS, xpPulseFrames } from './WordLaneXpFlight.js'

// Счётчик XP в углу и летящие цифры наград игры «Повтори за диктором». Своё состояние (xp, events) живёт здесь, а не в сценарии игры: каждая награда перерисовывает только этот
// маленький компонент, а не весь оверлей (пилюли, кот, микрофон). Снаружи — apiRef.current.add(amount, rect): цифра «+N XP» летит из rect (пилюля) в сам счётчик (WordLaneXpParticle.jsx),
// долетела — число растёт и счётчик плавно «дышит» по scale (пульс; новый прилёт перезапускает его). У повтора из нескольких кусков награда одна на повтор (amount = XP за все куски).
const PULSE = xpPulseFrames()

function WordLaneXp({ apiRef }) {
  const [state, setState] = useState({ xp: 0, events: [] })
  const idRef = useRef(0)
  const boxRef = useRef(null)
  const pulseRef = useRef(null)
  useEffect(() => {
    apiRef.current = { add: (amount, rect) => { const id = ++idRef.current; setState(p => ({ ...p, events: [...p.events, { id, amount, rect }] })) } }
    return () => { apiRef.current = null }
  }, [apiRef])
  const getTarget = useCallback(() => boxRef.current, [])
  const pulse = useCallback(() => {
    const el = boxRef.current
    if (!el?.animate) return
    pulseRef.current?.cancel()
    pulseRef.current = el.animate(PULSE, { duration: XP_PULSE_MS, easing: 'linear' })
  }, [])
  useEffect(() => () => pulseRef.current?.cancel(), [])
  const dismiss = useCallback(id => {
    setState(p => {
      const ev = p.events.find(e => e.id === id)
      return ev ? { xp: p.xp + ev.amount, events: p.events.filter(e => e.id !== id) } : p
    })
    pulse()
  }, [pulse])
  const { xp, events } = state
  return (
    <>
      <div ref={boxRef} className={`wlXp${xp > 0 || events.length ? ' wlXp--on' : ''}`} data-testid="wl-xp">{xp} XP</div>
      {events.map(ev => <WordLaneXpParticle key={ev.id} amount={ev.amount} rect={ev.rect} getTarget={getTarget} onDone={() => dismiss(ev.id)} />)}
    </>
  )
}

export default memo(WordLaneXp)
