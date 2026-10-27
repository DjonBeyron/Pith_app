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
import { analyzeTargets, targetGrammar } from './wordLaneMatch.js'
import { SLOT_COUNT } from './wordLaneTimeline.js'

export const OVERALL_MS = 120000     // сколько всего слушаем (конвейер выкатывает пилюли повторно, игра идёт долго), прежде чем перейти на ручной режим
const PAUSE_STOP_MS = 3500           // слово услышано, а нового давно нет — заход закрываем (дальше новый заход)
// Все повторы услышаны — итог НЕ сразу: за эти мс успевают доиграть щелчок, XP и нота третьей пилюли. Раньше было 600 мс — микрофон и аудиосессия закрывались как раз во время третьей
// ноты (на телефоне смена режима захват→воспроизведение приглушала или обрывала её), отсюда «третья нота тише»
export const FULL_STOP_MS = 2200
const SESSION_MAX_MS = 20000
const RESTART_MS = 150

/**
 * Цели — тексты, которые ученик должен сказать на ступени (targets; одно слово — word). onChange({ status, hits, seq, misses, heard }): seq — номера услышанных целей по порядку (накапливается по заходам
 * и не откатывается), hits = seq.length. expected — сколько всего слов ждём (заход закрывается сам, когда услышаны все).
 * onChange({ status: 'idle'|'starting'|'listening'|'done'|'unavailable'|'error'|'timeout', hits, misses, heard }) — при каждом изменении; heard — что услышал движок («…» вместо неразобранного слова):
 * по нему игра честно говорит ученику, что именно распозналось. mute(ms) — на это время новые «чужие слова» не засчитываются (нота-награда из динамика могла попасть в микрофон).
 * Зависимости подставляются в тестах.
 */
export function createWordListener({ word, targets: targetsIn, expected = SLOT_COUNT, getStream = null, onChange, runtime = voskRuntime, listen = startListening, level = createRmsLevel(), now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout }) {
  const targets = targetsIn?.length ? targetsIn : [word]
  let seq = [], misses = 0            // накоплено за все заходы
  let base = { seq: [], misses: 0 }   // накоплено до текущего захода
  let cur = null
  let startedAt = 0
  let disposed = false
  let status = 'idle'
  let timer = 0
  let heard = ''
  let mutedUntil = 0  // до этого момента новые промахи поглощаются
  let absorbed = 0    // сколько промахов уже поглощено в текущем заходе
  let lastRaw = 0

  const publish = patch => {
    if (patch.status) status = patch.status
    if (patch.seq && patch.seq.length >= seq.length) seq = patch.seq // счёт не откатывается назад: поздний partial мог «передумать»
    if (patch.misses != null) misses = Math.max(misses, patch.misses)
    if (patch.heard != null) heard = patch.heard
    onChange?.({ status, hits: seq.length, seq, misses, heard, ...(patch.error ? { error: patch.error } : {}) })
  }
  const remaining = () => Math.max(1, expected - base.seq.length) // сколько слов ещё ждём (заход закрывается, когда услышаны все); что делать дальше, решает конвейер (wordLaneStudent)

  function end(session, st) {
    if (disposed || cur !== session) return
    cur = null
    clearTimer(timer)
    if (now() - startedAt >= OVERALL_MS) { publish({ status: 'timeout' }); return }
    if (st === 'error') return
    timer = setTimer(() => { if (!disposed && !cur) run() }, RESTART_MS) // слов не хватило — слушаем дальше, счёт сохранён
  }

  function run() {
    base = { seq, misses } // до словаря: сколько слов ещё ждать, считается от накопленного
    absorbed = 0; lastRaw = base.misses
    const model = runtime.getModel()
    const grammar = model ? targetGrammar(targets, SLOT_COUNT) : null
    if (!model || !grammar) { publish({ status: 'unavailable' }); return }
    const session = { handle: null, stopped: false }
    cur = session
    const part = (raw, final) => {
      const r = analyzeTargets(raw, targets, final)
      const rawMisses = base.misses + r.misses
      if (now() < mutedUntil) absorbed += Math.max(0, rawMisses - lastRaw) // «чужое слово» во время ноты-награды — это эхо динамика, не ошибка ученика
      lastRaw = rawMisses
      const words = String(raw ?? '').toLowerCase().split(/\s+/).filter(Boolean).map(w => (w === '[unk]' ? '…' : w)).join(' ') // «…» — звук был, а слова не разобрали
      publish({ seq: base.seq.concat(r.seq), misses: rawMisses - absorbed, heard: words || heard })
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
        autoStopMs: PAUSE_STOP_MS, completeMs: FULL_STOP_MS, maxMs: SESSION_MAX_MS, session: sayAudioSessionType(), chunk: 1024, stream: getStream?.() ?? undefined, // готовый поток игры (iPhone) — без нового диалога; мелкие куски (64 мс): громкость для пилюль приходит в 4 раза чаще, ответ быстрее;
        gate: true, cleanPartial, isComplete: text => analyzeTargets(text, targets).seq.length >= remaining(),
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
    /** На ms мс новые «чужие слова» не засчитываются (звучит нота-награда) */
    mute(ms) { mutedUntil = now() + ms },
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
