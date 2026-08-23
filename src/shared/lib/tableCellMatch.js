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

// Разбор ответа на токены: слова, найденные в таблице → cell, остальные →
// extra. Каждая ячейка занимается один раз (повтор слова требует второй
// ячейки или уходит в extra). У токена ячейки value — слово ИЗ ОТВЕТА: для
// особой ячейки это конкретный вариант, а не весь её текст.
export function deriveAnswerTokens(answer, cells) {
  const words = (answer ?? '').trim().split(/\s+/).filter(Boolean)
  const usedIds = new Set()
  return words.map(word => {
    const cell = (cells ?? []).find(c => !usedIds.has(c.id) && cellMatchesWord(c, word))
    if (!cell) return { type: 'extra', value: word }
    usedIds.add(cell.id)
    return { type: 'cell', cellId: cell.id, value: word }
  })
}
