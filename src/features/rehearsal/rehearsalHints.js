// Подсказки «застрял» в акте «без текста» (CONCEPT_REHEARSAL.md §3 акт 4 и §8): слушатель молчит STUCK_MS — Пит подсказывает. Подсказок на ступень две, и какая первая, выбрано по семени (rehearsalVariety.blindVariety):
//  word — «начинается с «слово»»: Пит говорит первое слово, над дорожкой на 2 с подпись куска;
//  tr   — перевод куска: над дорожкой на 2 с подпись-перевод (Пит молчит: перевод по-русски озвучки в библиотеке слов не имеет).
// Нет перевода или подсказок в ступени нет — всегда word. Чистые функции.

/** Подсказка номер n (0, 1…) ступени stage: { kind: 'word' | 'tr', lane, word?, text } */
export function stuckHint(stage, n = 0) {
  const kinds = stage?.hintKinds?.length ? stage.hintKinds : ['word']
  let kind = kinds[n % kinds.length]
  if (kind === 'tr' && !stage?.hintTr) kind = 'word'
  const lane = stage?.hintLane ?? 0
  return kind === 'tr' ? { kind, lane, text: stage.hintTr } : { kind, lane, word: stage?.hintWord, text: stage?.hintWord }
}

/** Что в s.hint для подсказки: номер дорожки (покажется подпись куска) или { lane, text } (покажется этот текст) */
export const hintEntry = h => (h.kind === 'tr' ? { lane: h.lane, text: h.text } : h.lane)

/** Запись подсказки на дорожке lane в списке hint (число или { lane, text }); нет — undefined */
export const hintAt = (hint, lane) => hint.find(h => (h?.lane ?? h) === lane)
