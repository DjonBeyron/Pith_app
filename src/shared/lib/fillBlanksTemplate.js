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
