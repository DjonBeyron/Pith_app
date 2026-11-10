// Ловушки «честного зачёта слова» (wordEarRule.js): слова-соседи цели в грамматике Vosk. Без них распознаватель выбирает только между целью и [unk] и отдаёт цель на любой её обрубок с conf 1
// (замер v3.3.183, настоящий Vosk small EN, espeak 3 голоса: «mil» → milk, «wat» → water, «remem» → remember, «yester» → yesterday). С ловушками у обрубка появляется своё слово, и итог честный.
//  • ОДИНОЧНЫЕ: начала слова от PREFIX_MIN букв до длины − 1 и их варианты с типовым концом (+e, +y, +s, +h, удвоение: «mil» → mill, mile, mils; «win» → wine, wins, winn; «beaut» → beauty).
//    Начало берём, только если оно кончается согласной («mil», «win», «wat», «yes»): начало на гласную («boo», «tre», «ca», «wa») читается с ДРУГИМ гласным, обрубок не ловит, а целое
//    короткое слово перехватывало (water → «wah», cat → [unk]). Поэтому у слов из 3 букв (cat, dog) и у book, tree ловушек нет: «ca…» без «t» от «cat» эта модель не отличает
//    (слова с тем же кратким гласным на конце в английском нет) — см. bare в wordEarRule.js.
//  • ДВОЙНЫЕ («делим слово на части»): начало, разбитое на два слова — «yes ter», «to ge», «re mem», «inter est»: обрубок, для которого одного слова-соседа нет, Vosk собирает из двух.
//    Вторая часть кончается не дальше PAIR_SHARE длины слова: пара, покрывающая почти всё слово, звучит как оно само («win do» = window) и перехватывала бы целое слово.
//  • Слов, которых нет в словаре модели (152 тыс. слов у small EN), Vosk молча не берёт — поэтому варианты генерируются с запасом, без своего словаря в приложении.
//  • Ловушка не должна совпасть ни с целью, ни со словом внутри фразы-цели (иначе «to» из «to learn» вырезалось бы из разбора).
// Русская модель — как раньше: только начала (от 3 букв до длины − 2) у слов от 6 букв и 2 слогов (двойные и короткие слова на русской модели не замерялись).
export const EAR_GRAMMAR_MAX = 240 // ловушек в грамматике не больше (поровну на каждую цель-слово)
export const PAIR_SHARE = 0.75     // двойная ловушка покрывает не больше этой доли букв слова
export const PREFIX_MIN = 3        // начало-ловушка — не короче стольких букв
const TAILS = ['', 'e', 'y', 's', 'h']
const VOWELS = { en: /[aeiouy]+/g, ru: /[аеёиоуыэюя]+/g }

/** Слоги слова (группы гласных; английское немое «e» на конце не считается) */
export function syllables(word, lang = 'en') {
  const w = String(word ?? '').toLowerCase().replace(lang === 'ru' ? /[^а-яё]/g : /[^a-z]/g, '')
  if (!w) return 0
  const n = (w.match(lang === 'ru' ? VOWELS.ru : VOWELS.en) ?? []).length
  return Math.max(1, lang !== 'ru' && /[^aeiouy]e$/.test(w) && !/le$/.test(w) ? n - 1 : n)
}
export const single = t => !/\s/.test(String(t ?? '').trim())
/** Цель → как её пишет Vosk: строчными, без знаков */
export const normWord = t => String(t ?? '').toLowerCase().trim().replace(/[.,!?;:"«»]+/g, '')
const variants = p => [...TAILS.map(t => p + t), p + p.at(-1)]

/** Ловушки одного слова: [одиночные (от длинных начал к коротким), двойные] */
function wordDecoys(w, lang) {
  if (lang === 'ru') {
    const one = []
    if (w.length >= 6 && syllables(w, 'ru') >= 2) for (let n = w.length - 2; n >= 3; n--) one.push(w.slice(0, n))
    return [one, []]
  }
  const one = [], two = []
  for (let n = w.length - 1; n >= PREFIX_MIN; n--) if (!/[aeiouy]$/.test(w.slice(0, n))) one.push(...variants(w.slice(0, n)))
  for (let i = 2; i <= w.length - 3; i++) for (let j = i + 2; j <= Math.floor(w.length * PAIR_SHARE); j++) two.push(...variants(w.slice(i, j)).map(b => `${w.slice(0, i)} ${b}`))
  return [one, two]
}

/**
 * Ловушки для целей: фразы грамматики (одно или два слова). ownWords — слова целей во всех записях («i'm» и «i am»): ни одна ловушка их не содержит.
 * Цели-фразы ловушек не получают. Не больше EAR_GRAMMAR_MAX на грамматику — поровну на цель, сначала одиночные.
 */
export function earDecoys(targets, lang = 'en', ownWords = []) {
  const letters = lang === 'ru' ? /^[а-яё]+$/ : /^[a-z]+$/
  const own = new Set([...targets.flatMap(t => normWord(t).split(/\s+/)), ...ownWords.map(normWord)])
  const words = [...new Set(targets.map(normWord).filter(w => single(w) && letters.test(w) && w.length > PREFIX_MIN))]
  const per = Math.floor(EAR_GRAMMAR_MAX / Math.max(1, words.length))
  const out = new Set()
  for (const w of words) {
    const [one, two] = wordDecoys(w, lang)
    let n = 0
    for (const d of [...one, ...two]) { if (n >= per) break; if (out.has(d) || d.split(' ').some(x => own.has(x))) continue; out.add(d); n++ }
  }
  return [...out]
}

/** Грамматика с ловушками: base — грамматика целей (JSON-массив вариантов), ловушки — отдельными вариантами (обрубок говорят один раз) */
export function earGrammar(base, decoys) {
  if (!base || !decoys?.length) return base
  try { const list = JSON.parse(base); return JSON.stringify([...list, ...decoys.filter(d => !list.includes(d))]) } catch { return base }
}
