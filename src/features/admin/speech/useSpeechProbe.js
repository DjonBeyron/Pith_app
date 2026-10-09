import { useState, useRef, useEffect, useCallback } from 'react'
import { getRecognitionCtor, isStandalone, queryMicPermission } from './speechSupport.js'
import { appendLog, dialogGuess } from './speechLog.js'

export const IDLE_TIMEOUT_MS = 8000 // нет ни одного результата дольше — останавливаем сами

const emptyView = { status: 'idle', interim: '', final: null, alternatives: [], error: null, usedInterim: false }

// Одна попытка распознавания по тапу («Сказать»). Микрофон включается только внутри start(),
// выключается на результате, ошибке, «Стоп», таймауте, уходе со страницы и размонтировании.
// Звук не сохраняется: из распознавателя берём только текст и confidence.
export function useSpeechProbe({ lang, onLogged }) {
  const [view, setView] = useState(emptyView)
  const recRef = useRef(null)
  const runRef = useRef(null) // данные текущей попытки (тайминги, разрешение до, таймер)

  const release = useCallback(() => {
    const rec = recRef.current
    recRef.current = null
    if (rec) {
      rec.onstart = rec.onaudiostart = rec.onresult = rec.onerror = rec.onend = null
      try { rec.abort() } catch { /* уже остановлен */ }
    }
    if (runRef.current?.timer) clearTimeout(runRef.current.timer)
    runRef.current = null
  }, [])

  useEffect(() => {
    const stopNow = () => { release(); setView(emptyView) }
    const onHidden = () => { if (document.visibilityState === 'hidden') stopNow() }
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', stopNow)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', stopNow)
      release() // уход со вкладки админки — микрофон не держим
    }
  }, [release])

  const finish = useCallback(async () => {
    const run = runRef.current
    if (!run || run.done) return
    run.done = true
    if (run.timer) clearTimeout(run.timer)
    const permAfter = await queryMicPermission()
    const entry = {
      t: run.startedAt, mode: run.mode, permBefore: run.permBefore, permAfter,
      msStart: run.msStart, msAudio: run.msAudio, msResult: run.msResult, error: run.error || null,
    }
    entry.dialog = dialogGuess(entry)
    onLogged?.(appendLog(entry))
  }, [onLogged])

  const fail = useCallback((code) => {
    const run = runRef.current
    if (!run || run.error) return // первая причина важнее (после своего timeout abort() даёт 'aborted')
    run.error = code
    setView(v => ({ ...v, status: 'error', error: code }))
  }, [])

  const stop = useCallback(() => {
    try { recRef.current?.stop() } catch { /* ничего */ }
  }, [])

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor()
    if (!Ctor || recRef.current) return
    // start() должен выполниться прямо в обработчике тапа (iOS), поэтому разрешение «до» спрашиваем параллельно
    const permPromise = queryMicPermission()
    let rec
    try { rec = new Ctor() } catch { setView({ ...emptyView, status: 'error', error: 'start-failed' }); return }
    const t0 = performance.now()
    const run = { startedAt: Date.now(), mode: isStandalone() ? 'pwa' : 'browser', permBefore: 'unavailable', msStart: null, msAudio: null, msResult: null, error: null, timer: null, done: false, interimTexts: [] }
    runRef.current = run
    recRef.current = rec
    permPromise.then(p => { run.permBefore = p })
    const since = () => Math.round(performance.now() - t0)
    const rearm = () => {
      if (run.timer) clearTimeout(run.timer)
      run.timer = setTimeout(() => {
        if (run.done || runRef.current !== run) return
        fail('timeout')
        try { rec.abort() } catch { /* ничего */ }
      }, IDLE_TIMEOUT_MS)
    }

    rec.lang = lang
    rec.interimResults = true
    rec.maxAlternatives = 3
    rec.continuous = false
    rec.onstart = () => { run.msStart ??= since() }
    rec.onaudiostart = () => { run.msAudio ??= since() }
    rec.onresult = (ev) => {
      run.msResult ??= since()
      rearm()
      const finals = []
      let interim = ''
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i]
        if (r.isFinal) finals.push(r)
        else interim += (interim ? ' ' : '') + r[0].transcript
      }
      if (interim) run.lastInterim = interim
      if (finals.length) {
        const alts = finals.length === 1
          ? Array.from(finals[0]).map(a => ({ text: a.transcript.trim(), confidence: a.confidence }))
          : [{ text: finals.map(r => r[0].transcript.trim()).join(' '), confidence: finals.reduce((s, r) => s + r[0].confidence, 0) / finals.length }]
        run.gotFinal = true
        setView(v => ({ ...v, interim: '', final: alts[0], alternatives: alts, usedInterim: false }))
        try { rec.stop() } catch { /* уже останавливается */ }
      } else {
        setView(v => ({ ...v, interim }))
      }
    }
    rec.onerror = (ev) => { fail(ev.error || 'unknown') }
    rec.onend = () => {
      // iOS иногда заканчивает без финального результата: тогда берём последний промежуточный текст
      if (!run.gotFinal && !run.error && run.lastInterim) {
        const alt = { text: run.lastInterim.trim(), confidence: null }
        setView(v => ({ ...v, interim: '', final: alt, alternatives: [alt], usedInterim: true }))
      }
      setView(v => (v.status === 'listening' || v.status === 'starting' ? { ...v, status: 'done' } : v))
      const r = recRef.current
      if (r === rec) recRef.current = null
      finish().finally(() => { if (runRef.current === run) runRef.current = null })
    }

    setView({ ...emptyView, status: 'listening' })
    rearm()
    try {
      rec.start()
    } catch {
      fail('start-failed')
      finish() // run берётся из runRef синхронно, до release()
      release()
    }
  }, [lang, fail, finish, release])

  return { view, start, stop, listening: view.status === 'listening' }
}
