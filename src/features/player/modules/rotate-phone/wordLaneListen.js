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
import { readMicGain } from '../../../../shared/lib/gameMicGain.js'
import { analyzeTargets, targetGrammar } from './wordLaneMatch.js'
import { SLOT_COUNT } from './wordLaneTimeline.js'

export const OVERALL_MS = 120000     // сколько всего слушаем (конвейер выкатывает пилюли повторно, игра идёт долго), прежде чем перейти на ручной режим
const PAUSE_STOP_MS = 3500           // слово услышано, а нового давно нет — заход закрываем (дальше новый заход)
// Все повторы услышаны — итог НЕ сразу: за эти мс успевают доиграть щелчок, XP и нота третьей пилюли. Раньше было 600 мс — микрофон и аудиосессия закрывались как раз во время третьей
// ноты (на телефоне смена режима захват→воспроизведение приглушала или обрывала её), отсюда «третья нота тише»
export const FULL_STOP_MS = 2200
export const DEAD_MS = 2500       // микрофон отдаёт ТОЧНУЮ тишину (RMS ровно 0 — живой микрофон всегда шумит) дольше — поток заглушён системой, «не слышит»
const SESSION_MAX_MS = 20000
const RESTART_MS = 150
export const FLUSH_MS = 1500      // flush(): сколько ждём итог последнего захода после stop(), потом отдаём что есть
export const MISS_SETTLE_MS = 550 // «чужое слово» из черновика (partial) засчитывается, только если продержалось столько мс: Vosk на ходу переслушивает слова («[unk] trying» → «i'm trying»), и пилюля не должна дёргаться как неверная зря

/**
 * Цели — тексты, которые ученик должен сказать на ступени (targets; одно слово — word). onChange({ status, hits, seq, misses, heard }): seq — номера услышанных целей по порядку (накапливается по заходам
 * и не откатывается), hits = seq.length. expected — сколько всего слов ждём (заход закрывается сам, когда услышаны все). maxWords — сколько слов подряд умещает закрытый словарь одного высказывания
 * (по умолчанию SLOT_COUNT; «Скажи вслух» берёт 2: целей много, а словарь растёт степенью).
 * onChange({ status: 'idle'|'starting'|'listening'|'done'|'unavailable'|'error'|'timeout', hits, misses, heard }) — при каждом изменении; heard — что услышал движок («…» вместо неразобранного слова):
 * по нему игра честно говорит ученику, что именно распозналось. mute(ms) — на это время новые «чужие слова» не засчитываются (нота-награда из динамика могла попасть в микрофон).
 * isHeld() → true, пока игра сама выключила дорожку микрофона на время речи Пита/диктора: тишина в это время не считается «оглохшим» потоком.
 * onDebug(kind, data) — необязательный журнал для «Скачать отладку» (wordLaneDebug): partial / final (с разбором), mute, stop, level, grammar, status, session-end; на игру не влияет.
 * words() — слова Vosk с таймингами за все заходы: [{ word, conf, start, end }], мс на ОДНОЙ шкале — от start() слушателя (заходы перезапускаются, у каждого свой ноль: время слов захода = старт захода + readyMs + секунды Vosk);
 * startedAt() — когда был start() (мс по now()), по нему слова приводят к чужой шкале (запись дубля). В onChange слова не идут: перерисовок они не плодят. gate: false — без «затвора тишины» (voskGate: он вырезает паузы
 * из звука и сжимает тайминги; нужно, когда по словам меряют паузы — дубль репетиции), restartMs — через сколько мс начинать следующий заход (0 — сразу, слова после паузы не теряются).
 * flush(ms) — дубль закончен: просит у Vosk итог текущего захода (stop), ждёт его (не дольше ms) и больше заходов не начинает; после него words() полные. Зависимости подставляются в тестах.
 */
