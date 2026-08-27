import PlayerBubble from '../../PlayerBubble.jsx'
import TableGrid from '../../../../shared/ui/TableGrid.jsx'

// Таблица как сообщение в чате: пузырь во всю ширину ленты, уголок слева —
// приходит будто картинкой от учителя. Используется и режимом «Показ»
// (TableDemoModule), и галочкой «отправить таблицу в чат» у отвечающих
// режимов — после разбора таблица остаётся в переписке.
// nodeId нужен полёту панели (flyPanelToChat.js): по метке
// data-table-bubble он находит, КУДА лететь, и прячет пузырь до посадки
export default function TableChatBubble({ table, children, nodeId, arriving = false, sent = null }) {
  if (!table?.cells?.length) {
    return (
      <div className="playerMsgRow">
        <PlayerBubble className="playerMsgBubble">
          <span className="playerTextEmpty">Таблица не собрана</span>
        </PlayerBubble>
      </div>
    )
  }

  // Собранная фраза остаётся в переписке ровно в том виде, в каком была в
  // панели (те же классы tdAssembly*, см. table-dictator.css). Подсказка
  // «Смотри на таблицу…» сюда не переносится: она нужна только по ходу
  // разбора — поэтому пустой бокс не рисуем вовсе
  const words   = sent?.words ?? []
  const boxCls  = [
    'tdAssemblyBox', 'tdAssemblyBoxStatic', 'tdAssemblyBoxFilled',
    sent?.result === 'correct' ? 'tdAssemblyBoxOk'  : '',
    sent?.result === 'wrong'   ? 'tdAssemblyBoxErr' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      className="playerMsgRow"
      data-table-bubble={nodeId}
      style={arriving ? { visibility: 'hidden' } : undefined}
    >
      <PlayerBubble className="playerMsgBubble playerMsgBubble--table">
        {words.length > 0 && (
          <div className={boxCls}>
            {words.map((w, i) => <span key={i} className="tdAssemblyWord">{w}</span>)}
          </div>
        )}
        <TableGrid
          columns={table.columns}
          rows={table.rows}
          cells={table.cells}
          rowCount={table.rowCount}
        />
        {children}
      </PlayerBubble>
    </div>
  )
}
