// Результаты этапа 2 «Фразы» игры «Встряхни память» (CONCEPT_RACE.md, «Этап 2» → «Лента и круги»): события ходов в состоянии гонки (raceState.js: s.phrases — список событий) и всё, что из них
// считает итог: вклад во точность слов фразы (raceAccuracy.js), слабые фразы («с чем спутал», круг 2 ✓ / ✗), слова фраз, которых не было в «Пинг-понге», и порядок круга 2 (слабые — последними).
// Событие: { t: 'phrase', phraseKey, text, ru, words (ключи слов фразы), round: 1 | 2, ok, late, confusedWith (key) , confusedText, ratio, clean }. Чистые функции без React.
import { normText } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { weakTone } from './raceWeak.js'

export const PHRASE_CLEAN = 1    // фраза верно и чисто (все слова)
export const PHRASE_UNCLEAN = 0.6 // верно, но слово пропущено
export const PHRASE_WEAK = 2     // слабость слова за каждую неудачу во фразе (как ошибка первого круга «Пинг-понга»)

/** Итог хода сцены (rep с rep.res) → событие фразы; нечего записать — null */
export function phraseEvent(kind, rep) {
  if (!rep?.phraseKey || !['win', 'miss', 'fail'].includes(kind)) return null
  const r = rep.res ?? {}
  const confusedWith = kind === 'miss' ? r.confusedWith ?? null : null
  return {
    t: 'phrase', phraseKey: rep.phraseKey, text: rep.text, ru: rep.ru ?? '', words: rep.words ?? [], round: rep.round === 2 ? 2 : 1, mode: rep.mode,
    ok: kind === 'win', late: kind === 'win' && !!r.late, confusedWith, confusedText: confusedWith ? rep.cands?.find(c => c.key === confusedWith)?.text ?? confusedWith : null,
    ratio: Number.isFinite(r.ratio) ? r.ratio : kind === 'win' ? 1 : 0, clean: kind === 'win' && r.clean !== false,
  }
}

/** Редюсер: событие фразы в состояние (s.phrases — по порядку ходов) */
export const phraseStep = (s, ev) => ({ state: { ...s, phrases: [...(s.phrases ?? []), ev] } })

/** Оценка события для слова: чисто 1, нечисто 0,6, промах 0 */
export const phraseEventScore = e => (!e?.ok ? 0 : e.clean ? PHRASE_CLEAN : PHRASE_UNCLEAN)

const hasWord = (e, text) => (e.words ?? []).includes(normText(text))

/** Вклад фраз в точность слова text: { score 0…1, events } или null (слова ни в одной сыгранной фразе нет) */
export function phrasePart(list, text) {
  const events = (list ?? []).filter(e => hasWord(e, text))
  if (!events.length) return null
  return { score: events.reduce((a, e) => a + phraseEventScore(e), 0) / events.length, events }
}

/** Пометка фразы для слова в расшифровке точности: «во фразе Nice to meet you спутал» / «… не успел» / «… нечисто»; всё чисто — '' */
export function phraseNote(part) {
  const bad = part?.events?.find(e => !e.ok) ?? part?.events?.find(e => !e.clean)
  if (!bad) return ''
  return `во фразе ${bad.text} ${!bad.ok ? (bad.confusedWith ? 'спутал' : 'не успел') : 'нечисто'}`
}

/** Фразы итога: [{ key, text, ru, r1: { ok, late, confusedText } | null, r2: { ok, clean, ratio } | null, weak }] по порядку первого хода; weak — что-то не так */
export function phraseSummary(list) {
  const by = new Map()
  for (const e of list ?? []) {
    const row = by.get(e.phraseKey) ?? { key: e.phraseKey, text: e.text, ru: e.ru, r1: null, r2: null }
    if (e.round === 1) row.r1 = { ok: e.ok, late: e.late, confusedText: e.confusedText }
    else row.r2 = { ok: e.ok, clean: e.clean, ratio: e.ratio }
    by.set(e.phraseKey, row)
  }
  return [...by.values()].map(r => ({ ...r, weak: (!!r.r1 && (!r.r1.ok || r.r1.late)) || (!!r.r2 && (!r.r2.ok || !r.r2.clean)) }))
}

/** Сколько ходов фраз верно / всего (строка «Фразы» итога) */
export const phraseCount = list => ({ ok: (list ?? []).filter(e => e.ok).length, total: (list ?? []).length })

/** Слабые фразы круга 1 (ключи): ошибка, «не успел» или ответ в последний момент — в круге 2 они идут последними */
export const weakPhraseKeys = list => [...new Set((list ?? []).filter(e => e.round === 1 && (!e.ok || e.late)).map(e => e.phraseKey))]

/** Директор перед кругом 2 (nextIdx): после круга 1 вписать порядок ходов круга 2 (stage.fill); переход не меняет — null */
export function fillPhrases2(stages, cur, s) {
  if (cur?.act !== 'phrases' || cur.sid !== 'phrases1') return null
  stages.find(x => x.sid === 'phrases2')?.fill?.(weakPhraseKeys(s?.phrases))
  return null
}

/** Счёт слова text во фразах для памяти сессии: { hit, miss } — верных и неудачных ходов фраз со словом */
export function phraseHits(list, text) {
  const ev = (list ?? []).filter(e => hasWord(e, text))
  return { hit: ev.filter(e => e.ok).length, miss: ev.filter(e => !e.ok).length }
}

/**
 * Слова фраз (из words фразы плана: с переводом), которых нет среди слов «Пинг-понга» (seen — ключи normText): [{ text, translation, score, tone, note }] — их тоже показывает итог.
 * phrases — фразы плана (racePhraseData.phrasesOf), list — события.
 */
export function phraseOnlyWords(phrases, list, seen = new Set()) {
  const out = []
  const played = new Set((list ?? []).map(e => e.phraseKey))
  for (const p of phrases ?? []) {
    if (!played.has(p.key)) continue
    for (const w of p.words ?? []) {
      const k = normText(w.text)
      if (!k || seen.has(k)) continue
      seen.add(k)
      const { miss } = phraseHits(list, w.text)
      const score = miss * PHRASE_WEAK
      out.push({ text: w.text, translation: w.translation ?? '', score, tone: weakTone(score), note: miss ? 'ошибка' : 'верно' })
    }
  }
  return out
}
