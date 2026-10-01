import { levelOf, levelFill } from './memoryLadder.js'
import MemoryWordLine from './MemoryWordLine.jsx'
import MemoryPlayButton from './MemoryPlayButton.jsx'

// Слово памяти: заливка цвета ступени — путь к следующей ступени, рамка — цвет
// ступени (memory-ladder.css). perm — слово постоянной памяти (фиолетовое, залито
// целиком). Тап — окно слова (LearnWordSheet).
// row — строка списка «Все слова»: по нижней кромке тонкая линия пути по трём
// ступеням (MemoryWordLine), справа пометка «сегодня» (в сегодняшнем
// повторении) или «скоро» (у слова ещё нет карточек — не в расписании) и
// кнопка ▶ озвучки (MemoryPlayButton): onPlay(слово, { onWait, onDone }) — сыграть слово, canPlay — оно уже озвучено (место
// под кнопку занято всегда, чтобы пометки стояли ровно)
export default function MemoryWordChip({ w, perm = false, row = false, onClick, onPlay, canPlay = false }) {
  const lvl = perm ? 'Perm' : levelOf(w.step)
  const fill = perm ? 1 : Math.max(levelFill(w.step), 0.06)
  const note = w.today ? 'сегодня' : w.hasDeck ? '' : 'скоро'
  const cls = `memChip memChip--${lvl}` + (row ? ' memChipRow' : '') + (w.hasDeck || perm ? '' : ' memChipMuted')
  const fillEl = <span className="memChipFill" style={{ width: `${fill * 100}%` }} />

  if (!row) {
    return (
      <button className={cls} onClick={() => onClick(w)}>
        {fillEl}
        <span className="memChipWord">{w.word}</span>
      </button>
    )
  }
  // Строка — не одна кнопка: внутри кнопка слова и кнопка ▶ (кнопка в кнопке недопустима)
  return (
    <div className={cls}>
      {fillEl}
      {!perm && <MemoryWordLine step={w.step} />}
      <button className="memChipMain" onClick={() => onClick(w)}>
        <span className="memChipWord">{w.word}</span>
        {note && <span className={w.today ? 'memChipNote memChipNoteToday' : 'memChipNote'}>{note}</span>}
      </button>
      {onPlay && (
        <span className="memPlaySlot">
          {canPlay && <MemoryPlayButton word={w.word} onPlay={onPlay} />}
        </span>
      )}
    </div>
  )
}
