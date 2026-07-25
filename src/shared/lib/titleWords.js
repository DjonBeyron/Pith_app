// Разбиение названия модуля на слова для пословного перевода.
// Слово — цепочка букв/цифр, возможно с дефисом или апострофом внутри
// (don't, well-known). Знаки препинания и пробелы словами не считаются, но
// сохраняются как «разделители», чтобы фразу можно было отрисовать целиком.
const WORD_RE = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu

// [{ text, word: true, index }, { text: ', ', word: false }, ...]
export function splitTitleTokens(title) {
  const src = String(title ?? '')
  const tokens = []
  let last = 0
  let wordIndex = 0
  for (const m of src.matchAll(WORD_RE)) {
    if (m.index > last) tokens.push({ text: src.slice(last, m.index), word: false })
    tokens.push({ text: m[0], word: true, index: wordIndex++ })
    last = m.index + m[0].length
  }
  if (last < src.length) tokens.push({ text: src.slice(last), word: false })
  return tokens
}

// Только слова, по порядку
export function titleWords(title) {
  return splitTitleTokens(title).filter(t => t.word).map(t => t.text)
}

function sameWord(a, b) {
  return String(a ?? '').toLocaleLowerCase() === String(b ?? '').toLocaleLowerCase()
}

// Перевод слова из сохранённого массива [{ w, t }]: сначала по позиции (слова
// хранятся в порядке названия), а если название с тех пор поменяли — по
// самому слову. Так правка «привет мир» → «привет, мир!» не теряет переводы.
export function wordTranslation(entries, word, index) {
  if (!Array.isArray(entries)) return ''
  const atIndex = entries[index]
  if (atIndex && sameWord(atIndex.w, word)) return atIndex.t ?? ''
  const found = entries.find(e => sameWord(e?.w, word))
  return found?.t ?? ''
}

// Строки редактора: по одному полю на каждое слово названия, уже заполненные
// ранее сохранёнными переводами
export function buildWordRows(title, entries) {
  return titleWords(title).map((w, i) => ({ w, t: wordTranslation(entries, w, i) }))
}

// Пересборка строк редактора при правке названия. Если количество слов не
// изменилось — считаем, что слово просто переписали на том же месте, и перевод
// сохраняем (иначе перевод стирался бы на каждую букву при правке слова).
// Если слов стало больше/меньше — переводы подтягиваются по самим словам.
export function remapWordRows(title, prev) {
  const words = titleWords(title)
  const prevRows = Array.isArray(prev) ? prev : []
  if (words.length === prevRows.length) {
    return words.map((w, i) => ({ w, t: prevRows[i]?.t ?? '' }))
  }
  return buildWordRows(title, prevRows)
}

// Есть ли хоть один непустой перевод — если нет, в ленте слова не кликабельны
export function hasWordTranslations(entries) {
  return Array.isArray(entries) && entries.some(e => (e?.t ?? '').trim() !== '')
}
