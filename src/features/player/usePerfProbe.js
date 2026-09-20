import { useEffect, useSyncExternalStore } from 'react'
import { startPerfProbe, subscribePerfSummary, getPerfSummary } from '../../shared/lib/appPerfProbe.js'

// Сводка датчика производительности для строки под штампом версии в уроке
// (PlayerOverlays.jsx). Сам датчик — один на всё приложение
// (shared/lib/appPerfProbe.js, включается из app/AppPerfProbe.jsx); здесь
// только подписка на его сводку и подстраховка запуска, если урок открыт
// раньше, чем оболочка успела его включить. Останавливает — только оболочка.
export function usePerfProbe(enabled) {
  useEffect(() => { if (enabled) startPerfProbe() }, [enabled])
  return useSyncExternalStore(subscribePerfSummary, getPerfSummary)
}
