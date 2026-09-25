import { useState } from 'react'
import { colorBg } from '../canvas/nodeTypes.js'
import { SOURCE_FILTERS, MARK_LABEL, sourceRows, rowsFor, filterCounts } from './reviewCardsView.js'

// Урок слева от редактора карточки — источник нод. Ноды урока по порядку,
// как сообщения чата: полоска и фон цвета типа (как на канвасе), текст,
// варианты ответа задания, метка ветки («после верного» / «после ошибки» /
// «подсказка»). Фильтры по типам сверху. Урок не меняется — в карточку
// уходят КОПИИ (reviewCardCopy.js):
//   «＋ Карточка из задания» — новая карточка: сообщение перед заданием + задание;
//   «＋ в карточку» — нода (со своими подсказками) в конец выбранной карточки
export default function ReviewLessonSource({ nodes, hasCard, onAddNode, onCardFromTask }) {
  const [filter, setFilter] = useState('all')
  const rows = sourceRows(nodes)
  const counts = filterCounts(rows)
  const shown = rowsFor(rows, filter)

  return (
    <aside className="rcSource" aria-label="Урок">
      <div className="rcSourceHead">
        <span className="rcSourceTitle">Урок</span>
        <div className="rcFilters">
          {SOURCE_FILTERS.map(f => (
            <button
              key={f.id}
              className={'rcFilter' + (filter === f.id ? ' rcFilterOn' : '')}
              onClick={() => setFilter(f.id)}
              disabled={!counts[f.id]}
            >{f.label} {counts[f.id]}</button>
          ))}
        </div>
      </div>

      <div className="rcSourceList">
        {rows.length === 0 && <div className="rcSourceEmpty">В уроке пока нет нод</div>}
        {shown.map(r => (
          <div
            key={r.id}
            data-src-id={r.id}
            className={'rcSrcRow' + (r.isTask ? ' rcSrcRowTask' : '')}
            style={{ borderLeftColor: r.color, background: colorBg(r.color, 0.08) }}
          >
            <div className="rcSrcMeta">
              <span style={{ color: r.color }}>#{r.seq} · {r.type}</span>
              {r.mark && <span className={`rcSrcMark rcSrcMark--${r.mark}`}>{MARK_LABEL[r.mark]}</span>}
            </div>
            {/* У задания без вопроса текст заменяют варианты ответа ниже */}
            {(r.text || !r.answers.length) && (
              <div className="rcSrcText">
                {r.icon && <span className="rcSrcIcon">{r.icon}</span>}
                {r.text || <span className="rcSrcEmptyText">без текста</span>}
              </div>
            )}
            {r.answers.length > 0 && (
              <div className="rcSrcAnswers">
                {r.answers.map((a, i) => <span key={i} className={a.ok ? 'rcSrcAnswer rcSrcAnswerOk' : 'rcSrcAnswer'}>{a.text}</span>)}
              </div>
            )}
            <div className="rcSrcBtns">
              {r.isTask && (
                <button className="rcSrcMain" onClick={() => onCardFromTask(r.id)}>＋ Карточка из задания</button>
              )}
              <button
                className="rcSrcAdd"
                onClick={() => onAddNode(r.id)}
                title={hasCard ? 'Копия ноды — в конец выбранной карточки' : 'Карточек нет — создастся новая'}
              >＋ в карточку</button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}
