// Журнал «страница что-то проиграла» — диагностика «глухого» микрофона на iPhone (гипотеза: любое воспроизведение страницей — <audio>, AudioContext,
// беззвучный wav «разблокировки звука» — переключает категорию аудиосессии WebKit в playback/ambient, и следующее распознавание речи слышит тишину).
// Кольцо последних событий {t, kind, src?}: kind = 'audio-play' (HTMLAudioElement играет: звуки интерфейса, озвучка слов, чужие <audio>) | 'video-play' (звучащее
// <video>) | 'unlock-wav' (беззвучный wav primedAudio) | 'audiocontext' (создание/resume/воспроизведение через Web Audio; src='capture' — контекст захвата микрофона).
// Поведение звуков НЕ меняет: только запись. Контроллер распознавания (speechController) на старте каждой попытки спрашивает «что играло за 6 с до неё».
// Чистый модуль без импортов; время — Date.now (в тестах fake timers).
export const SOUND_WINDOW_MS = 6000 // окно «звуки до записи»
const KEEP = 60
const SKIP_FRESH_MS = 2000          // слушатель play не дублирует элемент, который уже записал явный хук

let ring = []
const seen = new WeakMap() // элемент → когда его записал явный хук

const cut = s => String(s ?? '').replace(/\s+/g, ' ').slice(0, 40)

export function logSound(kind, src = null, t = Date.now()) {
  ring.push({ t, kind, ...(src ? { src: cut(src) } : {}) })
  if (ring.length > KEEP) ring = ring.slice(-KEEP)
}

/** Явный хук для <audio>/<video>: пишет событие и помечает элемент, чтобы глобальный слушатель его не задублировал */
export function logElementSound(kind, src, el) {
  logSound(kind, src)
  if (el) { try { seen.set(el, Date.now()) } catch { /* не объект */ } }
}

export const soundEvents = () => ring.slice()

/** События в окне (at − windowMs, at]: «что играло перед стартом записи» */
export const soundsBefore = (at, windowMs = SOUND_WINDOW_MS) => ring.filter(e => e.t <= at && e.t > at - windowMs)

/** События после момента at (во время записи) */
export const soundsAfter = at => ring.filter(e => e.t > at)

/** Сколько мс прошло от последнего события до at (в окне windowMs); нет событий → null */
export function lastSoundAgo(at, windowMs = SOUND_WINDOW_MS) {
  const list = soundsBefore(at, windowMs)
  return list.length ? Math.max(0, at - list[list.length - 1].t) : null
}

const keyOf = e => (e.kind === 'audiocontext' && e.src === 'capture' ? 'audiocontext(capture)' : e.kind)

/** Короткая сводка: «unlock-wav×2, audio-play×1» (порядок — по первому появлению); пусто → '' */
export function summarizeSounds(events) {
  const counts = new Map()
  for (const e of events ?? []) counts.set(keyOf(e), (counts.get(keyOf(e)) ?? 0) + 1)
  return [...counts].map(([k, n]) => (n > 1 ? `${k}×${n}` : k)).join(', ')
}

/** Для журнала/отчётов: «звуки до записи: unlock-wav×2, audio-play×1 (−340 мс)» | «звуки до записи: нет»; старая запись без поля → '' */
export function fmtSoundsBefore(entry) {
  if (!entry || typeof entry.audioBefore !== 'string') return ''
  if (!entry.audioBefore) return 'звуки до записи: нет'
  return `звуки до записи: ${entry.audioBefore}${typeof entry.audioAgo === 'number' ? ` (−${entry.audioAgo} мс)` : ''}`
}

/**
 * Пометка про звуки страницы и аудиосессию (диагностика iOS): «звуки до записи: unlock-wav×2, audio-play (−340 мс) · во время записи: audio-play · аудиосессия: auto→play-and-record».
 * Старая запись без полей → ''. Корреляция «глухая попытка ⇔ перед ней играл звук» читается по этой пометке
 */
export function fmtAudioNote(e) {
  const p = [fmtSoundsBefore(e)]
  if (e?.audioDuring) p.push(`во время записи: ${e.audioDuring}`)
  if (e?.audioSession) p.push(`аудиосессия: ${e.audioSession}`)
  return p.filter(Boolean).join(' · ')
}

/**
 * Журнал чужих <audio>/<video>: оборачивает HTMLMediaElement.prototype.play (ловит и элементы вне DOM — new Audio(), для них события play до document не доходят).
 * Запись делается, когда play() УДАЛСЯ (промис выполнен) и элемент не со звуком «выкл»; отказ автозапуска (NotAllowedError) не пишется — сессию он не менял.
 * Элемент, который уже записал явный хук (<2 с назад), не дублируется. Возвращаемое значение и this play() не меняются. Ставится только на вкладке «Голос»
 * (useTabSilence); возвращает uninstall() или null (нет прототипа / уже стоит).
 */
export function installMediaPlayLog(proto = globalThis.HTMLMediaElement?.prototype) {
  if (!proto || typeof proto.play !== 'function' || proto.play.__soundLog) return null
  const orig = proto.play
  const wrapped = function play(...args) {
    const res = orig.apply(this, args)
    try {
      const el = this
      const note = () => {
        const tag = el?.tagName
        if (el?.muted) return // беззвучное воспроизведение аудиосессию не занимает
        const at = seen.get(el)
        if (at != null && Date.now() - at < SKIP_FRESH_MS) return
        logSound(tag === 'VIDEO' ? 'video-play' : 'audio-play', `другой: ${String(el?.currentSrc || el?.src || '').split('/').pop()}`)
      }
      if (res && typeof res.then === 'function') res.then(note, () => {}); else note()
    } catch { /* диагностика не должна ломать воспроизведение */ }
    return res
  }
  wrapped.__soundLog = true
  proto.play = wrapped
  return () => { if (proto.play === wrapped) proto.play = orig }
}

/** Только для тестов */
export function _resetSoundLog() { ring = [] }

/** Адаптер для speechController (опция sounds): что играло за окно до старта попытки / после него */
export const soundProbe = {
  before: at => ({ text: summarizeSounds(soundsBefore(at)), ago: lastSoundAgo(at) }),
  during: at => summarizeSounds(soundsAfter(at)),
}
