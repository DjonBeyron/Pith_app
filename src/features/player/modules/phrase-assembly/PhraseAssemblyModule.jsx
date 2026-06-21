import PlayerBubble from '../../PlayerBubble.jsx'

export default function PhraseAssemblyModule({ phraseState, phraseHint }) {
  const bubbles = phraseState ?? []
  if (!bubbles.length && !phraseHint) return null
  return (
    <>
      {bubbles.map((b, i) => {
        const isCorrect = b.result === 'correct'
        return (
          <div key={i} className={`playerMsgRow${isCorrect ? ' playerMsgRowRight' : ''}`}>
            <PlayerBubble className={
              isCorrect
                ? 'playerMsgBubble playerMsgBubble--response playerMsgBubble--responseOk'
                : 'playerMsgBubble playerMsgBubble--teacherErr'
            }>
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
