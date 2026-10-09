// Контроллер попыток распознавания речи (общий для пробы «Голос» в админке и модуля «Сказать фразу»; чистый JS,
// без React и без window — всё передаётся снаружи).
// Одно нажатие «Сказать» = «заход» (run) с зафиксированными эталоном и языком; внутри — до MAX_ATTEMPTS попыток.
// Каждая попытка = НОВЫЙ экземпляр recognition (если стратегия перезапуска не S2/S5) + свой attemptId; события чужого/закрытого экземпляра игнорируются.
// Следующий экземпляр не создаётся, пока прошлый не закрыт событием end и не прошла пауза стратегии (speechRestart.js); «глухая» вторая попытка
// после успешной пересоздаётся один раз (speechDeaf.js, метка deaf_retry в журнале).
import {
  LISTEN_SILENCE_MS, PERMISSION_GUARD_MS, STOP_FORCE_MS, SEGMENT_SILENCE_MS, DEAF_WINDOW_MS,
  planNext, NOTICE_WAIT_PERMISSION, NOTICE_PREPARE, toPercent,
} from './speechPolicy.js'
import { pushHistory, readSegments, segmentsText, segmentsConfidence, readResults } from './speechSegments.js'
import { emptyView, isBusy } from './speechView.js'
import { createRestartGate, resolveStrategy } from './speechRestart.js'
import { isDeaf, wantsDeafTimer } from './speechDeaf.js'
import { buildEntry, newAttempt } from './speechEntry.js'

export { emptyView, isBusy }

const ABORT_SETTLE_MS = 250 // после abort() ждём end не дольше этого: результат у нас уже есть

const HANDLERS = ['onstart', 'onaudiostart', 'onsoundstart', 'onsoundend', 'onspeechstart', 'onspeechend', 'onaudioend', 'onresult', 'onerror', 'onend']

