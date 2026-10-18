// Захват микрофона для движка Vosk: контекст и полное освобождение после попытки (вынесено из voskEngine.js — тот у границы 250 строк).
// Хрип «как плёнка» во ВСЁМ звуке приложения после первого «Сказать фразу» (iPhone): каждая попытка создавала AudioContext с sampleRate 16000 —
// на iOS это переключает частоту аудиосессии, и звуки страницы потом играют с пересэмплированием, пока сессия не вернётся. Поэтому контекст
// теперь на родной частоте устройства (Kaldi сам пересчитывает вход в 16 кГц — тот же путь, что и у браузеров без поддержки sampleRate;
// запись голосового пересчитывает сама, voskRecord.resampleTo16k). Старое поведение — флаг localStorage `pithy_vosk_ctx16k_v1` = '1'.
// Освобождение строго по порядку: треки → отсоединить узлы → закрыть контекст → ТОЛЬКО ПОТОМ вернуть аудиосессию 'auto'
// (раньше 'auto' ставился, пока контекст ещё закрывался, и сессия оставалась в режиме записи). Что освобождено — одной строкой в журнал.
import { logSound } from '../soundLog.js'
import { pLog } from '../debug.js'

export const CTX16K_KEY = 'pithy_vosk_ctx16k_v1'

export const isCtx16kOn = (store = globalThis.localStorage) => { try { return store?.getItem(CTX16K_KEY) === '1' } catch { return false } }

/** AudioContext для записи: по умолчанию родная частота, 16000 — только по флагу (и с откатом, если браузер не умеет) */
export function createCaptureContext(Ctx, store = globalThis.localStorage) {
  let ctx
  if (isCtx16kOn(store)) { try { ctx = new Ctx({ sampleRate: 16000 }) } catch { /* нет поддержки — родная частота */ } }
  ctx ??= new Ctx()
  logSound('audiocontext', 'capture')
  try { Promise.resolve(ctx.resume?.()).catch(() => {}) } catch { /* контекст и так работает */ }
  return ctx
}

/** Освободить микрофон и контекст попытки; повторный вызов безопасен. done() — после закрытия контекста (здесь возвращают аудиосессию) */
export function releaseCapture({ stream, nodes = [], ctx, done = () => {}, log = pLog }) {
  let tracks = 0
  try { stream?.getTracks?.().forEach(tr => { try { if (tr.readyState !== 'ended') { tr.stop(); tracks++ } } catch { /* уже остановлен */ } }) } catch { /* ничего */ }
  for (const n of nodes) { try { n?.disconnect() } catch { /* уже отключён */ } }
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
