import { useMemo } from 'react'
import { readVersionInfo, versionLine } from '../../shared/lib/versionInfo.js'

// Мелкая серая строка версии в админке: «3.2.1905 · 09.10.2026 20:15» (версия и дата/время сборки, локальная таймзона).
// Класс: avVersion (шапка) или astVersion (блок «Старт»)
export default function VersionStamp({ className = 'avVersion' }) {
  const line = useMemo(() => versionLine(readVersionInfo()), [])
  return <div className={className} data-testid="version-stamp">{line}</div>
}
