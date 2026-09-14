import PlayerBubble from '../PlayerBubble.jsx'
import ReplyPreview from '../ReplyPreview.jsx'
import BurstConfetti from '../../../shared/ui/BurstConfetti.jsx'
import { xpAnchor } from '../xpAnchor.js'
import { resolvePhraseAttempt } from '../replyResolve.js'

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
// replyNode — цитата «В ответ на» (только у «Собери фразу», см. replyToSeq в
// схеме): показывается ровно над ОДНИМ пузырём — тем же, который
// resolvePhraseAttempt считает финальным ответом по ноде (верный, если он
// был, иначе последняя попытка). Таблица цитату не заводит — там replyNode
// всегда null, и это место не рендерится вовсе.
export default function AnswerBubbles({ bubbles, nodeId = null, confetti = true, replyNode = null, lessonFiles, teacherName, allWordChoiceStates, allPhotoChoiceStates, allPhraseStates }) {
  const list = bubbles ?? []

  if (!list.length) return null

  const finalAttempt = replyNode ? resolvePhraseAttempt(list) : null

  return (
    <>
      {list.map((b, i) => {
        if (!b.text?.trim()) return null
        const quote = replyNode && b === finalAttempt && (
          <ReplyPreview
            replyNode={replyNode}
            lessonFiles={lessonFiles}
            teacherName={teacherName}
            allWordChoiceStates={allWordChoiceStates}
            allPhotoChoiceStates={allPhotoChoiceStates}
            allPhraseStates={allPhraseStates}
          />
        )

        if (b.result === 'correct') {
          return (
            <div key={i} className="playerMsgRow playerMsgRowRight">
              {/* Тот же салют, что на новом уровне, только короче и реже:
                  верных ответов в уроке десятки (Confetti.jsx) */}
              {confetti && (
                <BurstConfetti count={30} size={4} zIndex={60} portalTo=".lessonPlayer" />
              )}
              <div className="reactionBubbleWrap" {...xpAnchor(nodeId)}>
                <PlayerBubble className="playerMsgBubble playerMsgBubble--response playerMsgBubble--responseOk">
                  {quote}
                  {b.text}
                </PlayerBubble>
              </div>
            </div>
          )
        }

        if (b.result === 'wrong_final') return (
          <div key={i} className="playerMsgRow playerMsgRowRight">
            <PlayerBubble className="playerMsgBubble playerMsgBubble--response playerMsgBubble--responseErr">
              {quote}
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
