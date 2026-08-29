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
  // панели (те же классы tdAssembly*, см. table-dictator.css). Бокс рисуется
  // ВСЕГДА, даже пустой: панель с ним же и превращается в это сообщение, и
  // если бы он тут исчезал, высоты не совпали бы — пришлось бы сворачивать
  // его в клоне, двигать верхний край и пересчитывать цель, а история ловила
  // бы лишний сдвиг. Пустой бокс дешевле всей этой возни
  const words   = sent?.words ?? []
  const boxCls  = [
    'tdAssemblyBox', 'tdAssemblyBoxStatic', 'tdAssemblyBoxFilled',
    sent?.result === 'correct' ? 'tdAssemblyBoxOk'  : '',
    sent?.result === 'wrong'   ? 'tdAssemblyBoxErr' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      className="playerMsgRow playerMsgRowTable"
      data-table-bubble={nodeId}
      /* Приезжает превращением панели, а не «прилетает» снизу — своя анимация
         появления ему не нужна и только мешает: пока она играет, пузырь ещё
         едет, и клону некуда целиться (см. PlayerFeed и flyPanelToChat) */
      data-no-slide={arriving ? 'true' : undefined}
      style={arriving ? { visibility: 'hidden' } : undefined}
    >
      <PlayerBubble className="playerMsgBubble playerMsgBubble--table">
        <div className={boxCls}>
          {words.map((w, i) => <span key={i} className="tdAssemblyWord">{w}</span>)}
        </div>
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
