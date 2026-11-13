import { startCountdown } from '../rehearsal/rehearsalCountdownSound.js'
import { countdownPlan } from '../rehearsal/rehearsalCountdown.js'

// Отсчёт «Скажи» ПОСЛЕ демо (v3.3.220, замечание владельца: «сигнал начала нового этапа должен быть после примера»). Раньше три ноты играли на плашке круга, а за ними шло демо — сигнал «начали!» звучал до того, как
// ученику показали, что делать. Теперь плашка круга с демо без нот (raceStagesPhrases: count: false, step.phrases.countAfter), а сцена (racePhraseScene) зовёт отсчёт, когда демо кончилось (или пропущено), прямо перед первым
// ходом. Продолжение с середины круга (scene.from > 0) нот не даёт. → stop() идущего отсчёта или null (отсчёт не нужен).
export function startPhraseCount({ cfg, from = 0, count = startCountdown, onDone }) {
  if (!cfg.countAfter || (from ?? 0) > 0) return null
  return count({ plan: countdownPlan({ soft: true }), what: `«${cfg.mode === 'say' ? 'Скажи' : 'круг'}» (после демо)`, onDone })
}
