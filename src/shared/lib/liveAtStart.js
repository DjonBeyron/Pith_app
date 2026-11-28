// Одна строка «что живо на странице» для журнала — пишется в момент тапа «Начать» игры (raceStartChron.js). Владелец (Android A50, v3.3.394): «бывает игра лагает, бывает нет — может,
// что-то забивает оперативку или висят процессы?». По строкам из разных запусков видно, остаётся ли что-то от прошлой игры: лишний AudioContext, поток микрофона, видео, холсты, модель Vosk, рост кучи.
// Только чтение: ничего не создаёт и не трогает. Каждая часть в своём try — сбой одной не прячет остальные.
import { describe, liveContexts } from './audioContextRegistry.js'
import { micTracksLine } from './gameMic.js'
import { voskRuntime } from './vosk/voskRuntime.js'
import { voskRuntimeRu } from './vosk/voskRuntimes.js'

const safe = (fn, dflt = '—') => { try { return fn() } catch { return dflt } }
const model = rt => safe(() => { const s = rt.snapshot(); return s.loaded ? 'в памяти' : s.loading ? 'грузится' : 'нет' })

/** → «[live] при <when>: AudioContext N (…), микрофон …, видео N (играет M), холстов N, оверлеев игры N, DOM N, куча N МБ, Vosk en …/ru …» */
export function liveAtStartLine(when = 'старте') {
  const ctxs = safe(() => liveContexts().length, '?')
  const videos = safe(() => { const v = [...document.querySelectorAll('video')]; return `${v.length} (играет ${v.filter(x => !x.paused).length})` })
  const canvases = safe(() => document.querySelectorAll('canvas').length)
  const dom = safe(() => document.getElementsByTagName('*').length)
  const heap = safe(() => { const m = performance.memory?.usedJSHeapSize; return m ? `${Math.round(m / 1048576)} МБ` : 'нет данных' })
  const overlays = safe(() => document.querySelectorAll('.wl').length, '?') // оверлеев игры в DOM: больше 1 — прошлая не размонтирована
  return `[live] при ${when}: AudioContext ${ctxs} (${safe(() => describe())}), микрофон: ${safe(() => micTracksLine())}, видео ${videos}, холстов ${canvases}, оверлеев игры ${overlays}, DOM ${dom}, куча ${heap}, Vosk en ${model(voskRuntime)} / ru ${model(voskRuntimeRu)}`
}
