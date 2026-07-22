import TableGrid from '../../../shared/ui/TableGrid.jsx'

// Правая панель: рамка iPhone SE 2020 (375×667 экран).
// Таблица — у дна экрана (justify-content:flex-end), растёт вверх при добавлении
// строк. Над ней — фиктивные «пузыри» ленты урока, чтобы показать контекст
// (таблица — карточка в ленте, не единственный элемент экрана).
// overflow:hidden — никаких скроллов внутри телефона.
export default function TablePhonePreview({ table }) {
  return (
    <div className="tablePreviewWrap">
      <div className="tablePreviewPhone">
        <div className="tablePreviewSpeaker" />

        <div className="tablePreviewScreen">
          {/* Имитация ленты урока над таблицей */}
          <div className="tablePreviewFeed">
            <div className="tablePreviewBubble" style={{ width: '55%', height: 28 }} />
            <div className="tablePreviewBubble" style={{ width: '80%', height: 44 }} />
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
