import { hasWordSlot, wordSlotKey } from './wordLaneClips.js'
import { registerWordBuffer } from './wordLaneBuffers.js'
import { fetchBlob, measureSpeech } from './wordLaneFetch.js'
import { forgetSettled } from './wordLaneSettled.js'
import { lineKey } from './wordLaneCatLines.js'
import { webAudioOn, gameCtxState, unlockGameCtx } from '../../../../shared/lib/gameAudioCtx.js'
import { micTracksLine } from '../../../../shared/lib/gameMic.js'
import { pLog } from '../../../../shared/lib/debug.js'

// «Страховка второго запуска» (v3.3.113, замечание владельца: «игра → выход → свернул → снова игра — Пит немой»): перед ПЕРВОЙ репликой не доверяем реестру прогрева (wordLaneSettled.js: «обработан» ≠ «есть буфер в памяти»:
// отметка могла пережить буфер, а отметка 'fail' от докачки, оборванной сворачиванием, — и вовсе открыть ворота без данных). Если для озвученной реплики нет ни буфера, ни слота — качаем и декодируем её заново прямо сейчас
// (useCatLines ждёт слот до LINE_WAIT_MS), и если контекст Web Audio не 'running' — подталкиваем resume(). Всё уходит в журнал «[cat] …» с причиной.
const NUDGE_EVERY_MS = 400
let nudgedAt = -Infinity

/** Озвученной реплики нет в памяти (Web Audio включён, а ни буфера, ни слота <audio> нет)? */
export const bufferMissing = id => webAudioOn() && !hasWordSlot(lineKey(id))

/** Докачать и декодировать реплику заново (адрес line.url): реестр прогрева «обработан» для неё сбрасывается, чтобы ворота и опрос слота ждали настоящий результат. → промис (не отклоняется) */
export function recoverLine(id, line, { log = pLog } = {}) {
  if (!line?.url) return Promise.resolve(false)
  registerWordBuffer(wordSlotKey(lineKey(id)), line.url)
  forgetSettled([line.url])
  log(`[cat] реплика «${id}»: буфера нет в памяти (реестр прогрева устарел или докачка оборвана) — качаю и декодирую заново`)
  return fetchBlob(line.url).then(blob => measureSpeech(line.url, blob)).then(() => { log(`[cat] реплика «${id}»: докачана, буфер ${hasWordSlot(lineKey(id)) ? 'есть' : 'НЕ появился'}`); return true }, e => { log(`[cat] реплика «${id}»: докачать не вышло (${e?.message ?? e})`); return false })
}

/** Контекст игры не 'running' — подтолкнуть resume() (не чаще раза в NUDGE_EVERY_MS); вне жеста iOS может не пустить, тогда решит gameAudioWarm на касании. → состояние контекста */
export function nudgeCtx({ now = () => performance.now(), log = pLog } = {}) {
  const st = gameCtxState()
  if (st == null || st === 'running' || now() - nudgedAt < NUDGE_EVERY_MS) return st
  nudgedAt = now()
  log(`[audio] состояние ctx=${st} перед репликой (дорожки микрофона ${micTracksLine()}) — подталкиваю resume(); не поднимется — сигнал потери звука поставит паузу (gameAudioSignals.js)`)
  try { unlockGameCtx() } catch { /* контекст сам разберётся */ }
  return st
}
