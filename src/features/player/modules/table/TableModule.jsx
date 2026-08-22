import TableDemoModule from './TableDemoModule.jsx'
import TableChatBubble from './TableChatBubble.jsx'

// Нода «Таблица» в ленте чата.
// — «Показ»: таблица приходит обычным сообщением, панели нет вовсе.
// — «Авто»/«Ручной»: в ленте пусто, весь интерфейс в нижней панели. Но если
//   у ноды включено «отправить таблицу в чат», то после разбора её последнее
//   состояние остаётся в переписке — тем же пузырём.
export default function TableModule(props) {
  const tData = props.node?.typeData?.table ?? {}
  const mode  = tData.mode ?? 'dictator'

  if (mode === 'demo') return <TableDemoModule {...props} />
  if (props.tableSent) return <TableChatBubble table={tData.table ?? null} />
  return null
}
