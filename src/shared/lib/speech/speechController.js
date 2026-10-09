// Контроллер попыток распознавания речи (общий для пробы «Голос» в админке и модуля «Сказать фразу»; чистый JS,
// без React и без window — всё передаётся снаружи).
// Одно нажатие «Сказать» = «заход» (run) с зафиксированными эталоном и языком; внутри — до MAX_ATTEMPTS попыток.
// Каждая попытка = НОВЫЙ экземпляр recognition + свой attemptId; события чужого/закрытого экземпляра игнорируются.
import {
  LISTEN_SILENCE_MS, PERMISSION_GUARD_MS, MAX_ATTEMPTS, RETRY_PAUSE_MS, STOP_FORCE_MS, SEGMENT_SILENCE_MS,
  shouldRetry, isQuietCode, retryNotice, LOUD_HINT, NOTICE_WAIT_PERMISSION, NOTICE_BLOCKED, toPercent,
} from './speechPolicy.js'
import { pushHistory, readSegments, segmentsText, segmentsConfidence } from './speechSegments.js'

const ABORT_SETTLE_MS = 250 // после abort() ждём end не дольше этого: результат у нас уже есть

export const emptyView = {
  status: 'idle', // idle | starting | listening | retrying | done | error
  interim: '', lastInterim: '', final: null, alternatives: [], usedInterim: false, // lastInterim — последний промежуточный текст попытки (диагностика админа)
  error: null, hint: null, notice: null, needTap: false,
  runNo: 0, reference: '', lang: '', at: null, attempt: 0, maxAttempts: MAX_ATTEMPTS, attemptId: 0,
  history: [], segments: [], applied: null, extra: null, // диагностика пробы: история interim [{t,text,final?}] ≤80, сегменты continuous, что выставил configure, снимок extra из start()
}

export const isBusy = view => view.status === 'starting' || view.status === 'listening' || view.status === 'retrying'

const HANDLERS = ['onstart', 'onaudiostart', 'onsoundstart', 'onsoundend', 'onspeechstart', 'onspeechend', 'onresult', 'onerror', 'onend']

