// Симуляция памяти и XP «Гонки с Питом» (CONCEPT_RACE.md, «Итог»): по состоянию раундов (raceState.js) считает итог и пишет его тем же способом, что и репетиция (rehearsal/rehearsalSim.js: applySession → память сессии в sessionStorage,
// слова с промахами — завтра, без промахов — следующий шаг лесенки, потолок XP в день общий). Никаких запросов на сервер: позже эту запись заменит RPC вкладки «Память».
//  • слово «к повтору» идёт в память, если оно из плана (слова добора «Разгона» из чужих планов в память не пишутся);
//  • промах слова: «Разгон» (серия 0), заход «Слушай и лови» с провалом, ступень «Вершины», на которой k-е слово не получилось; верно — слово сказано без промаха хотя бы в одном раунде;
//  • золото — везде: разгон без промахов, три захода слуха с первой попытки, золото вершины, спуск — Пит говорит race_done_gold.
import { pLog } from '../../shared/lib/debug.js'
import { applySession } from '../rehearsal/rehearsalSim.js'
import { normText } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { climbWords } from './raceWords.js'
import { medalOf } from './raceLadder.js'

export const MEDAL_TITLES = { gold: 'золото', silver: 'серебро', finish: 'без медали', none: '—' }

/** Итог по состоянию гонки: { sprint: { hit, total }, catchOk, catchTotal, medal, descent, phraseDone, words: [{ text, hit, miss }], xp, misses, gold } */
export function scoreRace(plan, race) {
  const results = Object.entries(race.sprint.results)
  const sprintTotal = race.sprint.words.length
  const sprintHit = results.filter(([, r]) => r.hit && !r.miss).length
  const catchList = Object.values(race.catch.results)
  const catchOk = catchList.filter(r => r.ok).length
  const medal = medalOf(race.climb)
  const climbMiss = new Set()
  const words = climbWords(plan)
  for (const [k, n] of Object.entries(race.climb?.fails ?? {})) if (n > 0 && words[k - 1]) climbMiss.add(normText(words[k - 1])) // ступень k — k-е слово фразы
  const sprintOf = text => { const i = race.sprint.words.findIndex(w => normText(w) === normText(text)); return i >= 0 ? race.sprint.results[i] : null }
  const catchOf = text => Object.entries(race.catch.results).find(([ci]) => normText(race.catch.words?.[ci] ?? '') === normText(text))?.[1] ?? null
  const mem = plan.words.map(w => {
    const sp = sprintOf(w.text), ct = catchOf(w.text), cm = climbMiss.has(normText(w.text))
    const hit = (sp?.hit && !sp.miss ? 1 : 0) + (ct?.ok && !ct.bad ? 1 : 0)
    const miss = (sp?.miss || (sp && !sp.hit) ? 1 : 0) + (ct && (ct.bad || !ct.ok) ? 1 : 0) + (cm ? 1 : 0)
    return { text: w.text, hit, miss, played: !!(sp || ct || cm) }
  }).filter(w => w.played).map(w => ({ text: w.text, hit: w.hit, miss: w.miss }))
  const xp = plan.words.filter(w => w.due && mem.find(x => x.text === w.text)?.hit > 0).length
  const descent = race.descent
  const misses = (sprintTotal - sprintHit) + catchList.reduce((a, r) => a + r.bad, 0) + Object.values(race.climb?.fails ?? {}).reduce((a, n) => a + n, 0) + (descent === 'miss' ? 1 : 0)
  const phraseDone = descent === 'ok' || !!race.climb?.top
  const gold = sprintTotal > 0 && sprintHit === sprintTotal && catchList.length > 0 && catchList.every(r => r.ok && !r.bad) && medal === 'gold' && descent === 'ok'
  return { sprint: { hit: sprintHit, total: sprintTotal }, catchOk, catchTotal: catchList.length, medal, descent, phraseDone, words: mem, xp, misses, gold }
}

/** Итог одним вызовом: подсчёт → запись в память сессии (rehearsalSim.applySession) → строка в журнал отладки. Вызывает директор useRaceActs на экране итога */
export function reportRace({ plan, race, store, now, log = pLog }) {
  const score = scoreRace(plan, race)
  const saved = applySession(plan, score, { store, now })
  log(`[race] итог «${plan.phrase}»: разгон ${score.sprint.hit}/${score.sprint.total}, слух ${score.catchOk}/${score.catchTotal}, вершина ${MEDAL_TITLES[score.medal]}, спуск ${score.descent === 'ok' ? 'верно' : score.descent === 'miss' ? 'нет' : '—'}, XP +${saved.xp}${saved.capped ? ' (потолок дня)' : ''}, слова ${score.words.map(w => `${w.text} ${w.hit}/${w.miss}`).join(', ') || '—'}`)
  return { ...score, xp: saved.xp, capped: saved.capped }
}
