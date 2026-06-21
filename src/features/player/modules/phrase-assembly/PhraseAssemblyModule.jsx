import PlayerBubble from '../../PlayerBubble.jsx'

export default function PhraseAssemblyModule({ phraseState, phraseHint }) {
  const bubbles = phraseState ?? []
  if (!bubbles.length && !phraseHint) return null
  return (
    <>
      {bubbles.map((b, i) => {
        if (b.result === 'correct') return (
          <div key={i} className="playerMsgRow playerMsgRowRight">
            <PlayerBubble className="playerMsgBubble playerMsgBubble--response playerMsgBubble--responseOk">
              {b.text}
            </PlayerBubble>
          </div>
        )
        if (b.result === 'wrong_final') return (
          <div key={i} className="playerMsgRow playerMsgRowRight">
            <PlayerBubble className="playerMsgBubble playerMsgBubble--response playerMsgBubble--responseErr">
              {b.text}
            </PlayerBubble>
          </div>
        )
        // wrong → слева, красный (от учителя)
        return (
          <div key={i} className="playerMsgRow">
            <PlayerBubble className="playerMsgBubble playerMsgBubble--teacherErr">
              {b.text}
            </PlayerBubble>
          </div>
        )
      })}
      {/* Подсказка (2-й неверный) — слева, дефолтный цвет как обычное сообщение */}
      {phraseHint && (
        <div className="playerMsgRow">
          <PlayerBubble className="playerMsgBubble">
            {phraseHint}
          </PlayerBubble>
        </div>
      )}
    </>
  )
}