export function createSpeechController({
  createRecognition, queryPerm = async () => 'unavailable', getMode = () => 'browser',
  // Необязательные хуки режимов захвата B/C (только проба «Голос», admin/speech): capture — менеджер параллельного
  // потока (speechCaptureManager.js), getCapture — режим на момент тапа, logFields(mode, info) — доп. поля записи журнала.
  // Модуль «Сказать фразу» их не передаёт: режим A (только SpeechRecognition), ничего параллельно с ним не открывается
  capture = null, getCapture = () => 'plain', logFields = () => ({}),
  now = () => Date.now(), perfNow = () => Date.now(), onView = () => {}, onEntry = () => {},
  // onSignal(kind) — события движка для синтетического уровня эквалайзера модуля «Сказать фразу» (sayVoiceLevel.js):
  // 'audiostart' | 'soundstart' | 'speechstart' | 'interim' | 'final' | 'speechend' | 'soundend' | 'end'. Реального уровня звука не берём (getUserMedia
  // рядом с SpeechRecognition на iPhone ломает распознавание). endOnFinal — чем гасить движок после финального результата:
  // 'stop' (проба «Голос», как раньше) или 'abort' (модуль: abort() не доигрывает системный хвост распознавания)
  onSignal = () => {}, endOnFinal = 'stop',
  // Только проба «Голос» (antiPredict*): maxAlternatives — число гипотез; configure(rec, {id, retry, reference, lang, extra}) — один раз на
  // экземпляр перед start(), в try/catch (lang/continuous/phrases/grammars/processLocally…), вернуть можно описание применённого (view.applied);
  // extra — из start({extra}). Хука нет по умолчанию. rec.continuous = true → итог из сегментов, конец через segmentSilenceMs тишины или «Стоп»
  maxAlternatives = 3, configure = null, segmentSilenceMs = SEGMENT_SILENCE_MS,
}) {
  let seq = 0     // счётчик attemptId (на каждый экземпляр recognition)
  let runNo = 0   // номер нажатия «Сказать»
  let cur = null  // текущая попытка (всё, что не cur, — чужое и игнорируется)
  let run = null  // текущий заход: { no, reference, lang, retryTimer, lastError }
  let view = emptyView

  const push = patch => { view = { ...view, ...patch }; onView(view) }

  function teardown(a) {
    if (!a) return
    clearTimeout(a.permTimer); clearTimeout(a.silenceTimer); clearTimeout(a.forceTimer); clearTimeout(a.segTimer)
    if (a.rec) {
      for (const h of HANDLERS) a.rec[h] = null
      try { a.rec.abort() } catch { /* уже остановлен */ }
    }
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
    const entry = {
      t: a.startedAt, mode: getMode(), permBefore: a.permBefore, permAfter: 'unavailable',
      msStart: a.msStart, msAudio: a.msAudio, msResult: a.msResult, error,
      retry: a.retry, run: run?.no ?? null, last, outcome,
      conf: toPercent(view.final?.confidence), ...logFields(a.capMode, a.capInfo, { view, extra: run?.extra }),
    }
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
    teardown(a)
    onSignal('end')
    const again = outcome === 'error' && shouldRetry(error, a.retry)
    record(a, error, !again, outcome)
    if (again) {
      const r = run
      r.lastError = error
      push({ status: 'retrying', phase: null, interim: '', error: null, hint: null, notice: retryNotice(error, a.retry + 2) })
      r.retryTimer = setTimeout(() => {
        if (run !== r) return
        r.retryTimer = null
        launch(a.retry + 1)
      }, RETRY_PAUSE_MS)
    } else if (outcome === 'error' && error === 'start-failed' && a.retry > 0) {
      // автоповтор вне жеста браузер не дал запустить (iOS): честно просим нажать
      const prev = run.lastError || error
      push({ status: 'error', error: prev, hint: isQuietCode(prev) ? LOUD_HINT : null, notice: NOTICE_BLOCKED, needTap: true })
    } else if (outcome === 'error') {
      push({ status: 'error', error, hint: isQuietCode(error) ? LOUD_HINT : null, notice: null })
    } else {
      push({ status: 'done', error: null, hint: null, notice: null })
    }
  }

  function launch(retry) {
    teardown(cur) // гарантированно гасим предыдущий экземпляр
    const a = {
      id: ++seq, retry, rec: null, startedAt: now(), t0: perfNow(), permBefore: 'unavailable',
      msStart: null, msAudio: null, msResult: null, done: false, gotFinal: false, userStop: false,
      capMode: run.capture, capInfo: null, capClosed: false, audio: false, lastInterim: '', permTimer: null, silenceTimer: null, forceTimer: null,
      history: [], continuous: false, segs: [], segText: '', segTimer: null,
    }
    cur = a
    const since = () => Math.round(perfNow() - a.t0)
    const live = () => cur === a && !a.done
    const arm = () => {
      clearTimeout(a.silenceTimer)
      a.silenceTimer = setTimeout(() => conclude(a, 'silence'), LISTEN_SILENCE_MS)
    }
    const enterAudio = () => { // реальное начало прослушивания: диалог разрешения позади
      if (a.audio) return
      a.audio = true
      clearTimeout(a.permTimer)
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
      try { if (endOnFinal === 'abort') a.rec.abort(); else a.rec.stop() } catch { /* уже останавливается */ }
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
      status: 'starting', phase: 'permission', interim: '', attempt: retry + 1, attemptId: a.id, history: [], segments: [], applied: null,
      ...(retry === 0 ? { notice: NOTICE_WAIT_PERMISSION } : {}),
    })
    try {
      const rec = createRecognition()
      a.rec = rec
      rec.lang = run.lang
      rec.interimResults = true
      rec.maxAlternatives = maxAlternatives
      rec.continuous = false
      if (configure) {
        try {
          const info = configure(rec, { id: a.id, retry, reference: run.reference, lang: run.lang, extra: run.extra })
          if (info) push({ applied: info })
        } catch { /* настройка не удалась — идём с тем, что выставилось */ }
        a.continuous = rec.continuous === true
      }
      rec.onstart = () => { if (live()) a.msStart ??= since() }
      rec.onaudiostart = () => { if (!live()) return; a.msAudio ??= since(); enterAudio(); arm(); onSignal('audiostart') }
      // soundstart/soundend приходят РАНЬШЕ speechstart/interim (движок слышит звук, но ещё не решил, что это речь): для эквалайзера.
      // Таймер тишины они не сбрасывают — фоновый шум не должен растягивать ожидание
      rec.onsoundstart = () => { if (live()) onSignal('soundstart') }
      rec.onsoundend = () => { if (live()) onSignal('soundend') }
      rec.onspeechstart = () => { if (!live()) return; enterAudio(); arm(); if (a.segTimer) armSeg(); onSignal('speechstart') }
      rec.onspeechend = () => { if (live()) onSignal('speechend') }
      rec.onresult = ev => {
        if (!live() || a.gotFinal) return
        a.msResult ??= since()
        enterAudio()
        if (a.continuous) { onSegments(ev); return }
        const finals = []
        let interim = ''
        for (let i = 0; i < ev.results.length; i++) {
          const r = ev.results[i]
          if (r.isFinal) finals.push(r)
          else interim += (interim ? ' ' : '') + r[0].transcript
        }
        if (interim) a.lastInterim = interim
        if (!finals.length) { arm(); onSignal('interim'); trace(interim, false); push({ interim, lastInterim: a.lastInterim, history: a.history }); return }
        const alts = finals.length === 1
          ? Array.from(finals[0]).map(x => ({ text: x.transcript.trim(), confidence: x.confidence }))
          : [{ text: finals.map(r => r[0].transcript.trim()).join(' '), confidence: finals.reduce((s, r) => s + r[0].confidence, 0) / finals.length }]
        acceptFinal(alts)
      }
      rec.onerror = ev => { if (live() && !a.gotFinal) conclude(a, ev?.error || 'unknown') }
      rec.onend = () => { if (live()) conclude(a, null) }
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
  }

  return {
    /** Вызывать прямо в обработчике тапа. reference и lang фиксируются на весь заход. */
    start({ reference, lang, extra }) {
      cancel()
      run = { no: ++runNo, reference, lang, extra, capture: getCapture(), retryTimer: null, lastError: null }
      view = { ...emptyView, runNo, reference, lang, at: now(), extra: extra ?? null }
      onView(view)
      launch(0)
    },
    stop() {
      if (run?.retryTimer) { // ждали автоповтор — просто отменяем его
        clearTimeout(run.retryTimer); run.retryTimer = null
        push({ status: 'done', error: null, hint: null, notice: null })
        return
      }
      const a = cur
      if (!a || a.done) return
      a.userStop = true
      clearTimeout(a.permTimer); clearTimeout(a.silenceTimer); clearTimeout(a.forceTimer); clearTimeout(a.segTimer)
      push({ notice: 'Останавливаем…' })
      try { a.rec.stop() } catch { /* ничего */ }
      closeCapture(a)
      a.forceTimer = setTimeout(() => conclude(a, null), STOP_FORCE_MS)
    },
    /** Полный сброс: микрофон гасим, итог/альтернативы/сравнение очищаем (смена эталона/языка, уход со страницы) */
    reset() { cancel(); view = emptyView; onView(view) },
    /** Идёт ли реальная запись (после audiostart), а не ожидание диалога разрешения */
    isAudioActive: () => !!cur && cur.audio,
  }
}
