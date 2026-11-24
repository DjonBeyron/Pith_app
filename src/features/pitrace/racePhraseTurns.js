// Ходы этапа 2 «Фразы» игры «Встряхни память» (CONCEPT_RACE.md, «Этап 2» → «Лента и круги»): из фраз плана (racePhraseData.phrasesOf) — что едет по широкой ленте на каждом ходу. Чистые функции,
// случайность — только rngFor (по семени плана), без Math.random: одна сессия воспроизводима.
//  Круг один (круг 1 «Пойми» — тап фразы по ситуации — вырезан, владелец 2026-11-24; имена round2* остались прежними):
//  • «Скажи» (голосом): на каждую свою фразу (порядок плана) ДВА хода подряд — pass 1 (слова под маской, можно по словам) и pass 2 (та же фраза открытым текстом, сказать без остановок,
//    racePhrasePasses.js);
//  • «Узнай» (пальцами): Пит говорит фразу по-английски, по ленте едут три русских смысла (ru) — верный и два чужих (свои приоритетнее дежурных, порядок по семени; первая пилюля хода — не последняя пилюля прошлого);
//    ход только у фразы со смыслом, у которой нашлись два других смысла.
// Ход: { idx, target: фраза, cands: [{ key, cap, right }], pass? } — cap — надпись широкой пилюли (текст фразы или её смысл), pass — проход «Скажи» (1 / 2).
import { rngFor, rngShuffle } from '../rehearsal/rehearsalSeed.js'

const lc = t => String(t ?? '').trim().toLowerCase()
const sense = p => lc(p.ru) || p.key // смысл фразы: ru, нет его — сама фраза

/** Два запутывателя цели: другие фразы с другим смыслом, сначала свои (по семени), потом дежурные; need — у кандидата должно быть это (круг 2 пальцами: ru) */
export function decoysFor(target, phrases, rng, n = 2, need = () => true) {
  const others = phrases.filter(p => p.key !== target.key && need(p))
  const pool = [...rngShuffle(rng, others.filter(p => p.own)), ...rngShuffle(rng, others.filter(p => !p.own))]
  const seen = new Set([sense(target)])
  return pool.filter(p => !seen.has(sense(p)) && seen.add(sense(p))).slice(0, n)
}

/** Порядок кандидатов хода: по семени, первая пилюля — не та, что была последней на прошлом ходу (до 6 попыток, потом сдвиг) */
function arrange(rng, list, prevLast) {
  let out = rngShuffle(rng, list)
  for (let i = 0; i < 6 && prevLast && out[0].key === prevLast; i++) out = rngShuffle(rng, list)
  return prevLast && out[0].key === prevLast ? [...out.slice(1), out[0]] : out
}

/** Цели — свои фразы в порядке плана (фраза текущего урока первой, дальше свои со слабыми словами — так их кладёт слой данных); разные фразы — значит, одна и та же целью подряд не бывает */
const targetsOf = phrases => phrases.filter(p => p.own)

function trioTurns(phrases, seed, tag, cap, need) {
  const rng = rngFor(seed, tag)
  const turns = []
  for (const target of targetsOf(phrases)) {
    if (!need(target)) continue
    const decoys = decoysFor(target, phrases, rng, 2, need)
    if (decoys.length < 2) continue
    const prevLast = turns.at(-1)?.cands.at(-1)?.key
    const cands = arrange(rng, [target, ...decoys], prevLast).map(p => ({ key: p.key, cap: cap(p), right: p.key === target.key, text: p.text }))
    turns.push({ idx: turns.length, target, cands })
  }
  return turns
}

/** Круг 2 пальцами: Пит говорит фразу, на ленте три смысла (ru); фразы без смысла и без двух других смыслов пропускаются */
export const round2HearTurns = (phrases, seed) => trioTurns(phrases, seed, 'race-phrases-2', p => p.ru, p => !!lc(p.ru))

/** Круг 2 «Скажи» голосом: по два хода на свою фразу (порядок плана) — проход 1 и проход 2 подряд */
export function round2SayTurns(phrases) {
  return targetsOf(phrases).flatMap(target => [1, 2].map(pass => ({ target, pass, cands: [{ key: target.key, cap: target.text, right: true, text: target.text }] }))).map((t, idx) => ({ idx, ...t }))
}
