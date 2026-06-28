import PlayerBubble from '../../PlayerBubble.jsx'

// result: 'error' → левый красный пузырь, 'success' → левый зелёный пузырь
export default function RegistrationModule({ regState }) {
  const bubbles = regState ?? []
  if (!bubbles.length) return null
  return (
    <>
      {bubbles.map((b, i) => (
        <div key={i} className="playerMsgRow">
          <PlayerBubble className={`playerMsgBubble ${b.result === 'success' ? 'playerMsgBubble--regOk' : 'playerMsgBubble--teacherErr'}`}>
            {b.text}
          </PlayerBubble>
        </div>
      ))}
    </>
  )
}
