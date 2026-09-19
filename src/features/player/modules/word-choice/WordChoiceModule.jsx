import PlayerBubble from '../../PlayerBubble.jsx'
import { xpAnchor } from '../../xpAnchor.js'

// Справа в чате: сначала пузырь с выбранным вариантом (только если у ноды
// включена галочка «Отправлять выбранное в чат» — тогда приходит pickText),
// следом — текст реакции на верно/неверно. Сердечко XP вешается на последний
// пузырь ряда: на реакцию, а если её текст пуст — на выбранное.
//
// Салюта здесь больше НЕТ — он живёт в самой панели (ChooseWordPanel:
// fireBurst в момент ухода панели, по галочке награды). Пузырей может не быть
// вовсе (короткая тренировка без реплик), а праздник положен за сам верный
// ответ, а не за наличие сообщения в переписке — как у таблицы.
export default function WordChoiceModule({ node, wordChoiceState }) {
  if (!wordChoiceState) return null
  const { pickText, text, result } = wordChoiceState
  if (!pickText && !text) return null
  const isCorrect = result === 'correct'
  const mod = isCorrect ? ' playerMsgBubble--responseOk' : ' playerMsgBubble--responseErr'
  // Точка старта для «+N XP» — ПОСЛЕДНИЙ пузырь ряда (xpAnchor.js): если у
  // ноды заполнена реакция на верный ответ, она стоит ниже выбранного слова,
  // и цифра должна вылетать из неё. Реакции нет — якорем становится выбор.
  // Ни того, ни другого (короткая тренировка без реплик) — пузырей нет вовсе,
  // и XP улетит от кнопки варианта в панели, как и задумано.
  const anchorOnPick = !text

  return (
    <>
      {pickText && (
        <div className="playerMsgRow playerMsgRowRight">
          <div className="reactionBubbleWrap" {...(anchorOnPick ? xpAnchor(node?.id) : {})}>
            {/* --pick: маркер для PlayerFeed — этот пузырь молчит, звук уже
                дал сам тап по варианту (answer-correct / answer-wrong).
                Цвет верно/неверно вешается на него же: выбор и результат
                теперь приходят в чат одним тиком (после ухода панели), так
                что пузырь сразу цветной; переход в CSS остался на случай
                позднего результата */}
            <PlayerBubble className={`playerMsgBubble playerMsgBubble--response playerMsgBubble--pick${result ? mod : ''}`}>
              {pickText}
            </PlayerBubble>
          </div>
        </div>
      )}
      {text && (
        <div className="playerMsgRow playerMsgRowRight">
          <div className="reactionBubbleWrap" {...xpAnchor(node?.id)}>
            <PlayerBubble className={`playerMsgBubble playerMsgBubble--response${mod}`}>
              {text}
            </PlayerBubble>
          </div>
        </div>
      )}
    </>
  )
}
