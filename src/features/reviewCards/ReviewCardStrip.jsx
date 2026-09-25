import { cardHasTask, deckStatus, MIN_CARDS } from './reviewCardCopy.js'

// Над списком нод: предупреждение о колоде, ряд карточек (выбор) и действия.
// Сами ноды выбранной карточки правятся ниже тем же списком, что продакшен
export default function ReviewCardStrip({
  cards, active, onSelect, onAdd, onDraft, canDraft, onPull, onPreview, onRemove, disabled,
}) {
  const status = deckStatus(cards)
  const filled = cards.filter(c => c.nodes?.length).length
  const current = cards[active]

  return (
    <div className="rcStrip">
      {status === 'none' && (
        <div className="rcWarn">
          Колоды нет — слово не попадёт в повторение (в карте памяти будет серым).
          Нужно минимум {MIN_CARDS} карточки.
        </div>
      )}
      {status === 'few' && (
        <div className="rcWarn">Карточек: {filled} — нужно минимум {MIN_CARDS}, иначе ответы быстро заучиваются.</div>
      )}
      {current?.nodes?.length > 0 && !cardHasTask(current) && (
        <div className="rcWarn rcWarnSoft">В карточке {active + 1} нет задания — ученику нечего ответить.</div>
      )}

      <div className="rcChips">
        {cards.map((c, i) => (
          <button
            key={c.id}
            className={'rcChip' + (i === active ? ' rcChipActive' : '') + (cardHasTask(c) ? '' : ' rcChipWarn')}
            onClick={() => onSelect(i)}
            title={cardHasTask(c) ? `Карточка ${i + 1}` : `Карточка ${i + 1}: нет задания`}
          >{i + 1}{cardHasTask(c) ? '' : ' ⚠'}</button>
        ))}
        <button className="rcChip rcChipAdd" onClick={onAdd} disabled={disabled}>+ Карточка</button>
        <button
          className="rcChip rcChipAdd"
          onClick={onDraft}
          disabled={disabled || !canDraft}
          title={canDraft ? 'По карточке на каждое задание урока' : 'В уроке нет заданий'}
        >Черновик из урока</button>
      </div>

      {current && (
        <div className="rcActions">
          <button className="pageTabBtn" onClick={onPull} disabled={disabled}>Подтянуть из урока</button>
          <button
            className="pageTabBtn"
            onClick={onPreview}
            disabled={!current.nodes?.length}
            title="Проиграть карточку так, как её увидит ученик"
          >▶ Предпросмотр</button>
          <button className="pageDangerBtn" onClick={onRemove} disabled={disabled}>Удалить карточку {active + 1}</button>
        </div>
      )}
    </div>
  )
}