export function createSpeechController({
  createRecognition, queryPerm = async () => 'unavailable', getMode = () => 'browser',
  // Хуки режимов захвата B/C (только проба «Голос»): capture — менеджер параллельного потока (speechCaptureManager.js), getCapture — режим на момент
  // тапа, logFields(mode, info, ctx) — доп. поля записи журнала. Модуль «Сказать фразу» их не передаёт: ничего параллельно с распознаванием не открывается
  capture = null, getCapture = () => 'plain', logFields = () => ({}),
  now = () => Date.now(), perfNow = () => Date.now(), onView = () => {}, onEntry = () => {},
  // onSignal(kind) — события движка для синтетического уровня эквалайзера модуля (sayVoiceLevel.js): 'audiostart' | 'soundstart' | 'speechstart' |
  // 'interim' | 'final' | 'speechend' | 'soundend' | 'end' (getUserMedia рядом с SpeechRecognition на iPhone ломает распознавание — реальный звук не берём).
  // endOnFinal — чем гасить движок после финала: 'stop' (проба) или 'abort' (модуль: abort() не доигрывает системный хвост)
  onSignal = () => {}, endOnFinal = 'stop',
  // Только проба «Голос» (antiPredict*): maxAlternatives — число гипотез; configure(rec, {id, retry, reference, lang, extra}) — перед каждым start(), в try/catch
  // (lang/continuous/phrases/grammars…), вернуть можно описание применённого (view.applied); extra — из start({extra}). rec.continuous = true → итог из
  // сегментов, конец через segmentSilenceMs тишины или «Стоп»
  maxAlternatives = 3, configure = null, segmentSilenceMs = SEGMENT_SILENCE_MS,
  // Стратегия перезапуска на момент тапа: id 'S1'…'S5' / 'M' или объект (speechRestart.js). По умолчанию S1 — как раньше (без ожидания end и пауз)
  getRestart = () => 'S1',
}) {
  let seq = 0     // счётчик attemptId (на каждый экземпляр recognition)
  let runNo = 0   // номер нажатия «Сказать»
  let cur = null  // текущая попытка (всё, что не cur, — чужое и игнорируется)
  let run = null  // текущий заход: { no, reference, lang, retryTimer, lastError, strat, deafTried }
  let view = emptyView
  let prevOk = false     // прошлая попытка дала результат: условие авто-восстановления «глухой» сессии
  let lastCloseAt = null // когда закрыли прошлый экземпляр (в журнал: gapMs — сколько прошло до нового запуска)
  const pool = { rec: null } // экземпляр, который переиспользуют стратегии S2/S5

  const push = patch => { view = { ...view, ...patch }; onView(view) }
  const gate = createRestartGate({ onChange: cooling => push({ cooling }), getStrategy: () => resolveStrategy(getRestart()) })

  function teardown(a) {
    if (!a) return
    clearTimeout(a.permTimer); clearTimeout(a.silenceTimer); clearTimeout(a.forceTimer); clearTimeout(a.segTimer); clearTimeout(a.deafTimer)
    if (a.rec) {
      for (const h of HANDLERS) a.rec[h] = null
      if (!(a.strat.waitEnd && a.ended)) { try { if (a.strat.stop) a.rec.stop(); else a.rec.abort() } catch { /* уже остановлен */ } }
      gate.close(a.rec, a.ended) // следующий запуск — после end этого экземпляра и паузы стратегии
    }
    lastCloseAt = perfNow()
    closeCapture(a)
    if (cur === a) cur = null
  }

  // Поток микрофона режимов B/C привязан к попытке: закрываем вместе с ней (повторный вызов безопасен)
  function closeCapture(a) {
    if (!capture || a.capClosed) return
    a.capClosed = true
    try { a.capInfo = capture.close(a.id) } catch { /* поток уже закрыт */ }
  }

  function record(a, error, last, outcome) {
    const entry = buildEntry(a, {
      error, last, outcome, runNo: run?.no ?? null, mode: getMode(), conf: toPercent(view.final?.confidence),
      extra: logFields(a.capMode, a.capInfo, { view, extra: run?.extra }),
    })
    Promise.resolve().then(queryPerm).catch(() => 'unavailable').then(p => { entry.permAfter = p; onEntry(entry) })
  }

  // Единственная точка завершения попытки: ошибка, end, наш таймер, принудительное закрытие
  function conclude(a, code) {
    if (cur !== a || a.done) return
    a.done = true
    const stopped = a.userStop && (code == null || code === 'aborted' || code === 'no-speech')
    let outcome = 'error'
    let error = code ?? 'no-speech' // end без результата и без ошибки — для нас то же, что no-speech
    const partial = a.continuous ? a.segText : a.lastInterim
    if (a.gotFinal) { outcome = 'ok'; error = null } else if (partial && (code == null || stopped)) {
      // iOS иногда заканчивает без финала: берём последний промежуточный текст
      const alt = { text: partial.trim(), confidence: a.continuous ? segmentsConfidence(a.segs) : null }
      push({ interim: '', lastInterim: a.lastInterim, final: alt, alternatives: [alt], usedInterim: !a.continuous || !a.segs.some(x => x.isFinal), history: a.history })
      outcome = 'ok'; error = null
    } else if (stopped) { outcome = 'stopped'; error = null }
    const heard = a.msSound != null || a.msResult != null
    a.deaf = outcome !== 'ok' && (code === 'deaf' || isDeaf({ msAudio: a.msAudio, heard, listenedMs: a.msAudio == null ? 0 : Math.round(perfNow() - a.t0) - a.msAudio, userStop: a.userStop }))
    const wasOk = prevOk
    prevOk = outcome === 'ok'
    teardown(a)
    onSignal('end')
    const next = planNext({ outcome, error, retry: a.retry, deaf: a.deaf, wasOk, deafTried: run.deafTried, lastError: run.lastError })
    record(a, error, next.kind !== 'retry', outcome)
    if (next.kind !== 'retry') { push(next.patch); return }
    const r = run
    r.lastError = next.lastError
    if (next.viaDeaf) r.deafTried = true
    push({ status: 'retrying', phase: null, interim: '', error: null, hint: null, notice: next.notice })
    r.retryTimer = setTimeout(() => {
      if (run !== r) return
      r.retryTimer = null
      gate.whenReady(() => { if (run === r) launch(a.retry + 1, next.viaDeaf ? { fresh: true, deafRetry: true } : {}) }, r.strat)
    }, next.pause)
  }

  // o.fresh — не переиспользовать экземпляр (S2/S5); o.deafRetry — пометка в журнале
  function launch(retry, o = {}) {
    teardown(cur) // гарантированно гасим предыдущий экземпляр
    const strat = run.strat
    const reuse = strat.reuse && !o.fresh && !!pool.rec && gate.lastEndOk() // экземпляр, чей end не пришёл, не трогаем
    const a = newAttempt(++seq, retry, {
      startedAt: now(), t0: perfNow(), strat, reused: reuse, deafRetry: !!o.deafRetry, capMode: run.capture,
      gapMs: lastCloseAt == null ? null : Math.round(perfNow() - lastCloseAt),
    })
    cur = a
    const since = () => Math.round(perfNow() - a.t0)
    const live = () => cur === a && !a.done
    const mark = kind => { a.history = pushHistory(a.history, { t: since(), kind }) } // служебное событие движка {t, kind}: «первое увиденное» сверяет с ним interim
    const heard = () => { a.msSound ??= since(); clearTimeout(a.deafTimer) } // хоть какой-то звук/результат: сессия не глухая
    // Глухая сессия (после успешной попытки, один раз): audiostart мгновенный, звука нет DEAF_WINDOW_MS — не ждём 8 с тишины, сразу пересоздаём
    const armDeaf = () => {
      if (a.deafTimer || !wantsDeafTimer({ prevOk, tried: run.deafTried, msAudio: a.msAudio, retry })) return
      a.deafTimer = setTimeout(() => { if (live() && a.msSound == null && a.msResult == null) conclude(a, 'deaf') }, DEAF_WINDOW_MS)
    }
    const arm = () => { clearTimeout(a.silenceTimer); a.silenceTimer = setTimeout(() => conclude(a, 'silence'), LISTEN_SILENCE_MS) }
    const enterAudio = () => { // реальное начало прослушивания: диалог разрешения позади
      if (a.audio) return
      a.audio = true; clearTimeout(a.permTimer)
      push({ status: 'listening', phase: 'audio', notice: null })
    }
    // История interim: момент (мс от старта попытки) и текст каждого обновления; финал помечен final
    const trace = (text, final) => { a.history = pushHistory(a.history, { t: since(), text, ...(final ? { final: true } : {}) }) }
    // Результат принят: модуль гасит движок abort() (без хвоста), проба — stop(). end придёт (conclude), а если нет — страхует forceTimer
    const acceptFinal = (alts, more = {}) => {
      a.gotFinal = true
      clearTimeout(a.silenceTimer); clearTimeout(a.segTimer)
      onSignal('final')
      trace(alts[0].text, true)
      push({ interim: '', lastInterim: a.lastInterim, final: alts[0], alternatives: alts, usedInterim: false, history: a.history, ...more })
      try { if (endOnFinal === 'abort' && !strat.stop) a.rec.abort(); else a.rec.stop() } catch { /* уже останавливается */ }
      a.forceTimer = setTimeout(() => conclude(a, null), endOnFinal === 'abort' ? ABORT_SETTLE_MS : STOP_FORCE_MS)
    }
    // continuous: итог = склейка сегментов, конец — тишина segmentSilenceMs после последнего результата
    const finishSegments = () => { if (live() && !a.gotFinal && a.segText) acceptFinal([{ text: a.segText, confidence: segmentsConfidence(a.segs) }], { segments: a.segs }) }
    const armSeg = () => { clearTimeout(a.segTimer); a.segTimer = setTimeout(finishSegments, segmentSilenceMs) }
    const onSegments = ev => {
      a.segs = readSegments(ev.results, a.segs, since())
      a.lastInterim = a.segText = segmentsText(a.segs)
      clearTimeout(a.silenceTimer); armSeg(); onSignal('interim'); trace(a.segText, false)
      push({ interim: a.segs.filter(x => !x.isFinal).map(x => x.text).join(' '), lastInterim: a.lastInterim, segments: a.segs, history: a.history })
    }
    Promise.resolve().then(queryPerm).catch(() => 'unavailable').then(p => { a.permBefore = p })
    push({
      status: 'starting', phase: 'permission', preparing: false, interim: '', attempt: retry + 1, attemptId: a.id, history: [], segments: [], applied: null,
      ...(retry === 0 ? { notice: NOTICE_WAIT_PERMISSION } : {}),
    })
    try {
      const rec = reuse ? pool.rec : createRecognition()
      pool.rec = strat.reuse ? rec : null
      a.rec = rec
      Object.assign(rec, { lang: run.lang, interimResults: true, maxAlternatives, continuous: false })
      if (configure) {
        try {
          const info = configure(rec, { id: a.id, retry, reference: run.reference, lang: run.lang, extra: run.extra })
          if (info) push({ applied: info })
        } catch { /* настройка не удалась — идём с тем, что выставилось */ }
        a.continuous = rec.continuous === true
      }
      rec.onstart = () => { if (live()) a.msStart ??= since() }
      rec.onaudiostart = () => { if (!live()) return; a.msAudio ??= since(); enterAudio(); arm(); armDeaf(); onSignal('audiostart') }
      // soundstart/soundend приходят РАНЬШЕ speechstart/interim (движок слышит звук, но ещё не решил, что это речь): для эквалайзера.
      // Таймер тишины они не сбрасывают — фоновый шум не должен растягивать ожидание
      rec.onsoundstart = () => { if (live()) { heard(); mark('soundstart'); onSignal('soundstart') } }
      rec.onsoundend = () => { if (live()) { mark('soundend'); onSignal('soundend') } }
      rec.onspeechstart = () => { if (!live()) return; heard(); mark('speechstart'); enterAudio(); arm(); if (a.segTimer) armSeg(); onSignal('speechstart') }
      rec.onspeechend = () => { if (live()) { mark('speechend'); onSignal('speechend') } }
      rec.onaudioend = () => { if (live()) mark('audioend') }
      rec.onresult = ev => {
        if (!live() || a.gotFinal) return
        a.msResult ??= since()
        heard()
        enterAudio()
        if (a.continuous) { onSegments(ev); return }
        const { alts, interim } = readResults(ev.results)
        if (interim) a.lastInterim = interim
        if (!alts) { arm(); onSignal('interim'); trace(interim, false); push({ interim, lastInterim: a.lastInterim, history: a.history }); return }
        acceptFinal(alts)
      }
      rec.onerror = ev => { if (live() && !a.gotFinal) conclude(a, ev?.error || 'unknown') }
      rec.onend = () => { a.ended = true; if (live()) conclude(a, null) }
      a.permTimer = setTimeout(() => conclude(a, 'no-start'), PERMISSION_GUARD_MS)
      // Режимы B/C: микрофон открываем СИНХРОННО в том же жесте, не дожидаясь, и сразу стартуем recognition
      try { capture?.open(a.id, a.capMode) } catch { /* ошибка потока не блокирует распознавание */ }
      rec.start()
    } catch {
      conclude(a, 'start-failed')
    }
  }

  function cancel() {
    teardown(cur)
    if (run) clearTimeout(run.retryTimer)
    run = null
    gate.cancelWait()
  }

  return {
    /** Вызывать прямо в обработчике тапа. reference и lang фиксируются на весь заход. */
    start({ reference, lang, extra }) {
      cancel()
      const r = { no: ++runNo, reference, lang, extra, capture: getCapture(), retryTimer: null, lastError: null, strat: resolveStrategy(getRestart()), deafTried: false }
      run = r
      view = { ...emptyView, runNo, reference, lang, at: now(), extra: extra ?? null, cooling: gate.cooling() }
      onView(view)
      // Прошлый экземпляр ещё закрывается (или идёт пауза после end): нажатие встаёт в очередь и стартует по окончании паузы; иначе — сразу, в этом же жесте
      if (!gate.whenReady(() => { if (run === r) launch(0) }, r.strat)) push({ status: 'starting', phase: 'permission', preparing: true, notice: NOTICE_PREPARE })
    },
    stop() {
      const retrying = !!run?.retryTimer
      if (retrying || gate.cancelWait()) { // ждали автоповтор или конец паузы перед запуском — просто отменяем
        if (retrying) { clearTimeout(run.retryTimer); run.retryTimer = null }
        push({ status: 'done', error: null, hint: null, notice: null, preparing: false })
        return
      }
      const a = cur
      if (!a || a.done) return
      a.userStop = true
      clearTimeout(a.permTimer); clearTimeout(a.silenceTimer); clearTimeout(a.forceTimer); clearTimeout(a.segTimer); clearTimeout(a.deafTimer)
      push({ notice: 'Останавливаем…' })
      try { a.rec.stop() } catch { /* ничего */ }
      closeCapture(a)
      a.forceTimer = setTimeout(() => conclude(a, null), STOP_FORCE_MS)
    },
    /** Полный сброс: микрофон гасим, итог/альтернативы/сравнение очищаем (смена эталона/языка, уход со страницы) */
    reset() { cancel(); view = { ...emptyView, cooling: gate.cooling() }; onView(view) },
    /** Идёт ли реальная запись (после audiostart), а не ожидание диалога разрешения */
    isAudioActive: () => !!cur && cur.audio,
  }
}
