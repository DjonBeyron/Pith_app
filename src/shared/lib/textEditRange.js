// Границы правки для управляемого ввода в contenteditable (rich-text): что
// именно съедает Backspace/Delete/Ctrl+Backspace в СТРОКЕ МОДЕЛИ, без опоры
// на DOM. Нужно потому, что правку мы делаем сами, а браузеру трогать
// разметку запрещаем (см. useRichTextEdit.js).

// Backspace: суррогатная пара (эмодзи) — это два code unit, но один символ
export function prevCharStart(text, i) {
  if (i <= 0) return 0
  const c = text.charCodeAt(i - 1)
  return c >= 0xDC00 && c <= 0xDFFF && i >= 2 ? i - 2 : i - 1
}

export function nextCharEnd(text, i) {
  if (i >= text.length) return text.length
  const c = text.charCodeAt(i)
  return c >= 0xD800 && c <= 0xDBFF && i + 2 <= text.length ? i + 2 : i + 1
}

// Ctrl+Backspace: сначала пробелы перед кареткой, потом само слово
export function wordStart(text, i) {
  let j = i
  while (j > 0 && /\s/.test(text[j - 1])) j--
  while (j > 0 && !/\s/.test(text[j - 1])) j--
  return j
}

export function wordEnd(text, i) {
  let j = i
  while (j < text.length && /\s/.test(text[j])) j++
  while (j < text.length && !/\s/.test(text[j])) j++
  return j
}

// Ctrl+Shift+Backspace / Cmd+Backspace — до начала (конца) строки
export function lineStart(text, i) {
  return text.lastIndexOf('\n', i - 1) + 1
}

export function lineEnd(text, i) {
  const nl = text.indexOf('\n', i)
  return nl === -1 ? text.length : nl
}
