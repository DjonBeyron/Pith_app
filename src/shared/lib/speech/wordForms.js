// Ошибочные и «родственные» формы слова (try → tried / tries / trying; cats → cat). Нужны: пробе «Голос» (ошибочные фразы для эксперимента против «домысливания»)
// и закрытому словарю Vosk модуля «Сказать фразу» (sayVoskGrammar.js). Чистые функции. «Семья» слов — wordFamily.js: сгенерированные по правилам формы
// проверяем через sameFamily, чтобы правило «первое увиденное» (firstSeenRule.js) считало их тем же словом, а не чужим.
import { sameFamily } from './wordFamily.js'

// Типичные ошибки учеников: слово эталона → чем его подменяют
const WRONG = {
  trying: ['try', 'tried', 'tries'], tried: ['try', 'trying'], tries: ['try', 'trying'],
  going: ['go', 'goes', 'went'], goes: ['go', 'going'], go: ['goes', 'going'], went: ['go', 'goed'],
  am: ['is', 'are'], is: ['are', 'am'], are: ['is', 'am'],
  has: ['have'], have: ['has'], had: ['have'], was: ['were'], were: ['was'],
  does: ['do'], do: ['does'], doing: ['do', 'does'], "doesn't": ["don't"], "don't": ["doesn't"],
  want: ['wants'], wants: ['want'], like: ['likes'], likes: ['like'], children: ['childs'], people: ['peoples'],
}
const NO_S = new Set(['this', 'his', 'always', 'perhaps', 'its', 'yes', 'across', 'unless', 'sometimes'])

// Неправильные глаголы: слово из группы → остальные члены группы (в таблице WRONG есть не всё)
const IRREGULAR = [
  ['see', 'sees', 'saw', 'seen', 'seeing'], ['take', 'takes', 'took', 'taken', 'taking'], ['make', 'makes', 'made', 'making'],
  ['eat', 'eats', 'ate', 'eaten', 'eating'], ['write', 'writes', 'wrote', 'written', 'writing'], ['come', 'comes', 'came', 'coming'],
  ['buy', 'buys', 'bought', 'buying'], ['get', 'gets', 'got', 'getting'], ['give', 'gives', 'gave', 'given', 'giving'],
  ['know', 'knows', 'knew', 'known', 'knowing'], ['say', 'says', 'said', 'saying'], ['tell', 'tells', 'told', 'telling'],
  ['find', 'finds', 'found', 'finding'], ['run', 'runs', 'ran', 'running'], ['speak', 'speaks', 'spoke', 'spoken', 'speaking'],
  ['drink', 'drinks', 'drank', 'drunk', 'drinking'], ['sit', 'sits', 'sat', 'sitting'], ['think', 'thinks', 'thought', 'thinking'],
]
// Формы из таблицы WRONG, которых нет в словаре распознавателя (Vosk молча выкинет слово из фразы) — в закрытый словарь их не кладём
const NOT_WORDS = new Set(['goed', 'childs', 'peoples'])

