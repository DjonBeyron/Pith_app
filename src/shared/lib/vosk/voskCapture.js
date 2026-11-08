// Захват микрофона для движка Vosk: контекст и полное освобождение после попытки (вынесено из voskEngine.js — тот у границы 250 строк).
// Хрип «как плёнка» во ВСЁМ звуке приложения после первого «Сказать фразу» (iPhone): каждая попытка создавала AudioContext с sampleRate 16000 —
// на iOS это переключает частоту аудиосессии, и звуки страницы потом играют с пересэмплированием, пока сессия не вернётся. Поэтому контекст
// теперь на родной частоте устройства (Kaldi сам пересчитывает вход в 16 кГц — тот же путь, что и у браузеров без поддержки sampleRate;
// запись голосового пересчитывает сама, voskRecord.resampleTo16k). Старое поведение — флаг localStorage `pithy_vosk_ctx16k_v1` = '1'.
// Освобождение строго по порядку: треки → отсоединить узлы → закрыть контекст → ТОЛЬКО ПОТОМ вернуть аудиосессию 'auto'
// (раньше 'auto' ставился, пока контекст ещё закрывался, и сессия оставалась в режиме записи). Что освобождено — одной строкой в журнал.
// v3.3.165 — ОДИН КОНТЕКСТ ЗАХВАТА НА ИГРУ (журнал владельца, iPhone iOS 18.7: перед системными «дорожка заглушена (mute)» стояло «[mic] освобождено: … контекст running→closed» — каждый
// ход закрывал свой AudioContext захвата, и iOS, переконфигурируя аудиосессию, на секунду глушил дорожку). Слушатель на ГОТОВОМ потоке игры (voskEngine opts.stream) берёт контекст через
// acquireCaptureContext(Ctx, { keep: true }): живой оставленный — тот же, нет — новый. releaseCapture такого контекста только отключает узлы («[mic] слушатель отпущен: … контекст захвата оставлен»).
// Закрывают его closeKeptCapture (gameMic: пауза / конец игры / настоящее закрытие потока) и обновление аудиосессии (closeAll реестра → onClose забывает ссылку). Свой поток (не игра) — как раньше.
import { logSound } from '../soundLog.js'
import { pLog } from '../debug.js'
import { createTracked, forget, liveContexts, closeAll } from '../audioContextRegistry.js'

export const CTX16K_KEY = 'pithy_vosk_ctx16k_v1'

// Контексты захвата живут в общем реестре страницы (audioContextRegistry.js, вид 'capture'): обновление аудиосессии после фона закрывает их вместе со всеми (gameAudioRenew.js)
const captures = () => liveContexts().filter(r => r.kind === 'capture')
let kept = null // { ctx, users } — контекст захвата игры, живёт между ходами
const keptIdle = ctx => !!kept && kept.ctx === ctx && kept.users === 0

/** Контексты захвата, которые сейчас слушают (оставленный между ходами без слушателя не считается) — проверка вывода (gameAudioOutputCheck.js) */
export const busyCaptures = () => captures().filter(r => !keptIdle(r.ctx))
/** Оставленный контекст захвата игры: { state, users } или null (журнал и тесты) */
export const keptCapture = () => (kept ? { state: kept.ctx?.state ?? '?', users: kept.users } : null)

/** Сколько контекстов захвата открыто и в каком они состоянии (журнал перезапуска) */
export const captureStates = () => captures().map(r => r.state ?? '?')

/** Закрыть все контексты захвата (прерванный iOS микрофонный контекст может держать аудиосессию без вывода). → сколько закрыто */
export function closeAllCaptures() {
  const n = captures().length
  closeAll({ only: 'capture' }).catch(() => {})
  return n
}

export const isCtx16kOn = (store = globalThis.localStorage) => { try { return store?.getItem(CTX16K_KEY) === '1' } catch { return false } }

