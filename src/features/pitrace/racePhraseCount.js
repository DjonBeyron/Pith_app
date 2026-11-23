import { startCountdown } from '../rehearsal/rehearsalCountdownSound.js'
import { countdownPlan, countdownMs } from '../rehearsal/rehearsalCountdown.js'
import { scenePush } from '../../shared/lib/sceneTrace.js'
import { sceneKnob } from '../../shared/lib/scenePauseTrace.js'

// Отсчёт «Скажи» ПОСЛЕ демо (v3.3.220, замечание владельца: «сигнал начала нового этапа должен быть после примера»). Раньше три ноты играли на плашке круга, а за ними шло демо — сигнал «начали!» звучал до того, как
// ученику показали, что делать. Теперь плашка круга с демо без нот (raceStagesPhrases: count: false, step.phrases.countAfter), а сцена (racePhraseScene) зовёт отсчёт, когда демо кончилось (или пропущено), прямо перед первым
// ходом. Продолжение с середины круга (scene.from > 0) нот не даёт. → stop() идущего отсчёта или null (отсчёт не нужен).
// Отсчёт пишется в трассу сцены (count / count-end), как отсчёты плашек (rehearsalCountdownRun.js): без этого таймлайн показывал три ноты после демо как «игра молчит 2,7 с» (журнал владельца 22.11).
export function startPhraseCount({ cfg, from = 0, count = startCountdown, onDone, trace = scenePush }) {
  if (!cfg.countAfter || (from ?? 0) > 0) return null
  const plan = countdownPlan({ soft: true }), what = `«${cfg.mode === 'say' ? 'Скажи' : 'круг'}» (после демо)`
  trace('count', { what, ms: countdownMs(plan) }); sceneKnob('count.tail', { from: 'count', until: what })
  return count({ plan, what, onDone: () => { trace('count-end', {}); onDone?.() } })
}
