import PlayerBubble from '../../PlayerBubble.jsx'
import HeartReaction from '../../HeartReaction.jsx'

// Справа в чате: сначала пузырь с выбранным вариантом (только если у ноды
// включена галочка «Отправлять выбранное в чат» — тогда приходит pickText),
// следом — текст реакции на верно/неверно. Сердечко XP вешается на последний
// пузырь ряда: на реакцию, а если её текст пуст — на выбранное.
export default function WordChoiceModule({ wordChoiceState, rewardXp = 0 }) {
  if (!wordChoiceState) return null
  const { pickText, text, result } = wordChoiceState
  if (!pickText && !text) return null

  const isCorrect = result === 'correct'
  const mod = isCorrect ? ' playerMsgBubble--responseOk' : ' playerMsgBubble--responseErr'
  const showHeart = isCorrect && rewardXp > 0

  return (
    <>
      {pickText && (
        <div className="playerMsgRow playerMsgRowRight">
          <div className="reactionBubbleWrap">
            {/* --pick: маркер для PlayerFeed — этот пузырь молчит, звук уже
                дал сам тап по варианту (answer-correct / answer-wrong) */}
            <PlayerBubble className="playerMsgBubble playerMsgBubble--response playerMsgBubble--pick">
              {pickText}
            </PlayerBubble>
            {showHeart && !text && <HeartReaction />}
          </div>
        </div>
      )}
      {text && (
        <div className="playerMsgRow playerMsgRowRight">
          <div className="reactionBubbleWrap">
            <PlayerBubble className={`playerMsgBubble playerMsgBubble--response${mod}`}>
              {text}
            </PlayerBubble>
            {showHeart && <HeartReaction />}
          </div>
        </div>
      )}
    </>
  )
}
