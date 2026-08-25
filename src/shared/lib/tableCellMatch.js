// Как слово из «правильного ответа» связывается с ячейкой таблицы.
//
// Раньше сравнивали строго с текстом ячейки. С особыми значениями это ломалось:
// ячейка «he/she/it» со списком вариантов не находилась для слова «he» — слово
// уходило в чипы «вне таблицы», а сама ячейка выпадала из сборки. Теперь слово
// подходит ячейке, если совпадает её текст ИЛИ любой из её вариантов.
//
// Общий модуль: одну и ту же связь считают обе панели плеера (диктор и ручной
// режим) и редактор таймлайна — иначе урок и монтаж разъезжаются.

// Сверяем по смыслу: регистр, лишние пробелы и вид апострофа значения не имеют
export function normalizeAnswerText(text) {
  return (text ?? '')
    .replace(/[\u2018\u2019\u02BC\u00B4`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function cellMatchesWord(cell, word) {
  const w = normalizeAnswerText(word)
  if (!w) return false
  if (normalizeAnswerText(cell?.value) === w) return true
  return (cell?.options ?? []).some(o => normalizeAnswerText(o) === w)
}

// Из скольких слов состоит самая «длинная» ячейка таблицы: дальше этой длины
// фразу в ответе искать незачем
function maxCellWords(cells) {
  let max = 1
  for (const c of cells ?? []) {
    for (const text of [c?.value, ...(c?.options ?? [])]) {
      const n = normalizeAnswerText(text).split(' ').filter(Boolean).length
      if (n > max) max = n
    }
  }
  return max
}

// Разбор ответа на токены: куски, найденные в таблице → cell, остальные →
// extra. Каждая ячейка занимается один раз (повтор слова требует второй
// ячейки или уходит в extra). У токена ячейки value — текст ИЗ ОТВЕТА: для
// особой ячейки это конкретный вариант, а не весь её текст.
//
// Ячейка может содержать НЕСКОЛЬКО слов («will try»). Раньше ответ резался
// строго по словам, такая ячейка не находилась ни для «will», ни для «try», и
// оба слова уезжали в чипы: в ручном режиме таблица уходила с экрана сразу
// после первой ячейки, а собрать «will try» было негде. Поэтому идём жадно —
// сначала пробуем самую длинную фразу, потом всё более короткую.
export function deriveAnswerTokens(answer, cells) {
  const words = (answer ?? '').trim().split(/\s+/).filter(Boolean)
  const usedIds = new Set()
  const maxLen = maxCellWords(cells)
  const tokens = []
  for (let i = 0; i < words.length;) {
    let found = null
    for (let len = Math.min(maxLen, words.length - i); len >= 1 && !found; len--) {
      const phrase = words.slice(i, i + len).join(' ')
      const cell = (cells ?? []).find(c => !usedIds.has(c.id) && cellMatchesWord(c, phrase))
      if (cell) found = { cell, len, phrase }
    }
    if (!found) {
      tokens.push({ type: 'extra', value: words[i] })
      i += 1
      continue
    }
    usedIds.add(found.cell.id)
    tokens.push({ type: 'cell', cellId: found.cell.id, value: found.phrase })
    i += found.len
  }
  return tokens
}
