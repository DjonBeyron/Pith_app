import { getPlayerLines } from '../../shared/lib/debug.js'
import { APP_VERSION } from '../../shared/lib/version.js'

// Журнал «Гонки с Питом»: строки «[race] …» пишет директор (useRaceActs) в общий отладочный журнал приложения (pLog), «Скачать отладку» (Админ → «Голос» → «Гонка с Питом (стенд)») отдаёт его файлом тем же путём,
// что у «Мини-игры 2.0» (game2Log.js): весь журнал плеера (в нём и [warm], [rotate], [mic], [word-lane]); строки гонки собраны отдельным полем race.
/** Файл отладки стенда: { name, blob, json } */
export function raceDebugFile({ now = new Date(), lines = getPlayerLines() } = {}) {
  const name = `pithy-race-debug-${now.toISOString().replace(/[:.]/g, '-')}.json`
  const json = JSON.stringify({ kind: 'race-debug', version: APP_VERSION, exportedAt: now.toISOString(), race: lines.filter(l => l.includes('[race]')), lines })
  const blob = typeof File === 'function' ? new File([json], name, { type: 'application/json' }) : new Blob([json], { type: 'application/json' })
  return { name, blob, json }
}
