import { MODES, nextStep } from './game2Modes.js'
import { emptyScore, withResult } from './game2Score.js'
import { visiblePills } from './timelinePlan.js'

// Сценарий сессии «Мини-игры 2.0» (не React, зависимости приходят аргументом env — тесты ведут сценарий без часов и звука): режимы идут по порядку (game2Modes.nextStep), перед каждым Пит говорит свою реплику
// и ждём её конца, лента запускается на проход (env.lane), результат режима копится в итог. «Ловлю» после промаха повторяется один раз (реплика rh2_catch_miss вместо вступительной).
// env: say(id) — Пит говорит и промис «договорил»; show(mode, pills) — показать пилюли режима (промис: DOM готов); timeline(rate) — план ленты; lane(mode, timeline, pills) — проход ленты → { credited, total, missed };
// onMode(id), onScore(score), onDone(score) — наружу; cancelled() — отмена (выход, пауза); log(msg).
export async function runSession(env, { from = 'start', dueCount = 0, score: initial = emptyScore() } = {}) {
  let score = initial
  let step = { mode: from, say: MODES[from].line }
  let tries = 0
  while (step && !env.cancelled()) {
    const mode = MODES[step.mode]
    env.onMode(mode.id)
    env.log(`режим «${mode.title}»: реплика ${step.say}`)
    if (mode.id === 'done') { await env.say(step.say); if (env.cancelled()) return null; env.onDone(score); return score }
    if (mode.id === 'catch') tries = step.say === 'rh2_catch_miss' ? tries + 1 : 1
    await env.say(step.say)
    if (env.cancelled()) return null
    const timeline = env.timeline(mode.rate)
    const pills = visiblePills(timeline, mode.show)
    await env.show(mode, pills)
    let missed = 0
    if (mode.lane) {
      const r = await env.lane(mode, timeline, pills)
      if (env.cancelled()) return null
      missed = r.missed.length
      if (mode.input !== 'none') { score = withResult(score, mode.id, r.credited, r.total); env.onScore(score) }
      env.log(`«${mode.title}»: ${r.credited} из ${r.total}`)
    }
    step = nextStep(mode.id, { dueCount, missed, tries })
  }
  return null
}
