import { Volume2 } from 'lucide-react'
import { levelOf, levelFill, journey } from './memoryLadder.js'

// Слово памяти: заливка цвета ступени — путь к следующей ступени, обводка
// зеленеет по мере всего пути (серый → салатовый). perm — слово постоянной памяти
// (фиолетовое, залито целиком). Тап — окно слова (LearnWordSheet).
// row — строка списка «Все слова»: справа пометка «сегодня» (в сегодняшнем
// повторении) или «скоро» (у слова ещё нет карточек — не в расписании) и
// кнопка ▶ озвучки: onPlay — сыграть слово, canPlay — оно уже озвучено (место
// под кнопку занято всегда, чтобы пометки стояли ровно)
export default function MemoryWordChip({ w, perm = false, row = false, onClick, onPlay, canPlay = false }) {
  const lvl = perm ? 'Perm' : levelOf(w.step)
  const fill = perm ? 1 : Math.max(levelFill(w.step), 0.06)
  const ring = perm ? undefined : `color-mix(in srgb, #b6fe3b ${Math.round(12 + journey(w.step) * 58)}%, #2a3038)`
  const note = w.today ? 'сегодня' : w.hasDeck ? '' : 'скоро'
  const cls = `memChip memChip--${lvl}` + (row ? ' memChipRow' : '') + (w.hasDeck || perm ? '' : ' memChipMuted')
  const style = ring ? { '--ring': ring } : undefined
  const fillEl = <span className="memChipFill" style={{ width: `${fill * 100}%` }} />

  if (!row) {
    return (
      <button className={cls} style={style} onClick={() => onClick(w)}>
        {fillEl}
        <span className="memChipWord">{w.word}</span>
      </button>
    )
  }
  // Строка — не одна кнопка: внутри кнопка слова и кнопка ▶ (кнопка в кнопке недопустима)
  return (
    <div className={cls} style={style}>
      {fillEl}
      <button className="memChipMain" onClick={() => onClick(w)}>
        <span className="memChipWord">{w.word}</span>
        {note && <span className={w.today ? 'memChipNote memChipNoteToday' : 'memChipNote'}>{note}</span>}
      </button>
      {onPlay && (
        <span className="memPlaySlot">
          {canPlay && (
            <button className="memPlay" onClick={() => onPlay(w.word)} aria-label={`Воспроизвести «${w.word}»`} title="Послушать">
              <Volume2 />
            </button>
          )}
        </span>
      )}
    </div>
  )
}
