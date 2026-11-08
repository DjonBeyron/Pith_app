// Обновление аудиосессии с проверкой «вывод живой» (v3.3.147). Журнал владельца (iPhone, iOS 18.7, второй тап «Продолжить»): renew → новый ctx running за 67 мс → микрофон → пробный звук
// «НЕ доиграл за 1500 мс (контекст running)»: WebKit иногда не переактивирует вывод с первого раза. Поэтому сразу после renew (ДО getUserMedia) — короткий пробный звук (probeCtx: буфер 50 мс должен
// доиграть за LIVE_PROBE_MS, а currentTime — вырасти). Не идёт — повтор renew до RENEW_RETRIES раз: auto → закрыть все → выдержка RETRY_GAP_MS → тип → новый ctx → unlock → probe.
// Журнал: «[audio] вывод мёртв после renew — повтор N/2 через 1,2 с». После повтора вне жеста новый контекст может не стартовать (resume() без активации) — тогда tapAgain: «Нажми „Продолжить“ ещё раз».
// Зовут: «Продолжить» (gameAudioRestart.js) и старт после фона (wordLaneStart.js). Зависимости подставляются (тесты). → { ok, rn, probe, tries, tapAgain, session } (не отклоняется)
// v3.3.165 (журнал владельца: диктовка в другом приложении держала аудиосессию — три пробы подряд «мёртв» за 3,4 с): каждая строка несёт navigator.audioSession type/state; если state = 'interrupted'
// (сессию держит другое приложение / звонок), повторов RETRIES_INTERRUPTED с выдержкой GAP_INTERRUPTED_MS. opts.maxRetries — потолок повторов (авто-повтор из попапа паузы: 0, одна проба).
import { renewAudioSession } from './gameAudioRenew.js'
import { probeCtx } from './gameAudioCheck.js'
import { peekGameCtx } from './gameAudioCtx.js'
import { pLog } from './debug.js'

export const LIVE_PROBE_MS = 300  // потолок на доигрывание пробного буфера 50 мс сразу после renew
export const RETRY_GAP_MS = 1200  // выдержка между закрытием всех контекстов и новым типом при повторе
export const RENEW_RETRIES = 2    // сколько раз повторяем renew, если вывод мёртв
export const RETRIES_INTERRUPTED = 4     // столько повторов, если audioSession.state = 'interrupted'
export const GAP_INTERRUPTED_MS = 2500   // и такая выдержка между ними

const sec = ms => String(ms / 1000).replace('.', ',')
const activeNow = () => { try { return globalThis.navigator?.userActivation?.isActive !== false } catch { return true } }
const sessionNow = () => { try { const a = globalThis.navigator?.audioSession; return a ? `${a.type ?? '—'}/${a.state ?? '—'}` : 'нет API' } catch { return 'недоступно' } }
const DEFAULTS = { renew: renewAudioSession, probe: probeCtx, peekCtx: peekGameCtx, log: pLog, active: activeNow, session: sessionNow }

/** Пробный звук на текущем игровом контексте → { ok, ms, why } */
export async function probeLive(d) {
  try { return await d.probe(d.peekCtx(), { maxMs: LIVE_PROBE_MS }) } catch (e) { return { ok: false, ms: 0, why: `проба упала: ${e?.message ?? e}` } }
}

/** Сколько повторов и с какой выдержкой: сессия прервана (state 'interrupted') — дольше и чаще. → { max, gap } */
export function retryPlan(session, maxRetries = null) {
  const hit = String(session ?? '').endsWith('/interrupted')
  const max = hit ? RETRIES_INTERRUPTED : RENEW_RETRIES
  return { max: maxRetries == null ? max : Math.min(max, maxRetries), gap: hit ? GAP_INTERRUPTED_MS : RETRY_GAP_MS }
}

/** renew → probe → (мёртв) повтор renew с выдержкой, до RENEW_RETRIES раз (до RETRIES_INTERRUPTED, если сессия прервана). opts — как у renewAudioSession (reason, wantType, applyType) + maxRetries */
export async function renewUntilLive({ maxRetries = null, ...opts } = {}, over = {}) {
  const d = { ...DEFAULTS, ...over }
  const reason = opts.reason ?? 'старт'
  const ses = () => { try { return d.session() } catch { return 'недоступно' } }
  const once = async extra => {
    let rn
    try { rn = await d.renew({ ...opts, ...extra }) } catch (e) { d.log(`[audio] renew упал: ${e?.message ?? e}`); rn = null }
    return { rn, probe: await probeLive(d) }
  }
  const said = p => (p.ok ? `живой (пробный звук ${p.ms} мс)` : `мёртв — ${p.why}`)
  let { rn, probe } = await once({})
  d.log(`[audio] вывод после renew: ${said(probe)}; audioSession=${ses()}`)
  let tries = 0
  while (!probe.ok) {
    const plan = retryPlan(ses(), maxRetries)
    if (tries >= plan.max) break
    tries += 1
    d.log(`[audio] вывод мёртв после renew — повтор ${tries}/${plan.max} через ${sec(plan.gap)} с (${probe.why}; audioSession=${ses()})`)
    ;({ rn, probe } = await once({ reason: `${reason}, повтор ${tries}/${plan.max}`, holdMs: plan.gap }))
    d.log(`[audio] вывод после повтора ${tries}/${plan.max}: ${said(probe)}; audioSession=${ses()}`)
    if (!probe.ok && !d.active() && (d.peekCtx()?.state ?? 'running') !== 'running') { // новый контекст не стартует без жеста — дальше повторять бесполезно
      d.log('[audio] жест истёк: новый контекст без касания не запустится — нужен ещё один тап «Продолжить»')
      return { ok: false, rn, probe, tries, tapAgain: true, session: ses() }
    }
  }
  return { ok: probe.ok, rn, probe, tries, tapAgain: false, session: ses() }
}
