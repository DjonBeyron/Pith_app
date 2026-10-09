import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { readStrategy, writeStrategy } from './restartStrategies.js'
import { readState, writeState, startSeries, cancelSeries, clearResults, addRun } from './restartSeries.js'

// React-обвязка «серии из 6 нажатий» по стратегиям перезапуска: выбранная стратегия (её читает контроллер пробы через readStrategy в момент тапа),
// состояние серий (localStorage) и сбор заходов из записей журнала. record стабилен (его зовёт onLogged контроллера, созданного один раз).
export function useRestartSeries() {
  const [state, setState] = useState(readState)
  const [strategy, setStrategy] = useState(() => readStrategy())
  const pending = useRef([]) // записи попыток текущего захода: заход закрывает запись с last=true

  useEffect(() => { writeState(state) }, [state])

  const choose = useCallback(id => setStrategy(writeStrategy(id)), [])
  const record = useCallback(entry => {
    if (!entry) return
    pending.current = [...pending.current.filter(e => e.run === entry.run), entry]
    if (!entry.last) return
    const attempts = pending.current
    pending.current = []
    setState(prev => addRun(prev, attempts))
  }, [])
  const start = useCallback(lang => { pending.current = []; setState(prev => startSeries(prev, strategy, lang)) }, [strategy])
  const cancel = useCallback(() => setState(cancelSeries), [])
  const clear = useCallback(() => setState(clearResults), [])

  return useMemo(() => ({ state, strategy, choose, record, start, cancel, clear }), [state, strategy, choose, record, start, cancel, clear])
}
