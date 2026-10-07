import { useCallback } from 'react'
import { useNodeAppearLog } from './useNodeAppearLog.js'
import { downloadDebugLog, copyDebugLog } from './downloadDebugLog.js'

// Кнопки «⬇ лог» / «копировать лог» в шапке урока: общий дебаг-лог плеера из
// журнала появления нод (useNodeAppearLog.js), реестра загрузок прогрева
// (debugItems) и событий анализа ответов (getEvents). Вынесено из
// LessonPlayer.jsx (тот у потолка 400 строк) — к проигрыванию урока не относится
export function usePlayerDebugLog({ visibleNodes, blobMap, addMsgTs, openTimeRef, debugItems, getEvents }) {
  const nodeAppearLogRef = useNodeAppearLog(visibleNodes, blobMap, addMsgTs, openTimeRef)
  const combinedLogData = useCallback(
    () => ({ nodeAppearLog: nodeAppearLogRef.current, debugItems, events: getEvents() }),
    [nodeAppearLogRef, debugItems, getEvents],
  )
  const downloadCombinedLog = useCallback(() => downloadDebugLog(combinedLogData()), [combinedLogData])
  const copyCombinedLog     = useCallback(() => copyDebugLog(combinedLogData()), [combinedLogData])
  return { downloadCombinedLog, copyCombinedLog }
}