export function createWordListener({ word, targets: targetsIn, expected = SLOT_COUNT, maxWords = SLOT_COUNT, getStream = null, isHeld = () => false, onChange, onDebug = null, gate = true, restartMs = RESTART_MS, runtime = voskRuntime, listen = startListening, micGain = readMicGain, level = createRmsLevel(), now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout }) {
  const targets = targetsIn?.length ? targetsIn : [word]
  let seq = [], misses = 0            // накоплено за все заходы
  let base = { seq: [], misses: 0 }   // накоплено до текущего захода
  let cur = null
  let startedAt = 0
  let disposed = false
  let status = 'idle'
  let timer = 0
  let heard = ''
  let tail = null     // недосказанная цель текущей речи { target, tokens }
  let heardAt = 0     // когда последний раз услышали хоть что-то (даже [unk]): речь реально идёт
  let mutedUntil = 0  // до этого момента новые промахи поглощаются
  let absorbed = 0    // сколько промахов уже поглощено в текущем заходе
  let lastRaw = 0
  let zeroSince = 0   // с какого момента микрофон отдаёт точный ноль
  let missTimer = 0   // ожидание «устоялся ли промах» в черновике
  let lastPartial = null // текст прошлого черновика: Vosk шлёт partial после КАЖДОГО куска звука (≈ 20 раз в секунду), а текст меняется редко
  const timed = []    // слова с таймингами за все заходы (мс от start())
  const waiters = new Set() // flush(): ждут конца текущего захода
  let closing = false // flush() вызван: новых заходов нет

  const publish = patch => {
    if (patch.status) { status = patch.status; onDebug?.('status', { status, ...(patch.error ? { error: String(patch.error) } : {}) }) }
    if (patch.seq && patch.seq.length >= seq.length) seq = patch.seq // счёт не откатывается назад: поздний partial мог «передумать»
    if (patch.misses != null) misses = Math.max(misses, patch.misses)
    if (patch.heard != null) heard = patch.heard
    if (patch.tail !== undefined) tail = patch.tail
    if (patch.heardAt) heardAt = patch.heardAt
    onChange?.({ status, hits: seq.length, seq, misses, heard, tail, heardAt, ...(patch.error ? { error: patch.error } : {}) })
  }
  const remaining = () => Math.max(1, expected - base.seq.length) // сколько слов ещё ждём (заход закрывается, когда услышаны все); что делать дальше, решает конвейер (wordLaneStudent)

  function end(session, st) {
    if (disposed || cur !== session) return
    cur = null
    onDebug?.('session-end', { by: st })
    clearTimer(timer); clearTimer(missTimer)
    waiters.forEach(w => w())
    if (closing) return
    if (now() - startedAt >= OVERALL_MS) { publish({ status: 'timeout' }); return }
    if (st === 'error') return
    timer = setTimer(() => { if (!disposed && !cur) run() }, restartMs) // слов не хватило — слушаем дальше, счёт сохранён
  }

  /** Слова захода (секунды Vosk от первого звука захода) → общая шкала: старт захода + readyMs (от вызова listen до первого звука; нет его — micMs + audioStartMs) */
  function addWords(stats, sessionAt) {
    const k = stats?.readyMs != null && Number(stats.readyMs) >= 0 ? Number(stats.readyMs) : (Number(stats?.micMs) || 0) + (Number(stats?.audioStartMs) || 0)
    for (const w of stats?.words ?? []) {
      const a = Number(w?.start), b = Number(w?.end)
      if (Number.isFinite(a) && Number.isFinite(b)) timed.push({ word: String(w.word ?? ''), conf: w.conf, start: Math.round(sessionAt + k + a * 1000), end: Math.round(sessionAt + k + b * 1000) })
    }
  }

  function run() {
    base = { seq, misses } // до словаря: сколько слов ещё ждать, считается от накопленного
    absorbed = 0; lastRaw = base.misses; lastPartial = null
    const model = runtime.getModel()
    const grammar = model ? targetGrammar(targets, maxWords) : null
    if (!model || !grammar) { publish({ status: 'unavailable' }); return }
    onDebug?.('grammar', { targets, grammar })
    const session = { handle: null, stopped: false }
    const sessionAt = now() - startedAt // старт захода на общей шкале слов
    cur = session
    const part = (raw, final, stats = null) => {
      const r = analyzeTargets(raw, targets, final)
      const rawMisses = base.misses + r.misses
      if (now() < mutedUntil) absorbed += Math.max(0, rawMisses - lastRaw) // «чужое слово» во время ноты-награды — это эхо динамика, не ошибка ученика
      lastRaw = rawMisses
      const words = String(raw ?? '').toLowerCase().split(/\s+/).filter(Boolean).map(w => (w === '[unk]' ? '…' : w)).join(' ') // «…» — звук был, а слова не разобрали
      const count = rawMisses - absorbed
      clearTimer(missTimer)
      // Итог (final) — промах настоящий сразу; в черновике он должен устояться: следующий partial может переслушать слово, и тогда промаха не было
      const settled = final || count <= misses
      onDebug?.(final ? 'final' : 'partial', { raw, seq: r.seq, misses: r.misses, count, settled, tail: r.tail, muted: now() < mutedUntil, absorbed, ...(stats ? { stopBy: stats.stopBy, gatedMs: stats.gatedMs, maxGapMs: stats.maxGapMs, lateChunks: stats.lateChunks } : {}) })
      publish({ seq: base.seq.concat(r.seq), ...(settled ? { misses: count } : {}), heard: words || heard, tail: r.tail, heardAt: words ? now() : 0 })
      if (!settled) missTimer = setTimer(() => { if (!disposed && cur === session) publish({ misses: count }) }, MISS_SETTLE_MS)
    }
    const callbacks = {
      onReady: () => { if (!disposed && cur === session) publish({ status: 'listening' }) },
      onLevel: rms => {
        if (cur !== session) return
        onDebug?.('level', rms)
        level.push(rms)
        if (rms > 0 || isHeld()) { zeroSince = 0; return } // дорожку глушит сама игра на время речи Пита/диктора (gameMicHold) — ровная тишина не значит «оглох»
        zeroSince ||= now()
        if (now() - zeroSince >= DEAD_MS && status !== 'dead') { zeroSince = 0; publish({ status: 'dead' }) } // оглох: игра переоткроет микрофон
      },
      onPartial: raw => {
        if (cur !== session) return
        if (raw === lastPartial) { if (String(raw ?? '').trim()) heardAt = now(); return } // тот же текст: разбор, publish и setS в игре дали бы то же самое — пропускаем; «слышал» отмечаем (см. heardAt() ниже)
        lastPartial = raw
        part(raw, false)
      },
      onResult: (text, stats) => {
        if (cur !== session) return
        addWords(stats, sessionAt)
        part((stats?.words?.length ? stats.words.map(w => w.word).join(' ') : text) || '', true, stats)
        end(session, 'result')
      },
      onError: msg => { pLog(`[word-lane] Vosk: ${msg}`); end(session, 'error'); publish({ status: 'error', error: String(msg) }) },
    }
    publish({ status: 'starting' })
    Promise.resolve()
      .then(() => listen(model, grammar, callbacks, {
        autoStopMs: PAUSE_STOP_MS, completeMs: FULL_STOP_MS, maxMs: SESSION_MAX_MS, session: sayAudioSessionType(), chunk: 2048, stream: getStream?.() ?? undefined, gain: micGain(), // gain: «Чувствительность микрофона» HUD (gameMicGain.js) — усиление перед Vosk; уровень для колец считается уже по усиленному звуку
        // готовый поток игры (iPhone) — без нового диалога; куски по 2048 кадров (≈ 46 мс при 44,1 кГц, 43 мс при 48 кГц): громкость для пилюль приходит ≈ 22 раза в секунду, а главный поток получает вдвое меньше вызовов (1024 кадров — 23 мс — на слабом телефоне съедали заметную долю кадра);
        gate, cleanPartial, isComplete: text => analyzeTargets(text, targets).seq.length >= remaining(),
      }))
      .then(h => { if (disposed || cur !== session) { try { h?.cancel() } catch { /* уже свободен */ } return } session.handle = h; if (session.stopped) h.stop() },
        e => { if (cur === session) { pLog(`[word-lane] микрофон не открылся: ${e?.name ?? e}`); cur = null; publish({ status: 'error', error: e?.name || 'mic' }) } })
  }

  function stop() { onDebug?.('stop', {}); if (cur) { cur.stopped = true; try { cur.handle?.stop() } catch { /* уже закончил */ } } }

  return {
    /** Из жеста, если можно: getUserMedia стартует тут же */
    start() { if (disposed || cur) return; if (!startedAt) startedAt = now(); run() },
    /** Остановить заход (Vosk отдаст итог и заход закончится сам) */
    stop,
    /** Слова с таймингами (мс от start(), все заходы) и момент start() (мс по now()): см. описание выше */
    words: () => timed.slice(),
    startedAt: () => startedAt,
    /** Дубль закончен: итог текущего захода (stop) и конец слушания; промис готов, когда итог пришёл, заход закончился или вышло ms */
    flush(ms = FLUSH_MS) {
      closing = true; clearTimer(timer) // между заходами: отложенный следующий заход не начнётся
      if (disposed || !cur) return Promise.resolve()
      return new Promise(resolve => {
        const done = () => { clearTimer(t); waiters.delete(done); resolve() }
        const t = setTimer(done, ms)
        waiters.add(done)
        stop()
      })
    },
    available: () => !!runtime.getModel(),
    /** Когда распознаватель последний раз что-то слышал (включая повторные черновики с тем же текстом, которые onChange уже не получает) */
    heardAt: () => heardAt,
    /** На ms мс новые «чужие слова» не засчитываются (звучит нота-награда) */
    mute(ms) { mutedUntil = now() + ms; onDebug?.('mute', { ms }) },
    /** «Тап вместо речи» (HUD, проверка механики): цель target считается сказанной — тем же путём, что итог Vosk (seq → onChange → движок пилюль). Заход продолжает слушать, счёт захода — от нового seq */
    tap(target) {
      if (disposed || target == null || target < 0 || target >= targets.length) return
      seq = seq.concat(target); base = { seq, misses }; lastPartial = null
      const at = now() - startedAt; timed.push({ word: targets[target], conf: 1, start: at, end: at + 250, tap: true }) // тап вместо речи: слово цели «сказано сейчас» (без Vosk зеркалу не из чего считать)
      onDebug?.('tap', { target, text: targets[target], seq })
      publish({ seq, heard: targets[target], tail: null, heardAt: now() })
    },
    level,
    dispose() {
      disposed = true
      clearTimer(timer); clearTimer(missTimer)
      waiters.forEach(w => w())
      const c = cur
      cur = null
      try { c?.handle?.cancel() } catch { /* уже свободен */ }
      level.reset()
    },
  }
}
