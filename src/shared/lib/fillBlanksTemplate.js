// Разбор шаблона фразы ноды «Составь предложение» (fill_blanks).
//
// Пропуск в тексте — ровно три подчёркивания подряд ("___"), буквально как их
// пишет автор в текстовом поле. Пропуск может стоять отдельным словом
// («She ___ to cook») или внутри слова без пробелов («tr___s» — буквенный
// пропуск на орфографию y → ies). Для разбора шаблона это ОДНА и та же
// механика: строка режется по маркеру, и между кусками текста остаются
// метки-пропуски по порядку слева направо — 0-й маркер соответствует
// blanks[0], 1-й — blanks[1] и т.д. (см. typeData.fill_blanks в PROJECT.md).
//
// Чистая логика, без React/DOM — используется и редактором ноды
// (NodeFillBlanksPicker.jsx), и панелью плеера (FillBlanksPanel.jsx,
// fillBlanksCheck.js).

const MARKER = '___'

// Шаблон → список сегментов по порядку: {type:'text', value} — кусок текста
// как есть, {type:'blank', index} — пропуск (index — порядковый номер, он же
// индекс в массиве blanks[]).
export function parseTemplateSegments(template) {
  const parts = (template ?? '').split(MARKER)
  const segments = []
  parts.forEach((chunk, i) => {
    if (chunk) segments.push({ type: 'text', value: chunk })
    if (i < parts.length - 1) segments.push({ type: 'blank', index: i })
  })
  return segments
}

// Сколько пропусков в шаблоне — этому числу должна соответствовать длина
// массива blanks[]
export function countBlanks(template) {
  return parseTemplateSegments(template).filter(s => s.type === 'blank').length
}

// 'letters' — пропуск ВНУТРИ слова, без пробела хотя бы с одной стороны
// («tr___s»); 'word' — пропуск отдельным словом, с обеих сторон граница
// (пробел или край фразы, «She ___ to»). Нужно только для вида плейсхолдера
// незаполненного пропуска (см. FillBlanksPanel.jsx/FillBlank.jsx) — 2 точки
// для буквенного, 5 для словесного, по просьбе автора урока.
export function blankKind(template, blankIndex) {
  const segments = parseTemplateSegments(template)
  const pos = segments.findIndex(s => s.type === 'blank' && s.index === blankIndex)
  if (pos < 0) return 'word'
  const before = pos > 0 ? segments[pos - 1] : null
  const after  = pos < segments.length - 1 ? segments[pos + 1] : null
  const beforeChar = before?.type === 'text' ? before.value.slice(-1) : ''
  const afterChar  = after?.type  === 'text' ? after.value.slice(0, 1) : ''
  const touchesWord = ch => !!ch && !/\s/.test(ch)
  return (touchesWord(beforeChar) || touchesWord(afterChar)) ? 'letters' : 'word'
}

// Шаблон целиком с подставленными значениями. values — функция (index) =>
// текст для пропуска (или объект/массив с тем же интерфейсом через обёртку
// вызывающей стороны). Общая сборка для «раскрыть верный ответ» и «фраза,
// которую собрал ученик».
function renderTemplate(template, valueOf) {
  return parseTemplateSegments(template)
    .map(s => (s.type === 'text' ? s.value : (valueOf(s.index) ?? '')))
    .join('')
}

// Полное раскрытие верного ответа — все пропуски заменены на blanks[i].answer.
// Показывается ученику подсказкой учителя после третьей неверной попытки.
export function buildRevealedText(template, blanks) {
  return renderTemplate(template, i => blanks?.[i]?.answer)
}

// Та же сборка, но значениями, которые выбрал ученик (picked: {index: text}) —
// пригодится для статистики ответа. Незаполненный пропуск остаётся маркером,
// чтобы не выдавать частично собранную фразу за осмысленный текст.
export function buildPickedText(template, picked) {
  return renderTemplate(template, i => (picked?.[i] != null ? picked[i] : MARKER))
}