export const coreOf = w => String(w ?? '').toLowerCase().replace(/[^a-z']/g, '')

/** Ошибочные формы ОДНОГО слова (по таблице, затем по суффиксам -ing / -ed / -s). Не знаем слово — [] */
export function wrongFormsOfWord(word) {
  const w = coreOf(word)
  if (WRONG[w]) return [...WRONG[w]]
  const out = []
  if (w.length > 4 && w.endsWith('ing')) {
    let stem = w.slice(0, -3)
    if (/([b-df-hj-np-tv-z])\1$/.test(stem)) stem = stem.slice(0, -1) // running → run
    out.push(stem)
  } else if (w.length > 4 && w.endsWith('ed')) out.push(w.slice(0, -2).replace(/([b-df-hj-np-tv-z])\1$/, '$1'))
  else if (w.length >= 5 && w.endsWith('s') && !/(ss|us|is)$/.test(w) && !NO_S.has(w)) out.push(w.slice(0, -1))
  return out.filter(x => x.length > 1 && x !== w)
}

// Прибавить окончание к основе по обычным правилам: try+s → tries, like+ed → liked, play+ing → playing, stop+ed → stopped (короткие слова с одной гласной)
function addSuffix(w, suf) {
  const last = w.at(-1)
  if (suf === 's') {
    if (/[^aeiou]y$/.test(w)) return `${w.slice(0, -1)}ies`
    return /(s|x|z|ch|sh|o)$/.test(w) ? `${w}es` : `${w}s`
  }
  if (suf === 'ed') {
    if (/[^aeiou]y$/.test(w)) return `${w.slice(0, -1)}ied`
    if (last === 'e') return `${w}d`
    return /^[^aeiou]*[aeiou][^aeiouwxy]$/.test(w) && w.length <= 4 ? `${w}${last}ed` : `${w}ed`
  }
  if (last === 'e' && !w.endsWith('ee')) return `${w.slice(0, -1)}ing`
  return /^[^aeiou]*[aeiou][^aeiouwxy]$/.test(w) && w.length <= 4 ? `${w}${last}ing` : `${w}ing`
}

// Служебные слова: от них «-ed / -ing» не строим (the → thing — бессмыслица); только то, что есть в таблице WRONG (am → is / are)
const FUNCTION_WORDS = new Set(('the and but for from with into onto than then them they their there here this that these those what who whom whose where when why how '
  + 'you your yours him his her hers its our ours not yes can will would should could may might must very too also just some any every each both all').split(' '))

/**
 * ВСЕ другие формы слова для закрытого словаря. Таблица WRONG (trying → try / tried / tries) главнее всего; затем неправильные глаголы (see → saw / seen);
 * слово на -s (cats, plays) — только форма без -s; уже -ing / -ed — формы от wrongFormsOfWord; остальное — обычные -s / -ed / -ing (play → plays / played / playing).
 * Формы по правилам обязаны быть из одной «семьи» (sameFamily). Само слово и дубли не повторяются. Короткие слова (до 2 букв), служебные слова и слова с цифрами — [].
 */
export function formsOfWord(word) {
  const w = coreOf(word)
  if (!/^[a-z]{3,}$/.test(w) && !WRONG[w]) return [] // «i'm», «it's» и слова с цифрами не трогаем (кроме doesn't / don't из таблицы)
  const fromTable = wrongFormsOfWord(w)
  const ok = x => x && x !== w && x.length > 1 && !NOT_WORDS.has(x)
  if (WRONG[w]) return [...new Set(fromTable)].filter(ok)
  const group = IRREGULAR.find(g => g.includes(w))
  if (group) return group.filter(x => x !== w && ok(x))
  const out = [...fromTable]
  if (FUNCTION_WORDS.has(w)) return []
  if (w.length >= 4 && w.endsWith('s') && !/(ss|us|is)$/.test(w) && !NO_S.has(w)) out.push(w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.slice(0, -1))
  else if (!/[^aeiou]ing$/.test(w) && !w.endsWith('ed') && !w.endsWith('s')) out.push(addSuffix(w, 's'), addSuffix(w, 'ed'), addSuffix(w, 'ing'))
  return [...new Set(out.filter(x => fromTable.includes(x) || sameFamily(x, w)))].filter(ok)
}

/** Слово уже в «изменённой» форме, про которую есть что сказать (trying, goes, cats, saw, am): таблица, неправильные глаголы, -ing / -ed / -s. Для слов без ключевых слов шага */
export const isInflectedWord = word => {
  const w = coreOf(word)
  return !!WRONG[w] || IRREGULAR.some(g => g.includes(w)) || (/^[a-z]{4,}$/.test(w) && wrongFormsOfWord(w).length > 0) || (/^[a-z]{3,}s$/.test(w) && !/(ss|us|is)$/.test(w) && !NO_S.has(w))
}
