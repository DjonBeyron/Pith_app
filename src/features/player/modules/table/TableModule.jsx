import TableDemoModule from './TableDemoModule.jsx'
import TableChatBubble from './TableChatBubble.jsx'
import AnswerBubbles from '../AnswerBubbles.jsx'

// Нода «Таблица» в ленте чата.
// — «Показ»: таблица приходит обычным сообщением, панели нет вовсе.
// — «Авто»/«Ручной»: в ленте пусто, весь интерфейс в нижней панели. Но если
//   у ноды включено «отправить таблицу в чат», то после разбора её последнее
//   состояние остаётся в переписке — тем же пузырём. А галочка «отправить
//   ответ ученика» кладёт рядом собранную фразу (те же пузыри, что у «собери
//   фразу»): верную — сразу, неверную — только последнюю из трёх попыток.
export default function TableModule(props) {
  const tData = props.node?.typeData?.table ?? {}
  const mode  = tData.mode ?? 'dictator'

  if (mode === 'demo') return <TableDemoModule {...props} />

  const answers = props.phraseState ?? []
  if (!props.tableSent && !answers.length) return null

  return (
    <>
      <AnswerBubbles bubbles={answers} rewardXp={props.rewardXp ?? 0} />
      {props.tableSent && (
        <TableChatBubble
          table={tData.table ?? null}
          nodeId={props.node.id}
          /* пузырь держит место, но невидим, пока на него не села панель */
          arriving={props.tableArriving}
          /* как таблица выглядела в панели: собранная фраза и итог проверки */
          sent={typeof props.tableSent === 'object' ? props.tableSent : null}
          /* своя надпись в верхнем боксе — задаётся у ноды рядом с галочкой
             «отправить таблицу в чат» (NodeTablePicker) */
          caption={tData.chatCaption ?? ''}
        />
      )}
    </>
  )
}
