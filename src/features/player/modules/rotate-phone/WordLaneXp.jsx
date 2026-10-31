import { memo, useCallback, useEffect, useRef, useState } from 'react'
import XpFloat from '../../XpFloat.jsx'

// Счётчик XP в углу и летящие цифры наград игры «Повтори за диктором». Своё состояние (xp, events) живёт здесь, а не в сценарии игры: каждая награда перерисовывает только этот
// маленький компонент, а не весь оверлей (пилюли, кот, микрофон). Снаружи — apiRef.current.add(amount, rect): цифра «+N XP» взлетает из rect (пилюля), долетела — счётчик растёт.
// У повтора из нескольких кусков награда одна на повтор (amount = XP за все куски), а не по цифре на кусок.
function WordLaneXp({ apiRef }) {
  const [state, setState] = useState({ xp: 0, events: [] })
  const idRef = useRef(0)
  useEffect(() => {
    apiRef.current = { add: (amount, rect) => { const id = ++idRef.current; setState(p => ({ ...p, events: [...p.events, { id, amount, rect }] })) } }
    return () => { apiRef.current = null }
  }, [apiRef])
  const dismiss = useCallback(id => setState(p => {
    const ev = p.events.find(e => e.id === id)
    return ev ? { xp: p.xp + ev.amount, events: p.events.filter(e => e.id !== id) } : p
  }), [])
  const { xp, events } = state
  return (
    <>
      <div className={`wlXp${xp > 0 || events.length ? ' wlXp--on' : ''}`} data-testid="wl-xp">{xp} XP</div>
      <XpFloat events={events} onDismiss={dismiss} viewport />
    </>
  )
}

export default memo(WordLaneXp)
