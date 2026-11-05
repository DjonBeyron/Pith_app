// Метрики итога гонки (CONCEPT_RACE.md, «Финиш»): чистая функция от состояния гонки (raceState.js: sprint / catch = { words, traps, results, r2 }, результат пилюли = { hit, miss, ms, trap, believed }).
//  • accuracy — точность по этапам: { sprint: { hit, total }, catch: { hit, total } } по первому кругу (в «Слушай и лови» верно и слово на верный перевод, и молчание на чужой); этапа не было — null;
//  • avgMs — среднее время ответа на слово, мс: от выезда пилюли до зачёта, по верным ответам обоих этапов и кругов (нет ни одного — null);
//  • slowest — самое медленное верное слово: { text, ms } или null;
//  • traps — ловушки «Слушай и лови» (пилюли с чужим переводом): { dodged — не поддался, total } по первому кругу.
import { failedIn } from './raceExtraRound.js'

const ok = r => !failedIn(r)

/** Верные ответы с временем одного круга: [{ text, ms }] */
const timed = (round, texts) => Object.entries(round?.results ?? {}).filter(([, r]) => ok(r) && r.ms > 0).map(([i, r]) => ({ text: texts?.[i] ?? '', ms: r.ms }))

/** { accuracy: { sprint, catch }, avgMs, slowest, traps } по состоянию гонки race = { sprint, catch } */
export function raceMetrics(race) {
  const acc = st => (st?.words?.length ? { hit: Object.values(st.results ?? {}).filter(ok).length, total: st.words.length } : null)
  const cs = race?.catch
  const all = [race?.sprint, cs].flatMap(st => [timed(st, st?.words), timed(st?.r2, st?.r2?.words)]).flat()
  const slow = all.reduce((a, x) => (!a || x.ms > a.ms ? x : a), null)
  const trapIdx = (cs?.traps ?? []).flatMap((t, i) => (t ? [i] : []))
  return {
    accuracy: { sprint: acc(race?.sprint), catch: acc(cs) },
    avgMs: all.length ? Math.round(all.reduce((a, x) => a + x.ms, 0) / all.length) : null,
    slowest: slow ? { text: slow.text, ms: slow.ms } : null,
    traps: { dodged: trapIdx.filter(i => ok(cs.results?.[i])).length, total: trapIdx.length },
  }
}

/** Время ответа для экрана: «1,2 с» (мс → секунды с запятой, один знак) */
export const fmtMs = ms => `${(ms / 1000).toFixed(1).replace('.', ',')} с`
