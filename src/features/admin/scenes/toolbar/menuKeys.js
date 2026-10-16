// Клавиши меню «Ещё» / «Озвучить ▾» (ToolbarOverflowMenu) — чистое решение, что делать по клавише.
// Закрыто: ↓ открывает. Открыто: Esc закрывает (и возвращает фокус на кнопку; Esc окна при этом не
// срабатывает), ↓/↑/Home/End ходят по пунктам, Tab закрывает без возврата фокуса. Тест — toolbar.test.jsx.
export function menuKeyAction(key, open) {
  if (!open) return key === 'ArrowDown' ? 'open' : null
  switch (key) {
    case 'Escape': return 'close'
    case 'ArrowDown': return 'next'
    case 'ArrowUp': return 'prev'
    case 'Home': return 'first'
    case 'End': return 'last'
    case 'Tab': return 'tab'
    default: return null
  }
}
