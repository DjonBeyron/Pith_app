import { log } from './game2Log.js'
import { readMicGainId, readMicGain } from '../../shared/lib/gameMicGain.js'
import { readMicHoldMode, readAudioSessionMode } from '../../shared/lib/gameAudioSettings.js'
import { peekGameMic } from '../../shared/lib/gameMic.js'
import { gameMicHold } from '../../shared/lib/gameMicHold.js'

// Журнал микрофона «Мини-игры 2.0» («Скачать отладку» → строки «[game2] mic …»): по ним видно, открыт ли микрофон, не осталась ли дорожка выключенной после реплики Пита, какое усиление и какой словарь
// получил Vosk, что слышал распознаватель (черновики и итоги), какой был уровень звука (пик и средний за секунду: ровный 0 — дорожка глухая, пик есть, а слов нет — Vosk не разобрал).
const LEVEL_EVERY_MS = 1000

const trackNow = () => {
  try {
    const s = peekGameMic()
    const t = s?.getAudioTracks?.()[0]
    return t ? `enabled=${t.enabled} muted=${!!t.muted} readyState=${t.readyState}` : 'потока нет'
  } catch { return 'поток не читается' }
}

/** «mic <метка>: усиление ×2 (high), удержание дорожки …, дорожка enabled=… muted=… readyState=…, окно речи Пита открыто?» — состояние микрофона в этот момент */
export function micState(label, write = log) {
  write(`mic ${label}: усиление ×${readMicGain()} (${readMicGainId()}), удержание «${readMicHoldMode()}», сессия «${readAudioSessionMode()}», дорожка ${trackNow()}, окно речи Пита ${gameMicHold.active() ? 'ОТКРЫТО (дорожка выключена)' : 'закрыто'}`)
}

const phrasesIn = grammar => { try { return JSON.parse(grammar).length } catch { return '?' } }

/** onDebug для createWordListener: строки журнала с меткой режима. now — часы (тесты подставляют) */
export function createMicDebug({ modeId, words, write = log, now = () => performance.now() }) {
  let lvl = { max: 0, sum: 0, n: 0, at: null }
  const flush = () => {
    if (!lvl.n) return
    write(`mic ${modeId}: уровень за секунду — пик ${lvl.max.toFixed(3)}, средний ${(lvl.sum / lvl.n).toFixed(3)}, кусков ${lvl.n}${lvl.max === 0 ? ' (РОВНЫЙ НОЛЬ: дорожка глухая)' : ''}`)
    lvl = { max: 0, sum: 0, n: 0, at: null }
  }
  return (kind, d) => {
    if (kind === 'level') {
      const v = Number(d) || 0
      lvl.at ??= now()
      lvl.max = Math.max(lvl.max, v); lvl.sum += v; lvl.n += 1
      if (now() - lvl.at >= LEVEL_EVERY_MS) flush()
    } else if (kind === 'grammar') write(`mic ${modeId}: словарь Vosk — ${phrasesIn(d?.grammar)} фраз, цели: ${(d?.targets ?? words).join(' | ')}`)
    else if (kind === 'partial' || kind === 'final') write(`mic ${modeId}: ${kind === 'final' ? 'ИТОГ' : 'черновик'} «${d?.raw ?? ''}» → цели ${JSON.stringify(d?.seq ?? [])}, промахов ${d?.misses ?? 0}`)
    else if (kind === 'status') write(`mic ${modeId}: статус ${d?.status}${d?.error ? ` (${d.error})` : ''}`)
    else if (kind === 'session-end') { flush(); write(`mic ${modeId}: заход закончен (${d?.by}), ${trackNow()}`) }
    else write(`mic ${modeId}: ${kind} ${JSON.stringify(d ?? {})}`)
  }
}
