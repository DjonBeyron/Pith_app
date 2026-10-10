import { useState, useEffect, useRef, useCallback } from 'react'
import { readState, writeState, addRun, makeRun, emptyState } from './voskSeries.js'
import { clampAutoStop, NO_SPEECH_MS } from '../../../shared/lib/vosk/voskTiming.js'

// React-обвязка «Теста 3» Vosk: настройки и прогоны (localStorage), запись одного прогона через engine.listen, живая строка partial.
// Микрофон на каждый прогон открывается и закрывается (как в остальных тестах Vosk): поток не держим, чтобы на iPhone не висел оранжевый индикатор
// и аудиосессия страницы не оставалась в режиме записи. Старт записи (getUserMedia) измеряется отдельно («старт записи после «Сказать»»).
// engine = { listen(grammar, cb, opts), setBusy(bool) } (useVoskEngine или подставной).
export function useVoskSeries(engine) {
  const [state, setState] = useState(readState)
  const [live, setLive] = useState(null) // { spec, partial } пока идёт запись
  const [error, setError] = useState('')
  const sess = useRef(null)
  const eng = useRef(engine)
  const cur = useRef(state)
  useEffect(() => { eng.current = engine; cur.current = state })
  useEffect(() => { writeState(state) }, [state])
  useEffect(() => () => sess.current?.cancel?.(), [])

  const patch = useCallback(p => setState(s => ({ ...s, ...p })), [])
  const setAutoStop = useCallback(v => setState(s => ({ ...s, autoStop: clampAutoStop(v) })), [])

  /** Один прогон по спецификации (voskGrammar.ctxSpec / pairSpec, voskTraps.trapSpec / silenceSpec). Вызывать прямо в тапе (getUserMedia) */
  const run = useCallback(async spec => {
    if (sess.current) return
    const e = eng.current
    const s = cur.current // настройки на момент нажатия
    sess.current = { pending: true }
    setError(''); setLive({ spec, partial: '' }); e.setBusy?.(true)
    const fin = () => { sess.current = null; setLive(null); e.setBusy?.(false) }
    try {
      const h = await e.listen(spec.grammar, {
        onPartial: p => setLive(l => (l ? { ...l, partial: p } : l)),
        onResult: (text, stats) => {
          const ses = stats?.session ?? null
          setState(old => addRun(old, makeRun(spec, text, stats, { style: s.style, cond: s.cond, ses })))
          fin()
        },
        onError: msg => { setError(msg); fin() },
      }, { autoStopMs: s.autoStop, maxMs: spec.maxMs ?? NO_SPEECH_MS, session: s.session ? 'play-and-record' : null })
      if (sess.current) sess.current = h
      else h.cancel?.() // результат успел прийти до возврата
    } catch (err) { setError(err?.name === 'NotAllowedError' ? 'Микрофон не разрешён' : (err?.message || String(err))); fin() }
  }, [])

  const stop = useCallback(() => sess.current?.stop?.(), [])
  const clear = useCallback(() => setState(s => ({ ...emptyState(), style: s.style, cond: s.cond, autoStop: s.autoStop, session: s.session, pairs: s.pairs, trapWords: s.trapWords })), [])
  return { state, patch, setAutoStop, run, stop, clear, live, error }
}
