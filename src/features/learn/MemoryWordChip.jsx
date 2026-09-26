import { levelOf, levelFill, journey } from './memoryLadder.js'

// Слово памяти: заливка цвета ступени — путь к следующей ступени, обводка
// зеленеет по мере всего пути (серый → салатовый). perm — слово постоянной
// памяти (фиолетовое, залито целиком). row — строка списка «Все слова»:
// справа пометка «сегодня» (в сегодняшнем повторении) или «скоро» (у слова
// ещё нет карточек — не в расписании). Тап — шторка слова (LearnWordSheet)
export default function MemoryWordChip({ w, perm = false, row = false, onClick }) {
  const lvl = perm ? 'Perm' : levelOf(w.step)
  const fill = perm ? 1 : Math.max(levelFill(w.step), 0.06)
  const ring = perm ? undefined : `color-mix(in srgb, #b6fe3b ${Math.round(12 + journey(w.step) * 58)}%, #2a3038)`
  const note = w.today ? 'сегодня' : w.hasDeck ? '' : 'скоро'
  return (
    <button
      className={`memChip memChip--${lvl}` + (row ? ' memChipRow' : '') + (w.hasDeck || perm ? '' : ' memChipMuted')}
      style={ring ? { '--ring': ring } : undefined}
      onClick={() => onClick(w)}
    >
      <span className="memChipFill" style={{ width: `${fill * 100}%` }} />
      <span className="memChipWord">{w.word}</span>
      {row && note && <span className={w.today ? 'memChipNote memChipNoteToday' : 'memChipNote'}>{note}</span>}
    </button>
  )
}
