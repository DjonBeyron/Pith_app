// Ходы этапа 2 «Фразы» игры «Встряхни память» (CONCEPT_RACE.md, «Этап 2» → «Лента и круги»): из фраз плана (racePhraseData.phrasesOf) — что едет по широкой ленте на каждом ходу. Чистые функции,
// случайность — только rngFor (по семени плана), без Math.random: одна сессия воспроизводима.
//  • круг 1 «Пойми» (голосом и пальцами одинаково): ход на каждую СВОЮ фразу в порядке плана (дежурные целью не бывают, каждая своя — целью один раз); кандидаты — цель и два запутывателя с ДРУГИМ смыслом
//    (свои приоритетнее дежурных), порядок кандидатов по семени; одна и та же фраза не подряд: цель хода не повторяет цель прошлого, первая пилюля хода — не последнюю пилюлю прошлого;
//  • круг 2 «Скажи» (голосом): по одной своей фразе на ход (порядок плана), бледный текст; слабые фразы круга 1 идут последними (второй шанс, reorderWeak);
//  • круг 2 «Пальцами»: Пит говорит фразу по-английски, по ленте едут три русских смысла (ru) — верный и два чужих; ход только у фразы со смыслом, у которой нашлись два других смысла.
// Ход: { idx, target: фраза, cands: [{ key, cap, right }] } — cap — надпись широкой пилюли (текст фразы или её смысл).
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

/** Круг 1 «Пойми»: ход на каждую свою фразу, три кандидата-фразы */
export const round1Turns = (phrases, seed) => trioTurns(phrases, seed, 'race-phrases-1', p => p.text, () => true)

/** Круг 2 пальцами: Пит говорит фразу, на ленте три смысла (ru); фразы без смысла и без двух других смыслов пропускаются */
export const round2HearTurns = (phrases, seed) => trioTurns(phrases, seed, 'race-phrases-2', p => p.ru, p => !!lc(p.ru))

/** Круг 2 «Скажи» голосом: по одной своей фразе на ход (порядок плана), бледный текст */
export function round2SayTurns(phrases) {
  return targetsOf(phrases).map((target, idx) => ({ idx, target, cands: [{ key: target.key, cap: target.text, right: true, text: target.text }] }))
}

/** Слабые фразы круга 1 (weak — ключи) — последними, остальной порядок прежний; номера ходов заново */
export function reorderWeak(turns, weak = []) {
  const bad = new Set(weak)
  return [...turns.filter(t => !bad.has(t.target.key)), ...turns.filter(t => bad.has(t.target.key))].map((t, idx) => ({ ...t, idx }))
}
