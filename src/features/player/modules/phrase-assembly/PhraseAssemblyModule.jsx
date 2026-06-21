import PlayerBubble from '../../PlayerBubble.jsx'

export default function PhraseAssemblyModule({ phraseState }) {
  const bubbles = phraseState ?? []
  if (!bubbles.length) return null
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
        if (b.result === 'hint') return (
          <div key={i} className="playerMsgRow">
            <PlayerBubble className="playerMsgBubble">{b.text}</PlayerBubble>
          </div>
        )
        // wrong → слева, красный
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
