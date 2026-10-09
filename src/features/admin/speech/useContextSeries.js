import { useState, useEffect, useCallback, useMemo } from 'react'
import { readState, writeState, recordEntry, replaceWord, clearLang, wrongPhrase } from './contextSeries.js'

// React-обвязка серии «влияет ли длина контекста»: настройки и результаты (localStorage), выбранный шаг, запись результата
// каждой новой попытки из журнала. record стабилен (его зовёт onLogged контроллера, созданного один раз).
export function useContextSeries() {
  const [state, setState] = useState(readState)
  const [step, setStep] = useState(null) // выбранный шаг 0…3 (кнопка «Шаг N»); null — серия не активна

  useEffect(() => { writeState(state) }, [state])

  const record = useCallback(entry => setState(prev => recordEntry(prev, entry)), [])
  const setRef = useCallback((i, text) => setState(s => ({ ...s, cfg: { ...s.cfg, refs: s.cfg.refs.map((r, k) => (k === i ? text : r)) } })), [])
  const setWord = useCallback((word, wrong) => setState(s => ({ ...s, cfg: replaceWord(s.cfg, word, wrong) })), [])
  const clear = useCallback(lang => setState(s => clearLang(s, lang)), [])

  /** Сведения об активном шаге, пока эталон в поле совпадает с эталоном шага (иначе серия не активна) — идут в снимок режимов при тапе */
  const activeFor = useCallback(reference => {
    if (step == null || reference !== state.cfg.refs[step]) return null
    const ph = wrongPhrase(reference, state.cfg.word, state.cfg.wrong)
    return ph ? { step, word: state.cfg.word, wrong: state.cfg.wrong, wrongPhrase: ph } : null
  }, [step, state.cfg])

  return useMemo(() => ({ state, step, setStep, record, setRef, setWord, clear, activeFor }), [state, step, record, setRef, setWord, clear, activeFor])
}
