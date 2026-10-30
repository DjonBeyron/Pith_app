// «Только этот акт» (Админ → «Голос» → «Шлифовка репетиции»): план может нести only — id этапа шлифовки, и тогда рецепт (buildActs) оставляет ТОЛЬКО акты этого этапа, а не весь сценарий.
// Этапы шлифовки совпадают с карточками блока: Заставка, Разминка, Читка, Сборка с конца, Без текста, Различи, Дубль и зеркало, Итог. Чистые функции без React.
//  intro   — заставка: фраза падает, дорожки открываются, акта нет (одна плашка «Заставка», потом финал игры);
//  warmup  — разминка (у одного слова — акт «слово ×2», он идёт под тем же этапом);
//  take    — дубль и зеркало идут вместе (зеркало без дубля показать нечего);
//  summary — экран итога (результат подставной, см. polish/polishDemo.js).
export const ONLY_ACTS = {
  intro: ['intro'],
  warmup: ['warmup', 'word'],
  read: ['read'],
  build: ['build'],
  blind: ['blind'],
  discern: ['discern'],
  take: ['take', 'mirror'],
  summary: ['summary'],
}
export const ONLY_IDS = Object.keys(ONLY_ACTS)
export const ONLY_TITLES = { intro: 'Заставка', warmup: 'Разминка', read: 'Читка', build: 'Сборка с конца', blind: 'Без текста', discern: 'Различи', take: 'Дубль и зеркало', summary: 'Итог' }

const INTRO_ACT = { id: 'intro', title: ONLY_TITLES.intro, line: null }

/** Какому этапу шлифовки принадлежит акт рецепта (id акта: warmup, word, read, build, blind, discern, take, mirror, summary); незнакомый — заставка */
export const onlyOf = actId => ONLY_IDS.find(id => ONLY_ACTS[id].includes(actId)) ?? 'intro'

/** Акты рецепта, оставшиеся после «только этот этап». Нет такого этапа в плане (у фразы нет двойников, у одного слова нет читки) — заставка, чтобы сценарию было что играть */
export function pickActs(acts, only) {
  if (!only || !ONLY_IDS.includes(only)) return acts
  if (only === 'intro') return [INTRO_ACT]
  const picked = acts.filter(a => ONLY_ACTS[only].includes(a.id))
  return picked.length ? picked : [INTRO_ACT]
}
