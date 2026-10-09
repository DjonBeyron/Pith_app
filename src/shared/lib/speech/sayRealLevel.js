// ОПЦИОНАЛЬНЫЙ реальный уровень звука для колец вокруг квадрата в модуле «Сказать фразу» (эксперимент, ВЫКЛЮЧЕН по умолчанию).
// Зачем: синтетический уровень (sayVoiceLevel.js) идёт по событиям распознавания — soundstart/speechstart/interim приходят через
// 0,3–1,5 с после начала речи, а на iPhone soundstart может не прийти вовсе, поэтому кольца запаздывают. Реальный уровень берётся
// напрямую: getUserMedia({audio:{autoGainControl:true, noiseSuppression:false, echoCancellation:false}}) + AnalyserNode, RMS читается
// КАЖДЫЙ КАДР rAF колец (опроса по таймеру нет) — реакция на голос мгновенная.
// Риск: одновременный захват микрофона рядом с SpeechRecognition на iPhone может сломать распознавание — поэтому флаг localStorage
// `pithy_say_real_level_v1` ('1' = вкл) включается только вручную админом (Админ → «Голос»), у обычных учеников всегда выключен.
// Поток открывается СИНХРОННО в том же тапе (до recognition.start(), промис не ждём); треки останавливаются и AudioContext закрывается
// при конце попытки/результате/ошибке/уходе панели. Ошибка getUserMedia — тихий откат на синтетический уровень (status 'error:Имя').

export const REAL_LEVEL_KEY = 'pithy_say_real_level_v1'
export const REAL_FLOOR = 0.02   // RMS ниже — шум комнаты, кольца не трогает
export const REAL_GAIN = 5       // (RMS − пол) × 5 → ровная речь с автоусилением (RMS ≈ 0,1–0,3) поднимает кольца почти до максимума
export const FFT_SIZE = 256

const clamp01 = v => (v > 1 ? 1 : v > 0 ? v : 0)

/** Ограничения для getUserMedia: автоусиление включено, шумо- и эхоподавление выключены (иначе гасят тихую речь) */
export const realConstraints = () => ({ audio: { autoGainControl: true, noiseSuppression: false, echoCancellation: false } })

/** RMS 0..1 по байтам getByteTimeDomainData (тишина = 128). Пусто → 0 */
export function rmsOf(bytes) {
  const n = bytes?.length || 0
  if (!n) return 0
  let sum = 0
  for (let i = 0; i < n; i++) { const v = (bytes[i] - 128) / 128; sum += v * v }
  return Math.min(1, Math.sqrt(sum / n))
}

/** RMS → уровень колец 0..1: пол шума, усиление, сжатие корнем (тихий голос заметен, громкий — до 1) */
export const levelFromRms = rms => Math.sqrt(clamp01((rms - REAL_FLOOR) * REAL_GAIN))

export function isRealLevelOn(store = globalThis.localStorage) {
  try { return store?.getItem(REAL_LEVEL_KEY) === '1' } catch { return false }
}
export function setRealLevelOn(on, store = globalThis.localStorage) {
  try { if (on) store?.setItem(REAL_LEVEL_KEY, '1'); else store?.removeItem(REAL_LEVEL_KEY) } catch { /* приватный режим — живёт до перезагрузки */ }
}

/** Пометка для строки админа: вкл | выкл | «ошибка NotAllowedError → синтетический». status — из createRealLevel().status() */
export function realLevelLabel(enabled, status) {
  if (!enabled) return 'выкл'
  return typeof status === 'string' && status.startsWith('error:') ? `ошибка ${status.slice(6)} → синтетический` : 'вкл'
}

const stopStream = s => { try { s?.getTracks?.().forEach(t => { try { t.stop() } catch { /* уже остановлен */ } }) } catch { /* ничего */ } }

/** Менеджер потока уровня (без React; окружение передаётся снаружи — поэтому тестируется). onStatus(status) — смена состояния */
export function createRealLevel({ getUserMedia, createAudioContext, onStatus = () => {} }) {
  let h = null // текущий поток: { closed, status, stream, ctx, src, an, buf }
  const setStatus = (c, st) => { c.status = st; if (h === c) onStatus(st) }

  function release(c) {
    c.closed = true
    stopStream(c.stream)
    try { c.src?.disconnect() } catch { /* ничего */ }
    try { Promise.resolve(c.ctx?.close?.()).catch(() => {}) } catch { /* ничего */ }
  }
  function fail(c, name) {
    stopStream(c.stream); c.stream = null
    setStatus(c, `error:${name || 'error'}`)
  }

  function close() {
    const c = h
    h = null
    if (!c || c.closed) return
    release(c)
    onStatus('off')
  }

  return {
    /** Звать СИНХРОННО в тапе (до recognition.start()); промис не ждём */
    open() {
      close()
      const c = { closed: false, status: 'opening', stream: null, ctx: null, src: null, an: null, buf: null }
      h = c
      onStatus('opening')
      try { c.ctx = createAudioContext(); c.ctx?.resume?.() } catch { c.ctx = null } // в жесте — иначе iOS держит контекст «suspended»
      let p
      try { p = getUserMedia(realConstraints()) } catch (e) { p = Promise.reject(e) }
      Promise.resolve(p).then(stream => {
        if (c.closed) { stopStream(stream); return } // попытка уже кончилась — поток не нужен
        c.stream = stream
        try {
          c.src = c.ctx.createMediaStreamSource(stream)
          c.an = c.ctx.createAnalyser()
          c.an.fftSize = FFT_SIZE
          c.src.connect(c.an)
          c.buf = new Uint8Array(c.an.fftSize)
          setStatus(c, 'live')
        } catch (e) { fail(c, e?.name || 'meter') }
      }).catch(e => { if (!c.closed) fail(c, e?.name || 'getUserMedia') })
    },
    close,
    status: () => h?.status ?? 'off',
    isLive: () => h?.status === 'live',
    /** Уровень 0..1 ПРЯМО СЕЙЧАС (звать каждый кадр) */
    level() {
      const c = h
      if (!c || c.status !== 'live') return 0
      try {
        if (c.ctx.state === 'suspended') c.ctx.resume?.()
        c.an.getByteTimeDomainData(c.buf)
        return levelFromRms(rmsOf(c.buf))
      } catch { return 0 }
    },
  }
}

/** Реальный менеджер для браузера: микрофон и контекст берутся из window (нужны только в тапе) */
export const createBrowserRealLevel = onStatus => createRealLevel({
  getUserMedia: c => navigator.mediaDevices.getUserMedia(c), // нет mediaDevices — бросит, менеджер поймает
  createAudioContext: () => new (window.AudioContext || window.webkitAudioContext)(),
  onStatus,
})

/** Источник уровня для колец: реальный, пока поток живой; иначе синтетический (тихий откат при любой ошибке getUserMedia) */
export const levelSource = (voice, real) => ({ ringLevel: t => (real.isLive() ? real.level() : voice.ringLevel(t)) })
