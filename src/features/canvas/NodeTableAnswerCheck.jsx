import { useMemo } from 'react'
import { Eraser } from 'lucide-react'
import { deriveAnswerTokens } from '../../shared/lib/tableCellMatch.js'
import { pruneTimelineForAnswerReset } from './table-editor/timelinePrune.js'

// Под полем «Правильный ответ» у таблицы: показывает, как ответ ляжет на
// сетку, и даёт кнопку жёсткой очистки.
//
// Откуда взялось. Автор подставил сохранённый шаблон таблицы, а ответ остался
// от прежней — «He try to dance» при сетке «I / You / try». Разбор честно
// отправил «He» в слова вне таблицы, и в плеере почти вся фраза оказалась
// чипами, а таблица — почти ни при чём. А если бы не совпало ни одно слово,
// ручной режим вставал бы намертво (allCellsPicked). Здесь это видно ДО
// урока: какие слова не нашлись, и красным — если не нашлось ни одного.
//
// Кнопка «Очистить ответ» стирает не только текст: слова-ловушки и дорожки
// таймлайна, которые от него зависели, и мёртвые дорожки ячеек, которых в
// сетке больше нет (pruneTimelineForAnswerReset). Это и есть «начать с
// чистого листа» — след старого ответа перестаёт влиять на сборку.
export default function NodeTableAnswerCheck({ tData, onDataChange }) {
  const answer = tData.answer ?? ''
  const cells  = tData.table?.cells

  const { missing, cellCount, total } = useMemo(() => {
    const tokens = deriveAnswerTokens(answer, cells ?? [])
    return {
      missing:   tokens.filter(t => t.type === 'extra').map(t => t.value),
      cellCount: tokens.filter(t => t.type === 'cell').length,
      total:     tokens.length,
    }
  }, [answer, cells])

  function hardClear(e) {
    e.stopPropagation()
    const cellIds = new Set((cells ?? []).map(c => c.id))
    onDataChange({
      answer: '',
      distractors: [],
      ...(tData.timeline ? { timeline: pruneTimelineForAnswerReset(tData.timeline, cellIds) } : {}),
    })
  }

  const hasAnswer = answer.trim().length > 0
  const noneFound = hasAnswer && total > 0 && cellCount === 0

  return (
    <div className="nodeTableAnswerCheck">
      {hasAnswer && (
        <span className={`nodeTableAnswerNote${noneFound ? ' nodeTableAnswerNote--bad' : ''}`}>
          {noneFound
            ? 'Ни одно слово ответа не найдено в таблице — собирать из неё нечего. Проверь текст ответа и ячейки.'
            : missing.length
              ? `Вне таблицы: ${missing.join(', ')}`
              : 'Все слова ответа найдены в таблице'}
        </span>
      )}
      <button
        type="button"
        className="nodeTableAnswerClear"
        title="Стереть ответ, слова-ловушки и дорожки таймлайна, которые от них зависели; убрать дорожки ячеек, которых больше нет"
        onClick={hardClear}
        onMouseDown={e => e.stopPropagation()}
      >
        <Eraser size={13} /> Очистить ответ
      </button>
    </div>
  )
}
