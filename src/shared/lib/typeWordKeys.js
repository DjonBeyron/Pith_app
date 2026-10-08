import { normalizeAnswerText } from './tableCellMatch.js'

// Чистая логика модуля «Напечатай слово» — без React и DOM, проверяется обычными
// юнит-тестами (typeWordKeys.test.js). Нужна и плееру (панель), и редактору (пикер
// ноды). Ученик печатает слово на клавиатуре как на iPhone, но «светятся»
// (нажимаются) только буквы самого слова и те лишние, что автор добавил вручную
// (extraLetters); остальные — тусклые и мёртвые.

// Раскладки: латиница для английских слов, кириллица — если в слове есть русские буквы
const ROWS = {
  en: ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'],
  ru: ['йцукенгшщзхъ', 'фывапролджэ', 'ячсмитьбю'],
}

const isCyrillic = text => /[а-яё]/i.test(text)

// Знаки, которые автор мог вписать в «дополнительные буквы» просто как разделитель
const SEPARATORS = /[\s,;]/g

// Слово как его сравнивает проверка: нижний регистр, одинаковые кавычки, один пробел
const wordChars = word => [...normalizeAnswerText(word)]

// Дополнительные буквы автора — уникальные символы без разделителей, нижний регистр
export function cleanExtraLetters(extra) {
  return [...new Set([...normalizeAnswerText(extra).replace(SEPARATORS, '')])].join('')
}

// Какая раскладка нужна слову (и его дополнительным буквам)
export function layoutOf(word, extra = '') {
  return isCyrillic(`${word}${extra}`) ? 'ru' : 'en'
}

// Все «светящиеся» символы: буквы слова + дополнительные (пробел сюда тоже входит)
export function litChars(word, extra = '') {
  return new Set([...wordChars(word), ...cleanExtraLetters(extra)])
}

// Модель клавиатуры: ряды букв основной раскладки. Всё, чего в раскладке нет (апостроф, дефис, é/ñ/ё…), встаёт
// в НАЧАЛО последнего ряда — слева от «z» (у кириллицы слева от «я»), отдельного нижнего ряда для знаков нет:
// число рядов клавиш всегда три, и высота панели не зависит от слова. Нижний ряд — только пробел, если он нужен слову
// (space). Ряды всегда одни и те же для одного слова, поэтому панель не меняет высоту по ходу ответа.
export function keyboardModel(word, extra = '') {
  const lit = litChars(word, extra)
  const base = ROWS[layoutOf(word, extra)]
  const inBase = new Set(base.join(''))
  // lure — клавиша светится, но её нет в слове (лишняя буква автора / запутыватель ленты)
  const own = new Set(wordChars(word))
  const lure = ch => lit.has(ch) && !own.has(ch)
  const key = ch => ({ ch, lit: lit.has(ch), lure: lure(ch) })
  const rows = base.map(row => [...row].map(key))
  const extraKeys = [...lit].filter(ch => ch !== ' ' && !inBase.has(ch)).map(key)
  const lastIdx = rows.length - 1
  rows[lastIdx] = [...extraKeys, ...rows[lastIdx]]
  return {
    rows,
    // Сколько клавиш в последнем ряду стало сверх раскладки (знаки слева от «z»): панель сдвигает такой ряд левее,
    // чтобы он поместился рядом с «Стереть» (TypeWordKeyboard, .twRowLong)
    lastExtra: extraKeys.length,
    // Сколько клавиш в самом длинном ряду: от этого зависит ширина КАЖДОЙ клавиши (как на iPhone —
    // короткие ряды не растягиваются, а встают по центру). Последний ряд считается вместе со «Стереть» (1.5 клавиши):
    // удлинённый знаками ряд не заходит под неё
    cols: Math.max(...rows.map(row => row.length), Math.ceil(rows[lastIdx].length + 1.5)),
    space: lit.has(' '),
  }
}

// Сколько символов можно напечатать: слово плюс запас на опечатки, чтобы строка не росла бесконечно
export function typedMax(word) {
  return normalizeAnswerText(word).length + 3
}

// То же для «Ловли слов» (лента): запас всего одна буква — длина слова (апостроф, дефис, пробел считаются символами,
// как в typedMax) + 1. Плеер «Напечатай слово» по-прежнему берёт typedMax (+3)
export function catchTypedMax(word) {
  return normalizeAnswerText(word).length + 1
}

// Заглавная первая буква (слово «ß» и подобные, у которых заглавная — две буквы, не трогаем)
export function capitalizeFirst(text) {
  const first = text.charAt(0)
  const up = first.toLocaleUpperCase()
  return up.length === first.length ? up + text.slice(1) : text
}

// «Шифт» клавиатуры: следующая буква будет заглавной — пока ничего не набрано (и заглавная вообще нужна).
// Одно правило на плеер («Напечатай слово»: заглавная только первая буква всей строки, остальные — строчные,
// даже после пробела) и ленту («Ловля слов»: capitalize — только у первого слова фразы); appendChar печатает
// ровно так же, поэтому подписи клавиш и набранный текст не расходятся
export function needsShift(typed, { capitalize = true } = {}) {
  return capitalize && typed === ''
}

// Печать символа: мёртвые клавиши и переполнение игнорируются, пробел — не первым и не двойным.
// Первая напечатанная буква — заглавная (как в начале предложения); capitalize: false (лента, не первое слово
// фразы) оставляет её как есть
export function appendChar(typed, ch, max, { capitalize = true } = {}) {
  if (typed.length >= max) return typed
  if (ch === ' ' && (typed === '' || typed.endsWith(' '))) return typed
  if (typed !== '') return typed + ch
  return capitalize ? capitalizeFirst(ch) : ch
}

export function removeLast(typed) {
  return typed.slice(0, -1)
}

// Верно ли напечатано: регистр и вид апострофа не важны
export function typedMatches(typed, word) {
  const expected = normalizeAnswerText(word)
  return expected !== '' && normalizeAnswerText(typed) === expected
}

// Буквы слова без пробелов и без учёта регистра — по ним считаются слоты сигналов ошибок
// (слот = позиция буквы, см. typeWordSlots в signalSlots.js)
export const wordLetters = text => [...normalizeAnswerText(text).replace(/\s/g, '')]

// Первая НЕВЕРНАЯ буква напечатанного — слот сигнала ошибки автора (signals[].slot). Смотрим
// только на буквы, которые есть и у ученика, и в слове: «tr» вместо «tries» или лишняя буква
// в конце — это не ошибка в конкретной букве, а обычная неверная попытка (null).
// Возвращает позицию буквы (без пробелов) или null
export function typedMismatchSlot(typed, word) {
  const got = wordLetters(typed)
  const want = wordLetters(word)
  const n = Math.min(got.length, want.length)
  for (let i = 0; i < n; i++) if (got[i] !== want[i]) return i
  return null
}

// Сколько в слове букв (без пробелов) — для подсказки «слово из N букв»
export function letterCount(word) {
  return normalizeAnswerText(word).replace(/\s/g, '').length
}

export function letterForm(n) {
  const m10 = n % 10, m100 = n % 100
  if (m100 >= 11 && m100 <= 14) return 'букв'
  if (m10 === 1) return 'буква'
  if (m10 >= 2 && m10 <= 4) return 'буквы'
  return 'букв'
}
