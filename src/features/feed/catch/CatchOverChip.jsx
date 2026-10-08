// Чип поверх шариков-спойлера по центру фразы (feed-catch.css: .catchOverChip): «Проверь, что услышал».
// Тап → onOpen (шторка набора). Пока шторка открыта (hidden) чип гаснет — фраза под ней всё равно не видна.
export default function CatchOverChip({ hidden = false, onOpen }) {
  return (
    <button
      type="button"
      className={`catchOverChip${hidden ? ' catchOverChipHidden' : ''}`}
      onClick={e => { e.stopPropagation(); onOpen() }}
      tabIndex={hidden ? -1 : 0}
    >
      Проверь, что услышал
    </button>
  )
}
