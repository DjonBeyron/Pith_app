// Обновление аудиосессии с проверкой «вывод живой» (v3.3.147). Журнал владельца (iPhone, iOS 18.7, второй тап «Продолжить»): renew → новый ctx running за 67 мс → микрофон → пробный звук
// «НЕ доиграл за 1500 мс (контекст running)»: WebKit иногда не переактивирует вывод с первого раза. Поэтому сразу после renew (ДО getUserMedia) — короткий пробный звук (probeCtx: буфер 50 мс должен
// доиграть за LIVE_PROBE_MS, а currentTime — вырасти). Не идёт — повтор renew до RENEW_RETRIES раз: auto → закрыть все → выдержка RETRY_GAP_MS → тип → новый ctx → unlock → probe.
// Журнал: «[audio] вывод мёртв после renew — повтор N/2 через 1,2 с». После повтора вне жеста новый контекст может не стартовать (resume() без активации) — тогда tapAgain: «Нажми „Продолжить“ ещё раз».
// Зовут: «Продолжить» (gameAudioRestart.js) и старт после фона (wordLaneStart.js). Зависимости подставляются (тесты). → { ok, rn, probe, tries, tapAgain } (не отклоняется)
import { renewAudioSession } from './gameAudioRenew.js'
import { probeCtx } from './gameAudioCheck.js'
import { peekGameCtx } from './gameAudioCtx.js'
import { pLog } from './debug.js'

export const LIVE_PROBE_MS = 300  // потолок на доигрывание пробного буфера 50 мс сразу после renew
export const RETRY_GAP_MS = 1200  // выдержка между закрытием всех контекстов и новым типом при повторе
export const RENEW_RETRIES = 2    // сколько раз повторяем renew, если вывод мёртв

const sec = ms => String(ms / 1000).replace('.', ',')
const activeNow = () => { try { return globalThis.navigator?.userActivation?.isActive !== false } catch { return true } }
const DEFAULTS = { renew: renewAudioSession, probe: probeCtx, peekCtx: peekGameCtx, log: pLog, active: activeNow }

/** Пробный звук на текущем игровом контексте → { ok, ms, why } */
export async function probeLive(d) {
  try { return await d.probe(d.peekCtx(), { maxMs: LIVE_PROBE_MS }) } catch (e) { return { ok: false, ms: 0, why: `проба упала: ${e?.message ?? e}` } }
}

/** renew → probe → (мёртв) повтор renew с выдержкой, до RENEW_RETRIES раз. opts — как у renewAudioSession (reason, wantType, applyType) */
export async function renewUntilLive(opts = {}, over = {}) {
  const d = { ...DEFAULTS, ...over }
  const reason = opts.reason ?? 'старт'
  const once = async extra => {
    let rn
    try { rn = await d.renew({ ...opts, ...extra }) } catch (e) { d.log(`[audio] renew упал: ${e?.message ?? e}`); rn = null }
    return { rn, probe: await probeLive(d) }
  }
  let { rn, probe } = await once({})
  d.log(`[audio] вывод после renew: ${probe.ok ? `живой (пробный звук ${probe.ms} мс)` : `мёртв — ${probe.why}`}`)
  let tries = 0
  while (!probe.ok && tries < RENEW_RETRIES) {
    tries += 1
    d.log(`[audio] вывод мёртв после renew — повтор ${tries}/${RENEW_RETRIES} через ${sec(RETRY_GAP_MS)} с (${probe.why})`)
    ;({ rn, probe } = await once({ reason: `${reason}, повтор ${tries}/${RENEW_RETRIES}`, holdMs: RETRY_GAP_MS }))
    d.log(`[audio] вывод после повтора ${tries}/${RENEW_RETRIES}: ${probe.ok ? `живой (пробный звук ${probe.ms} мс)` : `мёртв — ${probe.why}`}`)
    if (!probe.ok && !d.active() && (d.peekCtx()?.state ?? 'running') !== 'running') { // новый контекст не стартует без жеста — дальше повторять бесполезно
      d.log('[audio] жест истёк: новый контекст без касания не запустится — нужен ещё один тап «Продолжить»')
      return { ok: false, rn, probe, tries, tapAgain: true }
    }
  }
  return { ok: probe.ok, rn, probe, tries, tapAgain: false }
}
