// Служебные слова, которые не годятся для разминки репетиции (CONCEPT_REHEARSAL.md §3, акт 1): артикли, предлоги-связки, союзы, глаголы-связки и «it». Перевода у них нет (или он бессмысленный: «to» → «к»),
// а дорожка с таким словом выглядит пустой. Даже если для слова есть карточка, в разминку оно не идёт (warmupWords). «I'm» в списке нет: это не служебное слово. Чистая функция без React.
export const STOP_WORDS = new Set([
  'a', 'an', 'the', 'to', 'of', 'and', 'or', 'but', 'so', 'if', 'as',
  'in', 'on', 'at', 'by', 'for',
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'do', 'does', 'did', 'it',
])

/** Слово без знаков по краям, в нижнем регистре, апостроф прямой («I’m» и «I'm» — одно) */
const keyOf = text => String(text ?? '').toLowerCase().replace(/[’‘`]/g, "'").replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '')

/** Служебное слово? («To», «the,» — да; «I'm», «learn» — нет) */
export const isStopWord = text => STOP_WORDS.has(keyOf(text))
