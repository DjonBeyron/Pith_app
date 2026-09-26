import { useEffect, useRef } from 'react'
import { deckStatus, MIN_CARDS } from './reviewCardCopy.js'
import { cardSummary } from './reviewCardsView.js'
import { plural } from '../../shared/lib/plural.js'

// Над редактором: предупреждение о колоде, мини-превью карточек (выбор) и
// действия. Превью — цветные полоски нод (цвета канваса), первая строка
// текста и число нод; пустая помечена «не сохранится». Выбранная карточка
// подсвечивается вспышкой и прокручивается в зону видимости — новая
// карточка сразу на виду, а прежние остаются рядом в том же ряду
export default function ReviewCardStrip({
  cards, active, onSelect, onAdd, onDraft, canDraft, lessonShown, onToggleLesson, onPreview, onRemove, disabled,
}) {
  const status = deckStatus(cards)
  const filled = cards.filter(c => c.nodes?.length).length
  const current = cards[active]
  const currentSummary = current && cardSummary(current)
  const rowRef = useRef(null)

  useEffect(() => {
    rowRef.current?.querySelector('.rcThumbActive')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [active, cards.length])

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
      {currentSummary?.count > 0 && !currentSummary.hasTask && (
        <div className="rcWarn rcWarnSoft">В карточке {active + 1} нет задания — ученику нечего ответить.</div>
      )}

      <div className="rcThumbs" ref={rowRef}>
        {cards.map((c, i) => {
          const s = cardSummary(c)
          const cls = 'rcThumb' + (i === active ? ' rcThumbActive' : '') + (s.count && !s.hasTask ? ' rcThumbWarn' : '')
          return (
            <button key={c.id} className={cls} onClick={() => onSelect(i)} aria-pressed={i === active}>
              <span className="rcThumbBars">
                {s.colors.map((color, k) => <i key={k} style={{ background: color }} />)}
              </span>
              <span className="rcThumbHead">Карточка {i + 1}{s.count && !s.hasTask ? ' ⚠' : ''}</span>
              <span className="rcThumbText">{s.count ? (s.text || 'без текста') : 'пустая — не сохранится'}</span>
              <span className="rcThumbMeta">{s.count} {plural(s.count, 'нода', 'ноды', 'нод')}</span>
            </button>
          )
        })}
        <button className="rcThumb rcThumbAdd" onClick={onAdd} disabled={disabled}>+ Карточка</button>
      </div>

      <div className="rcActions">
        <button
          className={'pageTabBtn' + (lessonShown ? ' pageTabBtnActive' : '')}
          onClick={onToggleLesson}
          title="Урок слева: из него добавляются ноды в карточку"
        >{lessonShown ? 'Скрыть урок' : 'Показать урок'}</button>
        <button
          className="pageTabBtn"
          onClick={onDraft}
          disabled={disabled || !canDraft}
          title={canDraft ? 'По карточке на каждое задание урока' : 'В уроке нет заданий'}
        >Черновик из урока</button>
        {current && (
          <>
            <button
              className="pageTabBtn"
              onClick={onPreview}
              disabled={!current.nodes?.length}
              title="Проиграть карточку так, как её увидит ученик"
            >▶ Предпросмотр</button>
            <button className="pageDangerBtn" onClick={onRemove} disabled={disabled}>Удалить карточку {active + 1}</button>
          </>
        )}
      </div>
    </div>
  )
}
