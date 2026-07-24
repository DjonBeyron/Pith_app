import { useEffect, useRef } from 'react'
import TableGrid from '../../../shared/ui/TableGrid.jsx'

// Правая панель: рамка iPhone SE 2020 (375×667 экран).
// Таблица — у дна экрана (justify-content:flex-end), растёт вверх при добавлении
// строк. Над ней — фиктивные «пузыри» ленты урока (одна стилизована под аудио/
// прогресс-бар — таблица в реальном уроке обычно идёт после аудио-диктора),
// чтобы показать контекст (таблица — карточка в ленте, не единственный элемент
// экрана). overflow:hidden — никаких скроллов внутри самого телефона.
export default function TablePhonePreview({ table }) {
  const wrapRef = useRef(null)

  // Обёртка вокруг телефона скроллится, если он не помещается по высоте —
  // всегда держим внизу (там же живёт таблица, растущая вверх), а не наверху.
  useEffect(() => {
    const el = wrapRef.current
    if (el) el.scrollTop = el.scrollHeight
  })

  return (
    <div className="tablePreviewWrap" ref={wrapRef}>
      <div className="tablePreviewPhone">
        <div className="tablePreviewSpeaker" />

        <div className="tablePreviewScreen">
          {/* Имитация ленты урока над таблицей */}
          <div className="tablePreviewFeed">
            <div className="tablePreviewBubble" style={{ width: '55%', height: 28 }} />
            <div className="tablePreviewBubbleAudio" style={{ width: '80%' }}>
              <span className="tablePreviewAudioDot" />
              <span className="tablePreviewAudioBar" />
            </div>
            <div className="tablePreviewBubble" style={{ width: '65%', height: 28 }} />
          </div>

          {/* Карточка таблицы — всегда у дна */}
          <div className="tablePreviewCard">
            <TableGrid
              columns={table.columns}
              rows={table.rows}
              cells={table.cells}
              rowCount={table.rowCount}
            />
          </div>
        </div>

        <div className="tablePreviewHomeBtn" />
      </div>
    </div>
  )
}
