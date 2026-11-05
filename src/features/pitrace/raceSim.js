// Симуляция памяти и XP «Гонки с Питом» (CONCEPT_RACE.md, «Итог»): по состоянию раундов (raceState.js) считает итог и пишет его тем же способом, что и репетиция (rehearsal/rehearsalSim.js: applySession → память сессии в sessionStorage,
// слова с промахами — завтра, без промахов — следующий шаг лесенки, потолок XP в день общий). Никаких запросов на сервер: позже эту запись заменит RPC вкладки «Память».
//  • слово «к повтору» идёт в память, если оно из плана (слова добора «Разгона» из чужих планов в память не пишутся);
//  • промах слова: «Разгон» и «Слушай и лови» (ошибка, пропуск, «поверил чужому переводу»), ступень «Вершины», на которой k-е слово не получилось; верно — слово сказано без промаха хотя бы в одном раунде;
//  • золото — везде: разгон и «Слушай и лови» без ошибок, золото вершины, спуск — Пит говорит race_done_gold;
//  • в итог идут и метрики (raceMetrics.js: точность по этапам, среднее время ответа, самое медленное слово, ловушки), и слабые слова обоих этапов (raceWeak.js).
import { pLog } from '../../shared/lib/debug.js'
import { applySession } from '../rehearsal/rehearsalSim.js'
import { normText } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { climbWords } from './raceWords.js'
import { medalOf } from './raceLadder.js'
import { weakWords } from './raceWeak.js'
import { raceMetrics } from './raceMetrics.js'
import { failedIn } from './raceSprint2.js'

export const MEDAL_TITLES = { gold: 'золото', silver: 'серебро', finish: 'без медали', none: '—' }

/** Строка «Вершины» в итоге: медаль; не дошёл до вершины (время вышло, потолок заходов) — «без медали, N из M ступеней»; раунда не было — «—» */
export const climbTitle = r => (r.medal === 'none' && r.climbTotal > 0 ? `без медали, ${r.climbRung} из ${r.climbTotal} ступеней` : MEDAL_TITLES[r.medal])

/** Итог по состоянию гонки: { sprint: { hit, total }, catchOk, catchTotal, medal, descent, phraseDone, words: [{ text, hit, miss }], xp, misses, gold, weak: [{ text, translation, score, tone }] (самые слабые слова, raceWeak.js), metrics (raceMetrics.js) } */
export function scoreRace(plan, race) {
  const results = Object.entries(race.sprint.results)
  const sprintTotal = race.sprint.words.length
  const sprintHit = results.filter(([, r]) => !failedIn(r)).length
  const catchTotal = race.catch.words.length
  const catchOk = Object.values(race.catch.results).filter(r => !failedIn(r)).length
  const medal = medalOf(race.climb)
  const climbMiss = new Set()
  const words = climbWords(plan)
  for (const [k, n] of Object.entries(race.climb?.fails ?? {})) if (n > 0 && words[k - 1]) climbMiss.add(normText(words[k - 1])) // ступень k — k-е слово фразы
  const sprintOf = text => { const i = race.sprint.words.findIndex(w => normText(w) === normText(text)); return i >= 0 ? race.sprint.results[i] : null }
  const catchOf = text => { const i = race.catch.words.findIndex(w => normText(w) === normText(text)); return i >= 0 ? race.catch.results[i] ?? { hit: false, miss: true } : null }
  const mem = plan.words.map(w => {
    const sp = sprintOf(w.text), ct = catchOf(w.text), cm = climbMiss.has(normText(w.text))
    const hit = (sp && !failedIn(sp) ? 1 : 0) + (ct && !ct.trap && !failedIn(ct) ? 1 : 0) // ловушка, на которую не поддался, слову в память ничего не даёт
    const miss = (sp && failedIn(sp) ? 1 : 0) + (ct && failedIn(ct) ? 1 : 0) + (cm ? 1 : 0)
    return { text: w.text, hit, miss, played: !!(sp || ct || cm) }
  }).filter(w => w.played).map(w => ({ text: w.text, hit: w.hit, miss: w.miss }))
  const xp = plan.words.filter(w => w.due && mem.find(x => x.text === w.text)?.hit > 0).length
  const descent = race.descent
  const misses = (sprintTotal - sprintHit) + (catchTotal - catchOk) + Object.values(race.climb?.fails ?? {}).reduce((a, n) => a + n, 0) + (descent === 'miss' ? 1 : 0)
  const phraseDone = descent === 'ok' || !!race.climb?.top
  const gold = sprintTotal > 0 && sprintHit === sprintTotal && catchTotal > 0 && catchOk === catchTotal && medal === 'gold' && descent === 'ok'
  return { sprint: { hit: sprintHit, total: sprintTotal }, catchOk, catchTotal, medal, climbRung: race.climb?.rung ?? 0, climbTotal: race.climb?.n ?? 0, timedOut: !!race.climb?.timedOut, descent, phraseDone, words: mem, xp, misses, gold, weak: weakWords(race), metrics: raceMetrics(race) }
}

/** Итог одним вызовом: подсчёт → запись в память сессии (rehearsalSim.applySession) → строка в журнал отладки. Вызывает директор useRaceActs на экране итога */
export function reportRace({ plan, race, store, now, log = pLog }) {
  const score = scoreRace(plan, race)
  const saved = applySession(plan, score, { store, now })
  log(`[race] итог «${plan.phrase}»: разгон ${score.sprint.hit}/${score.sprint.total}, слух ${score.catchOk}/${score.catchTotal}${score.metrics.avgMs != null ? `, ответ в среднем ${score.metrics.avgMs} мс` : ''}, вершина ${climbTitle(score)}, спуск ${score.descent === 'ok' ? 'верно' : score.descent === 'miss' ? 'нет' : '—'}, XP +${saved.xp}${saved.capped ? ' (потолок дня)' : ''}, слова ${score.words.map(w => `${w.text} ${w.hit}/${w.miss}`).join(', ') || '—'}`)
  return { ...score, xp: saved.xp, capped: saved.capped }
}
