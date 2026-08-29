import PlayerBubble from '../../PlayerBubble.jsx'
import TableGrid from '../../../../shared/ui/TableGrid.jsx'

// Таблица как сообщение в чате: пузырь во всю ширину ленты, уголок слева —
// приходит будто картинкой от учителя. Используется и режимом «Показ»
// (TableDemoModule), и галочкой «отправить таблицу в чат» у отвечающих
// режимов — после разбора таблица остаётся в переписке.
// nodeId нужен полёту панели (flyPanelToChat.js): по метке
// data-table-bubble он находит, КУДА лететь, и прячет пузырь до посадки
export default function TableChatBubble({ table, children, nodeId, arriving = false, sent = null, caption = '' }) {
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
  // Подпись из ноды (chatCaption) старше собранной фразы: она для того и
  // заведена, чтобы в переписке в этом боксе всегда стояла своя надпись
  const hasText = !!caption || words.length > 0
  const boxCls  = [
    'tdAssemblyBox', 'tdAssemblyBoxStatic',
    // Яркая рамка — только когда в боксе что-то есть. Раньше класс стоял
    // безусловно, и пустой бокс в чате светился рамкой 0.22 против 0.07 у
    // такого же пустого бокса в панели: ровно в момент превращения, когда
    // надпись внутри пропадала, обводка шапки становилась ярче
    hasText ? 'tdAssemblyBoxFilled' : '',
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
          {caption
            ? <span className="tdAssemblyWord">{caption}</span>
            : words.map((w, i) => <span key={i} className="tdAssemblyWord">{w}</span>)}
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
