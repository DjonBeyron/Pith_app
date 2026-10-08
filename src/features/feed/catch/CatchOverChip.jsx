// Чип вместо шариков (feed-catch.css: .catchOverChip): две строки по центру сразу, без смены текста — «Проверь» и
// «всё ли удалось услышать». Шариков под ним нет вовсе — FeedSlide кладёт на место спойлера невидимую копию фразы
// (.catchPhraseGhost), а чип растянут на всю ширину этого блока (обёртка .catchSpoilerWrap сжата по фразе, высота не
// меньше чипа, чип absolute left/right 0), обрезания текста нет. Тап → onOpen (шторка набора). Размер чипа от текста
// не зависит — ширина по блоку фразы, высота задана в CSS. Пока шторка открыта (hidden) чип гаснет — фраза под ней
// всё равно не видна.
export default function CatchOverChip({ hidden = false, onOpen }) {
  return (
    <button
      type="button"
      className={`catchOverChip${hidden ? ' catchOverChipHidden' : ''}`}
      aria-label="Проверь, всё ли удалось услышать."
      onClick={e => { e.stopPropagation(); onOpen() }}
      tabIndex={hidden ? -1 : 0}
    >
      <span className="catchChipLine" aria-hidden="true">Проверь</span>
      <span className="catchChipLine" aria-hidden="true">всё ли удалось услышать</span>
    </button>
  )
}
