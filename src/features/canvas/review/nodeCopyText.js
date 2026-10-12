// Текст ноды для кнопки «копировать» в разборе урока: всё, что ученик читает или слышит, одной строкой/блоком. Формат нод — обмена ({ type, data }).
const cellsText = t => {
  const cells = t?.cells ?? []
  const rows = new Map()
  for (const c of cells) rows.set(c.row, [...(rows.get(c.row) ?? []), c])
  return [...rows].sort((a, b) => a[0] - b[0]).map(([, r]) => r.sort((a, b) => a.col - b.col).map(c => c.value ?? '').join('\t')).join('\n')
}

export function nodeCopyText(n) {
  const d = n?.data ?? {}
  const parts = []
  if (n.type === 'table') {
    if (d.chatCaption) parts.push(d.chatCaption)
    parts.push(cellsText(d.table))
    if (d.script) parts.push(d.script)
  } else if (n.type === 'word_choice') parts.push((d.options ?? []).map(o => `${o.isCorrect ? '✓' : '✗'} ${o.text}`).join('\n'))
  else if (n.type === 'phrase_assembly') parts.push((d.words ?? []).join(' '))
  else if (n.type === 'type_word') parts.push(d.word ?? '')
  else if (n.type === 'say_phrase') parts.push(d.phrase ?? d.pattern ?? '')
  else if (n.type === 'reaction') parts.push(d.emoji ?? '')
  else if (n.type === 'sticker') parts.push(d.imagePrompt ?? '')
  else parts.push(d.content ?? d.text ?? d.caption ?? d.script ?? '')
  return parts.filter(Boolean).join('\n')
}
