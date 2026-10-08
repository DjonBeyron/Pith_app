// Чип вместо шариков (feed-catch.css: .catchOverChip): «Проверь, что услышал». Шариков под ним нет вовсе — FeedSlide
// кладёт на место спойлера невидимую копию фразы (.catchPhraseGhost), а чип растянут на всю ширину этого блока
// (обёртка .catchSpoilerWrap сжата по фразе, чип absolute left/right 0), текст по центру. Тап → onOpen (шторка набора).
// Пока шторка открыта (hidden) чип гаснет — фраза под ней всё равно не видна.
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
