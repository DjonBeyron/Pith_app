import { useCallback, useEffect, useMemo, useState } from 'react'
import { createListenQueue } from './listenQueue.js'

// Очередь прослушивания на экране «Таймлайн игры» (listenQueue.js): один проигрыватель на экран, закрытие экрана и Esc останавливают звук.
// → { st (состояние очереди), start(items, from), pause, resume, stop, next, prev, rate, setRate }
const IDLE = { status: 'idle', index: -1, total: 0, key: null, skipped: [], error: '' }
export function useListenQueue(make) {
  const [st, setSt] = useState(IDLE)
  const [rate, setRateState] = useState(1)
  const [q] = useState(() => createListenQueue({ onState: setSt, ...(make ? { make } : {}) }))
  useEffect(() => () => q.stop(), [q])
  useEffect(() => {
    if (st.status === 'idle' || st.status === 'done' || st.status === 'error') return undefined
    const on = e => { if (e.key === 'Escape') q.stop() }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [st.status, q])
  const setRate = useCallback(r => { setRateState(r); q.setRate(r) }, [q])
  return useMemo(() => ({ st, start: q.start, pause: q.pause, resume: q.resume, stop: q.stop, next: q.next, prev: q.prev, rate, setRate }), [st, q, rate, setRate])
}
