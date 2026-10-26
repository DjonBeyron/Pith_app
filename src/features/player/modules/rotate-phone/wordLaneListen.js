// Слушатель игры «Повтори за диктором»: Vosk на устройстве, один заход — несколько повторов слова подряд. В отличие от «Сказать фразу» (один итог на попытку) отдаёт
// ПРОДВИЖЕНИЕ по ходу речи: сколько раз слово уже принято (hits) и сколько раз сказано не то (misses) — по ним линия на экране едет вперёд или отшатывается.
// Микрофон открывается внутри start() (getUserMedia; доступ ученик дал заранее), модель берётся из voskRuntime (прогрета при входе в урок). Нет модели — status 'unavailable':
// игра переходит на ручной режим (тап по микрофону = одно произнесённое слово). Уровень голоса (RMS кусков звука) идёт в level — им дышат кольца микрофона.
// Заход кончается сам (все повторы услышаны / пауза / потолок записи); не хватает слов — следующий заход начинается автоматически, счёт копится, пока не выйдет общее время OVERALL_MS.
import { voskRuntime } from '../../../../shared/lib/vosk/voskRuntime.js'
import { startListening } from '../../../../shared/lib/vosk/voskEngine.js'
import { cleanPartial } from '../../../../shared/lib/vosk/voskResult.js'
import { createRmsLevel } from '../../../../shared/lib/vosk/sayVoskLevel.js'
import { sayAudioSessionType } from '../../../../shared/lib/speech/sayAudioSession.js'
import { pLog } from '../../../../shared/lib/debug.js'
import { analyzeHeard, wordGrammar } from './wordLaneMatch.js'
import { SLOT_COUNT } from './wordLaneTimeline.js'

export const OVERALL_MS = 45000      // сколько всего ждём слова, прежде чем предложить «Пропустить»
const PAUSE_STOP_MS = 3500           // слово услышано, а нового давно нет — заход закрываем (дальше новый заход)
const FULL_STOP_MS = 600             // все повторы услышаны — итог быстро
const SESSION_MAX_MS = 20000
const RESTART_MS = 150

/**
 * onChange({ status: 'idle'|'starting'|'listening'|'done'|'unavailable'|'error'|'timeout', hits, misses }) — при каждом изменении.
 * Зависимости подставляются в тестах.
 */
export function createWordListener({ word, onChange, runtime = voskRuntime, listen = startListening, level = createRmsLevel(), now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout }) {
  let hits = 0, misses = 0            // накоплено за все заходы
  let base = { hits: 0, misses: 0 }   // накоплено до текущего захода
  let cur = null
  let startedAt = 0
  let disposed = false
  let status = 'idle'
  let timer = 0

  const publish = patch => {
    if (patch.status) status = patch.status
    if (patch.hits != null) hits = Math.min(SLOT_COUNT, Math.max(hits, patch.hits)) // счёт не откатывается назад: поздний partial мог «передумать»
    if (patch.misses != null) misses = Math.max(misses, patch.misses)
    onChange?.({ status, hits, misses, ...(patch.error ? { error: patch.error } : {}) })
  }
  const remaining = () => Math.max(1, SLOT_COUNT - base.hits)

  function end(session, st) {
    if (disposed || cur !== session) return
    cur = null
    clearTimer(timer)
    if (hits >= SLOT_COUNT) { publish({ status: 'done' }); return }
    if (now() - startedAt >= OVERALL_MS) { publish({ status: 'timeout' }); return }
    if (st === 'error') return
    timer = setTimer(() => { if (!disposed && !cur) run() }, RESTART_MS) // слов не хватило — слушаем дальше, счёт сохранён
  }

  function run() {
    base = { hits, misses } // до словаря: сколько слов ещё ждать, считается от накопленного
    const model = runtime.getModel()
    const grammar = model ? wordGrammar(word, remaining()) : null
    if (!model || !grammar) { publish({ status: 'unavailable' }); return }
    const session = { handle: null, stopped: false }
    cur = session
    const part = (raw, final) => {
      const r = analyzeHeard(raw, word, final)
      publish({ hits: base.hits + r.hits, misses: base.misses + r.misses })
    }
    const callbacks = {
      onReady: () => { if (!disposed && cur === session) publish({ status: 'listening' }) },
      onLevel: rms => { if (cur === session) level.push(rms) },
      onPartial: raw => { if (cur === session) part(raw, false) },
      onResult: (text, stats) => {
        if (cur !== session) return
        part((stats?.words?.length ? stats.words.map(w => w.word).join(' ') : text) || '', true)
        end(session, 'result')
      },
      onError: msg => { pLog(`[word-lane] Vosk: ${msg}`); end(session, 'error'); publish({ status: 'error', error: String(msg) }) },
    }
    publish({ status: 'starting' })
    Promise.resolve()
      .then(() => listen(model, grammar, callbacks, {
        autoStopMs: PAUSE_STOP_MS, completeMs: FULL_STOP_MS, maxMs: SESSION_MAX_MS, session: sayAudioSessionType(), chunk: 2048,
        gate: true, cleanPartial, isComplete: text => analyzeHeard(text, word).hits >= remaining(),
      }))
      .then(h => { if (disposed || cur !== session) { try { h?.cancel() } catch { /* уже свободен */ } return } session.handle = h; if (session.stopped) h.stop() },
        e => { if (cur === session) { pLog(`[word-lane] микрофон не открылся: ${e?.name ?? e}`); cur = null; publish({ status: 'error', error: e?.name || 'mic' }) } })
  }

  return {
    /** Из жеста, если можно: getUserMedia стартует тут же */
    start() { if (disposed || cur) return; if (!startedAt) startedAt = now(); run() },
    /** Остановить заход (Vosk отдаст итог и заход закончится сам) */
    stop() { if (cur) { cur.stopped = true; try { cur.handle?.stop() } catch { /* уже закончил */ } } },
    available: () => !!runtime.getModel(),
    level,
    dispose() {
      disposed = true
      clearTimer(timer)
      const c = cur
      cur = null
      try { c?.handle?.cancel() } catch { /* уже свободен */ }
      level.reset()
    },
  }
}