/** AudioContext для записи: по умолчанию родная частота, 16000 — только по флагу (и с откатом, если браузер не умеет) */
export function createCaptureContext(Ctx, store = globalThis.localStorage, onClose = null) {
  let ctx
  if (isCtx16kOn(store)) { try { ctx = createTracked('capture', { sampleRate: 16000 }, { Ctor: Ctx, onClose }) } catch { /* нет поддержки — родная частота */ } }
  ctx ??= createTracked('capture', undefined, { Ctor: Ctx, onClose })
  logSound('audiocontext', 'capture')
  try { Promise.resolve(ctx.resume?.()).catch(() => {}) } catch { /* контекст и так работает */ }
  return ctx
}

/** Контекст для слушателя: keep — игра (готовый поток): живой оставленный контекст тот же, нет — новый и оставляется; иначе — свой контекст попытки (закроется в releaseCapture) */
export function acquireCaptureContext(Ctx, { keep = false, store = globalThis.localStorage } = {}) {
  if (!keep) return createCaptureContext(Ctx, store)
  const same = c => { try { return !Ctx || c instanceof Ctx } catch { return true } }
  if (kept && (kept.ctx?.state === 'closed' || !same(kept.ctx))) closeKeptCapture('контекст закрыт или другой конструктор')
  if (kept) {
    kept.users += 1
    if (kept.ctx.state !== 'running') { try { Promise.resolve(kept.ctx.resume?.()).catch(() => {}) } catch { /* решит следующий кусок звука */ } }
    return kept.ctx
  }
  const ctx = createCaptureContext(Ctx, store, c => { if (kept?.ctx === c) kept = null })
  kept = { ctx, users: 1 }
  return ctx
}

/** Закрыть оставленный контекст захвата игры (пауза, конец игры, настоящее закрытие потока). → был ли он */
export function closeKeptCapture(why = 'конец игры', log = pLog) {
  if (!kept) return false
  const { ctx } = kept
  kept = null
  forget(ctx)
  const state = ctx?.state ?? '—'
  if (state === 'closed') return true
  let p
  try { p = Promise.resolve(ctx.close?.()) } catch { p = Promise.resolve() }
  p.catch(() => {}).then(() => { try { log(`[mic] контекст захвата игры закрыт (${why}): ${state}→closed`) } catch { /* журнал не мешает */ } })
  return true
}

const stopOwn = stream => {
  let tracks = 0
  try { stream?.getTracks?.().forEach(tr => { try { if (tr.readyState !== 'ended') { tr.stop(); tracks++ } } catch { /* уже остановлен */ } }) } catch { /* ничего */ }
  return tracks
}
const unplug = nodes => { for (const n of nodes) { try { n?.disconnect() } catch { /* уже отключён */ } } }

/** Освободить микрофон и контекст попытки; повторный вызов безопасен. done() — после закрытия контекста (здесь возвращают аудиосессию). Оставленный контекст игры не закрывается — только узлы */
export function releaseCapture({ stream, nodes = [], ctx, done = () => {}, log = pLog }) {
  const tracks = stopOwn(stream)
  unplug(nodes)
  if (ctx && kept?.ctx === ctx) {
    kept.users = Math.max(0, kept.users - 1)
    try { done() } catch { /* ничего */ }
    logSound('mic-release', `tr${tracks} kept ${ctx.state}`)
    try { log(`[mic] слушатель отпущен: треков ${tracks}, узлы отключены, контекст захвата оставлен ${ctx.state ?? '—'} (один на игру), rate ${ctx.sampleRate ?? '?'}`) } catch { /* журнал не мешает */ }
    return
  }
  if (ctx) forget(ctx)
  const state = ctx?.state ?? '—'
  const fin = why => {
    try { done() } catch { /* ничего */ }
    logSound('mic-release', `tr${tracks} ${state} ${why}`)
    try { log(`[mic] освобождено: треков ${tracks}, контекст ${state}→${why}, rate ${ctx?.sampleRate ?? '?'}`) } catch { /* журнал не мешает */ }
  }
  if (!ctx || state === 'closed' || typeof ctx.close !== 'function') { fin('closed'); return }
  let p
  try { p = Promise.resolve(ctx.close()) } catch { fin('close-error'); return }
  p.then(() => fin('closed'), () => fin('close-error'))
}
