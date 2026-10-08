// Чип вместо шариков (feed-catch.css: .catchOverChip): «Проверь, всё ли удалось услышать.» Шариков под ним нет вовсе —
// FeedSlide кладёт на место спойлера невидимую копию фразы (.catchPhraseGhost), а чип растянут на всю ширину этого блока
// (обёртка .catchSpoilerWrap сжата по фразе, чип absolute left/right 0), текст по центру. Тап → onOpen (шторка набора).
// Текст — цикл из двух абсолютных span'ов: «Проверь,» и «всё ли удалось услышать» плавно (400мс) сменяют друг друга
// (CSS-анимация только opacity, бесконечная; стоит, когда лента не на экране или шторка открыта). Размер чипа от текста
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
      <span className="catchChipText catchChipA" aria-hidden="true">Проверь,</span>
      <span className="catchChipText catchChipB" aria-hidden="true">всё ли удалось услышать</span>
    </button>
  )
}
