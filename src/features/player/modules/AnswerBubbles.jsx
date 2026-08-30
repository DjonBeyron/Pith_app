import PlayerBubble from '../PlayerBubble.jsx'

// Пузыри ответа ученика в ленте: собранная фраза справа и реплики учителя
// слева. Верность показывает только значок в пузыре (галочка/крестик) — своей
// реакции тут больше нет: за неё отвечает нода reaction, которую ставит автор
// урока там, где она уместна.
// Общий вид для «собери фразу» и для таблицы — раньше жил только в
// PhraseAssemblyModule, теперь его же использует TableModule.
export default function AnswerBubbles({ bubbles }) {
  const list = bubbles ?? []
  if (!list.length) return null

  return (
    <>
      {list.map((b, i) => {
        if (!b.text?.trim()) return null

        if (b.result === 'correct') {
          return (
            <div key={i} className="playerMsgRow playerMsgRowRight">
              <div className="reactionBubbleWrap">
                <PlayerBubble className="playerMsgBubble playerMsgBubble--response playerMsgBubble--responseOk">
                  {b.text}
                </PlayerBubble>
              </div>
            </div>
          )
        }

        if (b.result === 'wrong_final') return (
          <div key={i} className="playerMsgRow playerMsgRowRight">
            <PlayerBubble className="playerMsgBubble playerMsgBubble--response playerMsgBubble--responseErr">
              {b.text}
            </PlayerBubble>
          </div>
        )

        if (b.result === 'hint') return (
          <div key={i} className="playerMsgRow">
            <PlayerBubble className="playerMsgBubble">{b.text}</PlayerBubble>
          </div>
        )

        return (
          <div key={i} className="playerMsgRow">
            <PlayerBubble className="playerMsgBubble playerMsgBubble--teacherErr">
              {b.text}
            </PlayerBubble>
          </div>
        )
      })}
    </>
  )
}
