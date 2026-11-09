// Симуляция памяти и XP «Гонки с Питом» (CONCEPT_RACE.md, «Итог»): по состоянию раундов (raceState.js) считает итог и пишет его тем же способом, что и репетиция (rehearsal/rehearsalSim.js: applySession → память сессии в sessionStorage,
// слова с промахами — завтра, без промахов — следующий шаг лесенки, потолок XP в день общий). Никаких запросов на сервер: позже эту запись заменит RPC вкладки «Память».
//  • слово «к повтору» идёт в память, если оно из плана (слова добора «Разгона» из чужих планов в память не пишутся);
//  • промах слова: «Разгон» и «Слушай и лови» (ошибка, пропуск, «поверил чужому переводу»), ступень «Вершины», на которой k-е слово не получилось; верно — слово сказано без промаха хотя бы в одном раунде;
//  • золото — везде: разгон и «Слушай и лови» без ошибок, золото вершины, спуск — Пит говорит race_done_gold;
//  • этап 2 «Фразы» (raceStatePhrases.js): ход фразы со словом — верно / промах слова в памяти сессии; phrases — фразы итога («с чем спутал», круг 2), слова фраз без «Пинг-понга» тоже в списке слов;
//  • в итог идут и метрики (raceMetrics.js: точность по этапам, среднее время ответа, самое медленное слово, ловушки), и все слова обоих этапов от слабых к сильным (raceWeak.js) с точностью каждого (raceAccuracy.js; в журнал — строка «[race] итог: «слово» N %» на слово).
import { pLog } from '../../shared/lib/debug.js'
import { applySession } from '../rehearsal/rehearsalSim.js'
import { normText } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { climbWords } from './raceWords.js'
import { medalOf } from './raceLadder.js'
import { weakWords } from './raceWeak.js'
import { raceMetrics } from './raceMetrics.js'
import { withAccuracy } from './raceAccuracy.js'
import { accLogLine } from './raceAccuracyNote.js'
import { failedIn } from './raceExtraRound.js'
import { phraseSummary, phraseCount, phraseHits, phraseOnlyWords } from './raceStatePhrases.js'
import { phrasesOf } from './racePhraseData.js'

export const MEDAL_TITLES = { gold: 'золото', silver: 'серебро', finish: 'без медали', none: '—' }

/** Строка «Вершины» в итоге: медаль; не дошёл до вершины (время вышло, потолок заходов) — «без медали, N из M ступеней»; раунда не было — «—» */
export const climbTitle = r => (r.medal === 'none' && r.climbTotal > 0 ? `без медали, ${r.climbRung} из ${r.climbTotal} ступеней` : MEDAL_TITLES[r.medal])

/** Итог по состоянию гонки: { sprint: { hit, total }, catchOk, catchTotal, medal, descent, phraseDone, words: [{ text, hit, miss }], xp, misses, gold, weak: [{ text, translation, score, tone, note, acc }] (все слова проходов от слабых к сильным, raceWeak.js, с точностью raceAccuracy.js), metrics (raceMetrics.js) } */
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
    const ph = phraseHits(race.phrases, w.text) // ходы этапа «Фразы», где было слово
    const hit = (sp && !failedIn(sp) ? 1 : 0) + (ct && !ct.trap && !failedIn(ct) ? 1 : 0) + ph.hit // ловушка, на которую не поддался, слову в память ничего не даёт
    const miss = (sp && failedIn(sp) ? 1 : 0) + (ct && failedIn(ct) ? 1 : 0) + (cm ? 1 : 0) + ph.miss
    return { text: w.text, hit, miss, phraseHits: ph.hit, phraseMisses: ph.miss, phraseUnclean: ph.unclean, played: !!(sp || ct || cm || ph.hit || ph.miss) }
  }).filter(w => w.played).map(w => ({ text: w.text, hit: w.hit, miss: w.miss, phraseHits: w.phraseHits, phraseMisses: w.phraseMisses, ...(w.phraseUnclean ? { phraseUnclean: w.phraseUnclean } : {}) })) // phraseHits / phraseMisses / phraseUnclean — фразы со словом (их читает raceMemory.outcomesOf; «Скажи» — по двум проходам)
  const xp = plan.words.filter(w => w.due && mem.find(x => x.text === w.text)?.hit > 0).length
  const descent = race.descent
  const misses = (sprintTotal - sprintHit) + (catchTotal - catchOk) + Object.values(race.climb?.fails ?? {}).reduce((a, n) => a + n, 0) + (descent === 'miss' ? 1 : 0)
  const phraseDone = descent === 'ok' || !!race.climb?.top
  const gold = sprintTotal > 0 && sprintHit === sprintTotal && catchTotal > 0 && catchOk === catchTotal && medal === 'gold' && descent === 'ok'
  const listed = weakWords(race, Infinity)
  const weak = withAccuracy(race, [...listed, ...phraseOnlyWords(phrasesOf(plan), race.phrases, new Set(listed.map(w => normText(w.text))))])
    .map(w => { const ph = phraseHits(race.phrases, w.text); return ph.hit || ph.miss ? { ...w, phraseHits: ph.hit, phraseMisses: ph.miss, ...(ph.unclean ? { phraseUnclean: ph.unclean } : {}) } : w })
  const pc = phraseCount(race.phrases)
  return { sprint: { hit: sprintHit, total: sprintTotal }, catchOk, catchTotal, phrasesOk: pc.ok, phrasesTotal: pc.total, phrases: phraseSummary(race.phrases), medal, climbRung: race.climb?.rung ?? 0, climbTotal: race.climb?.n ?? 0, timedOut: !!race.climb?.timedOut, descent, phraseDone, words: mem, xp, misses, gold, weak, metrics: raceMetrics(race) }
}

/** Итог одним вызовом: подсчёт → запись в память сессии (rehearsalSim.applySession) → строка в журнал отладки. Вызывает директор useRaceActs на экране итога */
export function reportRace({ plan, race, store, now, log = pLog }) {
  const score = scoreRace(plan, race)
  if (plan.debugStart) log(`[race] старт с этапа «${plan.startLabel ?? plan.startAt}» (отладка): память и XP не пишутся`)
  const saved = plan.debugStart ? { xp: 0, capped: false } : applySession(plan, score, { store, now })
  log(`[race] итог «${plan.phrase}»: разгон ${score.sprint.hit}/${score.sprint.total}, слух ${score.catchOk}/${score.catchTotal}${score.phrasesTotal ? `, фразы ${score.phrasesOk}/${score.phrasesTotal}` : ''}${score.metrics.avgMs != null ? `, ответ в среднем ${score.metrics.avgMs} мс` : ''}, вершина ${climbTitle(score)}, спуск ${score.descent === 'ok' ? 'верно' : score.descent === 'miss' ? 'нет' : '—'}, XP +${saved.xp}${saved.capped ? ' (потолок дня)' : ''}, слова ${score.words.map(w => `${w.text} ${w.hit}/${w.miss}`).join(', ') || '—'}`)
  for (const w of score.weak) log(`[race] ${accLogLine(w)}`)
  for (const p of score.phrases.filter(x => x.weak)) log(`[race] итог: слабая фраза «${p.text}»${p.r1?.confusedText ? `, спутал с «${p.r1.confusedText}»` : p.r1 && !p.r1.ok ? ', не успел' : ''}${p.r2 ? `, круг 2 ${p.r2.ok ? '✓' : '✗'}` : ''}`) // точность каждого слова итога — одной строкой (raceAccuracy.js), владелец присылает журнал
  return { ...score, xp: saved.xp, capped: saved.capped }
}
