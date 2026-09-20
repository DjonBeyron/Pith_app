import { useEffect } from 'react'
import { useShowDebugUi } from '../features/player/useShowDebugUi.js'
import { startPerfProbe, stopPerfProbe } from '../shared/lib/appPerfProbe.js'

// Включатель датчика производительности на всё приложение: живёт вместе с
// диагностическим набором (админ или флаг «лог и версия в шапке для всех»).
// Ничего не рисует — строки идут в pLog, читаются через панель DBG ленты
// (feed/DebugPanel.jsx) и «⬇ лог» урока (player/downloadDebugLog.js).
export default function AppPerfProbe() {
  const on = useShowDebugUi()
  useEffect(() => {
    if (on) startPerfProbe()
    else stopPerfProbe()
  }, [on])
  return null
}
