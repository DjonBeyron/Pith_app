// Текст ноды правят вводом с клавиатуры (печать/Backspace/Delete/автозамена/
// IME), а не только вставкой смайлика — но React onChange textarea не говорит
// напрямую, что именно изменилось. diffTextEdit сравнивает текст до/после
// правки и, опираясь на позицию каретки СРАЗУ ПОСЛЕ правки, восстанавливает
// {start, end, insertedLength} — тройку, которую ждёт shiftHighlights().
//
// Каретка после правки нужна, чтобы разрулить повторяющиеся символы: если в
// "аааа" напечатать ещё одну "а" посередине, общий префикс/суффикс сам по
// себе не покажет, где именно случилась вставка — а каретка показывает.
export function diffTextEdit(oldText, newText, postCaret) {
  if (oldText === newText) return { start: 0, end: 0, insertedLength: 0 }
  const delta = newText.length - oldText.length
  const j = Math.min(postCaret ?? newText.length, newText.length)
  const oldEnd = j - delta
  let prefix = 0
  const max = Math.min(oldText.length, newText.length)
  while (prefix < max && oldText[prefix] === newText[prefix]) prefix++
  const start = Math.max(0, Math.min(prefix, j, oldEnd))
  return { start, end: Math.max(start, oldEnd), insertedLength: Math.max(0, j - start) }
}
