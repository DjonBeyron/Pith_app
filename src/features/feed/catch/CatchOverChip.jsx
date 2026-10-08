import { MARGIN_X } from '../phraseBubbleDraw.js'

// Чип поверх шариков-спойлера (feed-catch.css: .catchOverChip): «Проверь, что услышал». Растянут на всю ширину
// области шариков — обёртка .catchSpoilerWrap сжата по спойлеру, чип absolute left/right с выносом на MARGIN_X
// (canvas шире текста ровно на столько), текст по центру. Тап → onOpen (шторка набора). Пока шторка открыта
// (hidden) чип гаснет — фраза под ней всё равно не видна.
export default function CatchOverChip({ hidden = false, onOpen }) {
  return (
    <button
      type="button"
      className={`catchOverChip${hidden ? ' catchOverChipHidden' : ''}`}
      style={{ left: -MARGIN_X, right: -MARGIN_X }}
      onClick={e => { e.stopPropagation(); onOpen() }}
      tabIndex={hidden ? -1 : 0}
    >
      Проверь, что услышал
    </button>
  )
}
