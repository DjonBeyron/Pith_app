import { useRef } from 'react'
import PlayerBubble from '../../PlayerBubble.jsx'
import { xpAnchor } from '../../xpAnchor.js'
import { useDeferredArrival } from '../useDeferredArrival.js'

// Справа в чате: сначала пузырь с выбранным вариантом (только если у ноды
// включена галочка «Отправлять выбранное в чат» — тогда приходит pickText),
// следом — текст реакции на верно/неверно. Сердечко XP вешается на последний
// пузырь ряда: на реакцию, а если её текст пуст — на выбранное.
//
// Салюта здесь больше НЕТ — он живёт в самой панели (ChooseWordPanel:
// fireBurst в момент ухода панели, по галочке награды). Пузырей может не быть
// вовсе (короткая тренировка без реплик), а праздник положен за сам верный
// ответ, а не за наличие сообщения в переписке — как у таблицы.
//
// arriving — строки уже в ленте, но невидимы и без въезда (data-no-slide):
// панель закрывается тем же тиком, и история опускается сразу на конечное
// место. Снятие флага (handleWordReveal) проигрывает въезд — useDeferredArrival
export default function WordChoiceModule({ node, wordChoiceState }) {
  const rowsRef = useRef([])
  const arriving = !!wordChoiceState?.arriving
  // --pick молчит (звук дал тап), реплика звучит как обычное сообщение
  useDeferredArrival(arriving, rowsRef, { silent: !wordChoiceState?.text })
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
  const rowCls = `playerMsgRow playerMsgRowRight${arriving ? ' playerMsgRowArriving' : ''}`
  const noSlide = arriving ? { 'data-no-slide': 'true' } : {}

  return (
    <>
      {pickText && (
        <div className={rowCls} {...noSlide} ref={el => { rowsRef.current[0] = el }}>
          <div className="reactionBubbleWrap" {...(anchorOnPick ? xpAnchor(node?.id) : {})}>
            {/* --pick: маркер для PlayerFeed — этот пузырь молчит, звук уже
                дал сам тап по варианту (answer-correct / answer-wrong).
                Цвет верно/неверно вешается на него же: выбор и результат
                приходят в чат одним тиком, так что пузырь сразу цветной */}
            <PlayerBubble className={`playerMsgBubble playerMsgBubble--response playerMsgBubble--pick${result ? mod : ''}`}>
              {pickText}
            </PlayerBubble>
          </div>
        </div>
      )}
      {text && (
        <div className={rowCls} {...noSlide} ref={el => { rowsRef.current[1] = el }}>
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
