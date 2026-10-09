import { useMemo } from 'react'
import { readVersionInfo, versionLine } from '../../shared/lib/versionInfo.js'

// Мелкая серая строка версии в админке: «Версия 3.2.1904 · собрана 09.10.2026 20:15 · на этом устройстве с 09.10.2026 20:31 (было 3.2.1903)».
// Момент первого запуска версии на устройстве пишет noteVersionSeen() при старте приложения (main.jsx). Класс: avVersion (шапка) или astVersion (блок «Старт»)
export default function VersionStamp({ className = 'avVersion' }) {
  const line = useMemo(() => versionLine(readVersionInfo()), [])
  return <div className={className} data-testid="version-stamp">{line}</div>
}
