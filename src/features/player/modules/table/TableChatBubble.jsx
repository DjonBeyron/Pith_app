import PlayerBubble from '../../PlayerBubble.jsx'
import TableGrid from '../../../../shared/ui/TableGrid.jsx'

// Таблица как сообщение в чате: пузырь во всю ширину ленты, уголок слева —
// приходит будто картинкой от учителя. Используется и режимом «Показ»
// (TableDemoModule), и галочкой «отправить таблицу в чат» у отвечающих
// режимов — после разбора таблица остаётся в переписке.
export default function TableChatBubble({ table, children }) {
  if (!table?.cells?.length) {
    return (
      <div className="playerMsgRow">
        <PlayerBubble className="playerMsgBubble">
          <span className="playerTextEmpty">Таблица не собрана</span>
        </PlayerBubble>
      </div>
    )
  }

  return (
    <div className="playerMsgRow">
      <PlayerBubble className="playerMsgBubble playerMsgBubble--table">
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
