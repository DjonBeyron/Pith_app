import { useCallback, useEffect, useRef } from 'react'

/**
 * Накопление правок поля с задержкой: поле держит свой локальный текст (набор без лагов), а в копию урока разбора правки уходят пачкой через delay мс
 * (одной функцией-композицией). reg — реестр сброса окна замечания: { fns: Set, discard }: окно может сбросить все поля разом (flushAll) или
 * отменить несохранённое (discard — при закрытии без сохранения не досылать).
 */
export function useDebouncedPatch(onPatch, reg, delay = 300) {
  const timer = useRef(null)
  const pending = useRef([])
  const patchRef = useRef(onPatch)
  useEffect(() => { patchRef.current = onPatch })
  const flush = useCallback(() => {
    clearTimeout(timer.current)
    const list = pending.current
    pending.current = []
    if (list.length) patchRef.current(d => list.reduce((acc, fn) => fn(acc), d))
  }, [])
  useEffect(() => {
    reg?.fns.add(flush)
    return () => { reg?.fns.delete(flush); if (!reg?.discard) flush(); else { clearTimeout(timer.current); pending.current = [] } }
  }, [reg, flush])
  return updater => {
    pending.current.push(updater)
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, delay)
  }
}
