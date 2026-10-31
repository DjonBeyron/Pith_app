import { useEffect, useRef, useState } from 'react'
import { plateLite, plateExitMs, PLATE_EXIT_SLACK_MS } from './wordLanePlateExit.js'

// Плашки на экране игры вместе с уходящими. Директор стадий отдаёт текущую плашку (f.plate) на время стадии и убирает её по таймеру стадии; чтобы она успела улететь (wordLanePlateExit.js), плашка, которую директор
// снял или заменил, остаётся в DOM с leaving = true ещё на время ухода и затем исчезает. Каждое появление — новый id (key): тот же DOM-узел продолжает жить и просто получает leaving, без перемонтирования
// (звук и появление не повторяются). Одновременно на экране максимум две-три плашки: уходящая и новая. Состояние выводится в рендере (текущая плашка отличается от запомненной), таймеры — в эффекте.
export function useWordLaneLeavingPlates(text, idx) {
  const [st, setSt] = useState({ cur: null, seq: 0, out: [] })
  const timers = useRef(new Map())
  const want = text ? { text, idx } : null
  const same = st.cur && want ? st.cur.idx === want.idx && st.cur.text === want.text : !st.cur && !want
  let now = st
  if (!same) {
    now = { cur: want ? { ...want, id: st.seq + 1 } : null, seq: want ? st.seq + 1 : st.seq, out: st.cur ? [...st.out, st.cur] : st.out }
    setSt(now)
  }
  useEffect(() => {
    const ts = timers.current
    for (const p of now.out) {
      if (ts.has(p.id)) continue
      ts.set(p.id, setTimeout(() => {
        ts.delete(p.id)
        setSt(s => ({ ...s, out: s.out.filter(o => o.id !== p.id) }))
      }, plateExitMs(plateLite()) + PLATE_EXIT_SLACK_MS))
    }
  }, [now.out])
  useEffect(() => {
    const ts = timers.current
    return () => { ts.forEach(clearTimeout); ts.clear() }
  }, [])
  return [...now.out.map(p => ({ ...p, leaving: true })), ...(now.cur ? [{ ...now.cur, leaving: false }] : [])]
}
