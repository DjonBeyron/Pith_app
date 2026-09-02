import { useRef, useEffect } from 'react'
import PlayerBubble from '../PlayerBubble.jsx'
import BurstConfetti from '../../../shared/ui/BurstConfetti.jsx'

// Пузыри ответа ученика в ленте: собранная фраза справа и реплики учителя
// слева. Верность показывает только значок в пузыре (галочка/крестик) — своей
// реакции тут больше нет: за неё отвечает нода reaction, которую ставит автор
// урока там, где она уместна.
// Общий вид для «собери фразу» и для таблицы — раньше жил только в
// PhraseAssemblyModule, теперь его же использует TableModule.
//
// rewardXp/onXpEarned — только у таблицы (PhraseAssemblyModule XP не передаёт,
// там он стреляет раньше, из панели по кнопке «Проверить», см.
// PhraseAssemblyPanel.jsx). У таблицы такой кнопки нет — ответ проверяется
// тапом по ячейке, поэтому XP стреляет здесь же, от первого верного пузыря,
// как только он появляется в ленте (тот же приём, что у PhotoChoiceModule).
export default function AnswerBubbles({ bubbles, rewardXp = 0, onXpEarned }) {
  const list = bubbles ?? []
  const okRef   = useRef(null)
  const xpFired = useRef(false)

  useEffect(() => {
    if (xpFired.current || rewardXp <= 0) return
    if (!list.some(b => b.result === 'correct')) return
    xpFired.current = true
    const rect = okRef.current?.getBoundingClientRect()
    if (rect) onXpEarned?.(rewardXp, rect)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length])

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
              <BurstConfetti count={30} size={4} />
              <div className="reactionBubbleWrap" ref={okRef}>
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
