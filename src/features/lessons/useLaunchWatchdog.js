import { useEffect, useRef, useState } from 'react'

// Сторож карточки запуска: если кнопка «Начать/Продолжить» не открывается слишком долго, в debug-лог пишется ПОЛНЫЙ снимок
// «что именно не готово» (раньше лог молчал и причину нельзя было узнать), а ещё позже кнопка открывается принудительно:
// лучше открыть урок с недогретой нодой (она догрузится в чате), чем навсегда оставить ученика на «Загрузка…».
// active — карточка видна, идёт прогрев и кнопка ещё закрыта; snapshot() — читаемое состояние всех условий готовности.
export const WATCHDOG_WARN_MS = 8000
export const WATCHDOG_FORCE_MS = 15000

/** Ставит два таймера (снимок в лог и принудительное открытие); возвращает функцию отмены. Вынесено из хука, чтобы тестировать без React */
export function startWatchdog({ snapshot, mark, onForce, warnMs = WATCHDOG_WARN_MS, forceMs = WATCHDOG_FORCE_MS }) {
  const text = () => { try { return JSON.stringify(snapshot()) } catch (e) { return `снимок не собрался: ${e?.message}` } }
  const warn = setTimeout(() => mark(`кнопка не открывается ${warnMs / 1000} с, не готово: ${text()}`), warnMs)
  const force = setTimeout(() => { mark(`принудительно открываем кнопку (${forceMs / 1000} с), не готово: ${text()}`); onForce() }, forceMs)
  return () => { clearTimeout(warn); clearTimeout(force) }
}

export default function useLaunchWatchdog({ active, snapshot, mark, warnMs, forceMs }) {
  const [forced, setForced] = useState(false)
  const ref = useRef({ snapshot, mark })
  useEffect(() => { ref.current = { snapshot, mark } })
  useEffect(() => {
    if (!active) return undefined
    return startWatchdog({ snapshot: () => ref.current.snapshot(), mark: t => ref.current.mark(t), onForce: () => setForced(true), warnMs, forceMs })
  }, [active, warnMs, forceMs])
  return forced
}
