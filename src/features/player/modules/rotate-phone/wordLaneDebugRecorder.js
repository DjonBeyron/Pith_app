// Запись микрофона для отладки «Повтори за диктором»: MediaRecorder на ТОМ ЖЕ потоке, который слушает игра, — нового getUserMedia нет. Поток берётся так:
//  1) игровой поток (gameMic.getGameMic: iPhone/iPad держат один на всю игру);
//  2) иначе — поток, который распознаватель (voskEngine) открыл сам: на время отладки getUserMedia обёрнут «подслушивателем» (arm), он только запоминает полученный поток и
//     ничего не меняет в вызове. Распознаватель закрывает свой поток после каждого захода и открывает новый — каждому потоку своя часть записи (parts), у части свой startedAtMs.
// Формат: audio/webm;codecs=opus, если умеет браузер, иначе audio/mp4 (iOS Safari), иначе записи нет — в журнал пишется rec-unsupported. Куски приходят раз в секунду (timeslice).
// Старт — при каждом «Слушаю…» (attach: уже записываемый поток не трогаем), стоп — в финале игры (stop). Время старта записи — в журнал (event rec-start), по нему файл сопоставляется с событиями.
export const REC_TIMESLICE_MS = 1000
export const STOP_WAIT_MS = 1500
export const MIMES = ['audio/webm;codecs=opus', 'audio/mp4']

/** Какой формат записи умеет браузер: webm/opus → mp4 → null (нет MediaRecorder или ни один формат не поддержан) */
export function pickMime(MR = globalThis.MediaRecorder) {
  if (typeof MR !== 'function') return null
  for (const m of MIMES) { try { if (MR.isTypeSupported?.(m)) return m } catch { /* пробуем следующий */ } }
  return null
}

/** Описание дорожек потока для журнала: метка, состояние, настройки (шумоподавление, частота, каналы) */
export function describeStream(stream) {
  try {
    return stream.getAudioTracks().map(t => {
      let settings = null
      try { settings = t.getSettings?.() ?? null } catch { /* без настроек */ }
      return { label: t.label ?? '', readyState: t.readyState, muted: !!t.muted, enabled: !!t.enabled, settings }
    })
  } catch { return [] }
}

const liveAudio = s => { try { return !!s && s.getAudioTracks().some(t => t.readyState === 'live') } catch { return false } }

/** getUserMedia → «подслушиватель»: onStream(stream) получает каждый открытый аудиопоток, вызов и его результат не меняются. Возвращает снятие обёртки */
export function armSpy(md, onStream) {
  if (!md || typeof md.getUserMedia !== 'function') return () => {}
  const hadOwn = Object.prototype.hasOwnProperty.call(md, 'getUserMedia')
  const orig = md.getUserMedia
  const wrapped = function (...args) {
    const p = orig.apply(md, args)
    return p && typeof p.then === 'function' ? p.then(s => { try { if (s?.getAudioTracks?.().length) onStream(s) } catch { /* отладка не мешает микрофону */ } return s }) : p
  }
  md.getUserMedia = wrapped
  return () => {
    if (md.getUserMedia !== wrapped) return
    if (hadOwn) md.getUserMedia = orig
    else delete md.getUserMedia
  }
}

/**
 * log — журнал (wordLaneDebug); getStream() — игровой поток или null; now — часы (эпоха, мс); MR / md — MediaRecorder и navigator.mediaDevices (подставляются в тестах).
 * Методы: arm() — до старта слушателя; attach() — на каждое «Слушаю…»; stop() → Promise (все части дописаны); parts() → [{ mime, startedAtMs, blob }]; describe().
 */
export function createDebugRecorder({ log, getStream = () => null, now = () => Date.now(), MR = globalThis.MediaRecorder, md = globalThis.navigator?.mediaDevices } = {}) {
  const mime = pickMime(MR)
  const done = []        // законченные и идущие части: { mime, startedAtMs, chunks, source, tracks }
  let spied = null       // последний поток, открытый распознавателем
  let unspy = null
  let cur = null         // { rec, stream, part, closed: Promise }
  const pending = []     // «часть дописана» каждой записи
  let stopped = false
  let warned = false

  const closeCur = () => {
    const c = cur
    cur = null
    if (!c) return Promise.resolve()
    try { if (c.rec.state !== 'inactive') c.rec.stop() } catch { /* уже остановлена */ }
    return c.closed
  }

  function open(stream, source) {
    const part = { mime, startedAtMs: now(), chunks: [], source, tracks: describeStream(stream) }
    let rec
    try { rec = new MR(stream, { mimeType: mime }) } catch (e) { log.event('rec-error', { error: String(e?.name || e) }); return }
    let resolveClosed
    const closed = new Promise(r => { resolveClosed = r })
    rec.ondataavailable = ev => { if (ev?.data?.size > 0) part.chunks.push(ev.data) }
    rec.onstart = () => { part.startedAtMs = now() }
    rec.onerror = ev => log.event('rec-error', { error: String(ev?.error?.name || 'error') })
    rec.onstop = () => { log.event('rec-stop', { at: now(), bytes: part.chunks.reduce((a, b) => a + (b.size || 0), 0) }); resolveClosed() }
    try { rec.start(REC_TIMESLICE_MS) } catch (e) { log.event('rec-error', { error: String(e?.name || e) }); return }
    done.push(part); pending.push(closed)
    cur = { rec, stream, part, closed }
    log.event('rec-start', { at: part.startedAtMs, mime, source, tracks: part.tracks })
  }

  return {
    supported: !!mime,
    /** До старта слушателя: запоминаем потоки, которые откроет сам распознаватель */
    arm() { stopped = false; if (!unspy) unspy = armSpy(md, s => { spied = s }) },
    /** «Слушаю…»: пишем текущий поток игры; тот же поток, что уже пишется, не трогаем, новый — закрывает прежнюю часть и открывает свою */
    attach() {
      if (stopped) return
      if (!mime) { if (!warned) { warned = true; log.event('rec-unsupported', { hasMediaRecorder: typeof MR === 'function' }) } return }
      let game = null
      try { game = getStream() } catch { game = null }
      const stream = liveAudio(game) ? game : liveAudio(spied) ? spied : null
      if (!stream) return
      if (cur && cur.stream === stream && cur.rec.state === 'recording') return
      closeCur()
      open(stream, stream === game ? 'gameMic' : 'recognizer')
    },
    /** Финал: запись остановлена, обёртка getUserMedia снята. Promise — когда все части дописаны (последний кусок приходит уже после stop) */
    stop() {
      stopped = true
      unspy?.(); unspy = null
      spied = null
      closeCur()
      return Promise.race([Promise.all(pending), new Promise(r => setTimeout(r, STOP_WAIT_MS))]).then(() => undefined) // onstop мог не прийти (поток уже умер) — ждём не дольше STOP_WAIT_MS
    },
    parts: () => done.filter(p => p.chunks.length).map(p => ({ mime: p.mime, startedAtMs: p.startedAtMs, blob: new Blob(p.chunks, { type: p.mime }), source: p.source })),
    describe: () => ({ recording: !!mime, mime, parts: done.map(p => ({ source: p.source, startedAtMs: p.startedAtMs, chunks: p.chunks.length, tracks: p.tracks })) }),
  }
}
