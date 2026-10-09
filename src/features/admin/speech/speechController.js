// Контроллер попыток распознавания речи для пробы «Голос» (чистый JS, без React и без window — всё передаётся снаружи).
// Одно нажатие «Сказать» = «заход» (run) с зафиксированными эталоном и языком; внутри — до MAX_ATTEMPTS попыток.
// Каждая попытка = НОВЫЙ экземпляр recognition + свой attemptId; события чужого/закрытого экземпляра игнорируются.
import {
  LISTEN_SILENCE_MS, PERMISSION_GUARD_MS, MAX_ATTEMPTS, RETRY_PAUSE_MS, STOP_FORCE_MS,
  shouldRetry, isQuietCode, retryNotice, LOUD_HINT, NOTICE_WAIT_PERMISSION, NOTICE_BLOCKED,
} from './speechPolicy.js'
import { captureLogFields, toPercent } from './speechCapture.js'

export const emptyView = {
  status: 'idle', // idle | starting | listening | retrying | done | error
  interim: '', final: null, alternatives: [], usedInterim: false,
  error: null, hint: null, notice: null, needTap: false,
  runNo: 0, reference: '', lang: '', at: null, attempt: 0, maxAttempts: MAX_ATTEMPTS, attemptId: 0,
}

export const isBusy = view => view.status === 'starting' || view.status === 'listening' || view.status === 'retrying'

const HANDLERS = ['onstart', 'onaudiostart', 'onspeechstart', 'onresult', 'onerror', 'onend']

export function createSpeechController({
  createRecognition, queryPerm = async () => 'unavailable', getMode = () => 'browser',
  capture = null, getCapture = () => 'plain', // capture — менеджер параллельного потока (режимы B/C), см. speechCaptureManager.js
  now = () => Date.now(), perfNow = () => Date.now(), onView = () => {}, onEntry = () => {},
}) {
  let seq = 0     // счётчик attemptId (на каждый экземпляр recognition)
  let runNo = 0   // номер нажатия «Сказать»
  let cur = null  // текущая попытка (всё, что не cur, — чужое и игнорируется)
  let run = null  // текущий заход: { no, reference, lang, retryTimer, lastError }
  let view = emptyView

  const push = patch => { view = { ...view, ...patch }; onView(view) }

  function teardown(a) {
    if (!a) return
    clearTimeout(a.permTimer); clearTimeout(a.silenceTimer); clearTimeout(a.forceTimer)
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
      conf: toPercent(view.final?.confidence), ...captureLogFields(a.capMode, a.capInfo),
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
    if (a.gotFinal) { outcome = 'ok'; error = null } else if (a.lastInterim && (code == null || stopped)) {
      // iOS иногда заканчивает без финала: берём последний промежуточный текст
      const alt = { text: a.lastInterim.trim(), confidence: null }
      push({ interim: '', final: alt, alternatives: [alt], usedInterim: true })
      outcome = 'ok'; error = null
    } else if (stopped) { outcome = 'stopped'; error = null }
    teardown(a)
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
    Promise.resolve().then(queryPerm).catch(() => 'unavailable').then(p => { a.permBefore = p })
    push({
      status: 'starting', phase: 'permission', interim: '', attempt: retry + 1, attemptId: a.id,
      ...(retry === 0 ? { notice: NOTICE_WAIT_PERMISSION } : {}),
    })
    try {
      const rec = createRecognition()
      a.rec = rec
      rec.lang = run.lang
      rec.interimResults = true
      rec.maxAlternatives = 3
      rec.continuous = false
      rec.onstart = () => { if (live()) a.msStart ??= since() }
      rec.onaudiostart = () => { if (!live()) return; a.msAudio ??= since(); enterAudio(); arm() }
      rec.onspeechstart = () => { if (!live()) return; enterAudio(); arm() }
      rec.onresult = ev => {
        if (!live() || a.gotFinal) return
        a.msResult ??= since()
        enterAudio()
        const finals = []
        let interim = ''
        for (let i = 0; i < ev.results.length; i++) {
          const r = ev.results[i]
          if (r.isFinal) finals.push(r)
          else interim += (interim ? ' ' : '') + r[0].transcript
        }
        if (interim) a.lastInterim = interim
        if (!finals.length) { arm(); push({ interim }); return }
        const alts = finals.length === 1
          ? Array.from(finals[0]).map(x => ({ text: x.transcript.trim(), confidence: x.confidence }))
          : [{ text: finals.map(r => r[0].transcript.trim()).join(' '), confidence: finals.reduce((s, r) => s + r[0].confidence, 0) / finals.length }]
        a.gotFinal = true
        clearTimeout(a.silenceTimer)
        push({ interim: '', final: alts[0], alternatives: alts, usedInterim: false })
        try { rec.stop() } catch { /* уже останавливается */ }
        a.forceTimer = setTimeout(() => conclude(a, null), STOP_FORCE_MS)
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
    start({ reference, lang }) {
      cancel()
      run = { no: ++runNo, reference, lang, capture: getCapture(), retryTimer: null, lastError: null }
      view = { ...emptyView, runNo, reference, lang, at: now() }
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
      clearTimeout(a.permTimer); clearTimeout(a.silenceTimer); clearTimeout(a.forceTimer)
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
