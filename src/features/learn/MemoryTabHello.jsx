// Строка над нижней панелью, когда у нового пользователя появилась вкладка «Память» (memoryTab.js:
// висит HELLO_MS, потом хук её убирает). Стили — memory-tab.css. Не ловит касания
export default function MemoryTabHello({ show }) {
  if (!show) return null
  return <div className="memTabHello" role="status">Здесь твои слова не потеряются</div>
}
