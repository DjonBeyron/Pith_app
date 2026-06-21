import PlayerBubble from '../../PlayerBubble.jsx'

export default function PhraseAssemblyModule({ phraseState, phraseHint }) {
  const bubbles = phraseState ?? []
  if (!bubbles.length && !phraseHint) return null
  return (
    <>
      {bubbles.map((b, i) => {
        const mod = b.result === 'correct' ? ' playerMsgBubble--responseOk' : ' playerMsgBubble--responseErr'
        return (
          <div key={i} className="playerMsgRow playerMsgRowRight">
            <PlayerBubble className={`playerMsgBubble playerMsgBubble--response${mod}`}>
              {b.text}
            </PlayerBubble>
          </div>
        )
      })}
      {phraseHint && (
        <div className="playerMsgRow">
          <PlayerBubble className="playerMsgBubble playerMsgBubble--teacherErr">
            {phraseHint}
          </PlayerBubble>
        </div>
      )}
    </>
  )
}
