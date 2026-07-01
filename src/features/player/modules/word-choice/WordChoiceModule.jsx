import PlayerBubble from '../../PlayerBubble.jsx'
import HeartReaction from '../../HeartReaction.jsx'

export default function WordChoiceModule({ wordChoiceState, rewardXp = 0 }) {
  if (!wordChoiceState) return null
  const { text, result } = wordChoiceState
  if (!text) return null

  const isCorrect = result === 'correct'
  const mod = isCorrect ? ' playerMsgBubble--responseOk' : ' playerMsgBubble--responseErr'
  const showHeart = isCorrect && rewardXp > 0

  return (
    <div className="playerMsgRow playerMsgRowRight">
      <div className="reactionBubbleWrap">
        <PlayerBubble className={`playerMsgBubble playerMsgBubble--response${mod}`}>
          {text}
        </PlayerBubble>
        {showHeart && <HeartReaction />}
      </div>
    </div>
  )
}
