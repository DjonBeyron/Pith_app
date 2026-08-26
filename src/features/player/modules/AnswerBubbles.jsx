import PlayerBubble from '../PlayerBubble.jsx'
import HeartReaction from '../HeartReaction.jsx'

// Пузыри ответа ученика в ленте: собранная фраза справа (зелёная — верная,
// красная — последняя неверная попытка) и реплики учителя слева.
// Общий вид для «собери фразу» и для таблицы — раньше жил только в
// PhraseAssemblyModule, теперь его же использует TableModule.
export default function AnswerBubbles({ bubbles, rewardXp = 0 }) {
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
                {rewardXp > 0 && <HeartReaction />}
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
