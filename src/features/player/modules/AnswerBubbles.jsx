import PlayerBubble from '../PlayerBubble.jsx'
import BurstConfetti from '../../../shared/ui/BurstConfetti.jsx'
import { chatFadeHeight } from '../chatFadeHeight.js'
import { xpAnchor } from '../xpAnchor.js'

// Пузыри ответа ученика в ленте: собранная фраза справа и реплики учителя
// слева. Верность показывает только значок в пузыре (галочка/крестик) — своей
// реакции тут больше нет: за неё отвечает нода reaction, которую ставит автор
// урока там, где она уместна.
// Общий вид для «собери фразу» и для таблицы — раньше жил только в
// PhraseAssemblyModule, теперь его же использует TableModule.
//
// nodeId — метка для полёта XP: цифра стартует от верного пузыря, если он в
// переписке есть (xpAnchor.js). Сам полёт объявляет панель, а не этот
// компонент: пузырей может не быть вовсе (галочка «отправить ответ ученика»
// выключена), и XP, привязанный к их появлению, тогда не начислялся бы вообще.
// confetti — рисовать ли салют на верном пузыре. Таблица передаёт false: у неё
// пузырей может не быть вовсе, и салют там живёт в самой панели, привязанный к
// факту верного ответа, а не к наличию сообщения в чате. Без этого флага при
// включённой галочке залпов было бы два — из панели и отсюда.
export default function AnswerBubbles({ bubbles, nodeId = null, confetti = true }) {
  const list = bubbles ?? []

  if (!list.length) return null

  return (
    <>
      {list.map((b, i) => {
        if (!b.text?.trim()) return null

        if (b.result === 'correct') {
          return (
            <div key={i} className="playerMsgRow playerMsgRowRight">
              {/* Тот же салют, что на новом уровне, только короче и реже:
                  верных ответов в уроке десятки (Confetti.jsx) */}
              {confetti && (
                <BurstConfetti count={30} size={4} bottomInset={chatFadeHeight()} zIndex={60} portalTo=".lessonPlayer" />
              )}
              <div className="reactionBubbleWrap" {...xpAnchor(nodeId)}>
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
