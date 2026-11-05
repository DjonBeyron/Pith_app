import { pLog, getPlayerLines } from '../../shared/lib/debug.js'
import { APP_VERSION } from '../../shared/lib/version.js'

// Журнал «Мини-игры 2.0»: строки «[game2] …» идут в общий отладочный журнал приложения (pLog), «Скачать отладку» отдаёт его файлом тем же путём, что у шлифовки (saveDebugFile).
export const log = msg => pLog(`[game2] ${msg}`)

/** Файл отладки стенда: { name, blob } — весь журнал плеера (в нём и [warm], [rotate], [mic], [game2]); строки стенда помечены «[game2]» */
export function game2DebugFile({ now = new Date(), lines = getPlayerLines() } = {}) {
  const name = `pithy-game2-debug-${now.toISOString().replace(/[:.]/g, '-')}.json`
  const json = JSON.stringify({ kind: 'game2-debug', version: APP_VERSION, exportedAt: now.toISOString(), game2: lines.filter(l => l.includes('[game2]')), lines })
  const blob = typeof File === 'function' ? new File([json], name, { type: 'application/json' }) : new Blob([json], { type: 'application/json' })
  return { name, blob, json }
}
