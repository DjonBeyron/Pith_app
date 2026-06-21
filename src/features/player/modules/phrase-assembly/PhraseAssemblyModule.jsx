import PlayerBubble from '../../PlayerBubble.jsx'

export default function PhraseAssemblyModule({ phraseState, phraseHint }) {
  if (!phraseState?.text && !phraseHint) return null
  const mod = phraseState?.result === 'correct' ? ' playerMsgBubble--responseOk' : ' playerMsgBubble--responseErr'
  return (
    <>
      {phraseState?.text && (
        <div className="playerMsgRow playerMsgRowRight">
          <PlayerBubble className={`playerMsgBubble playerMsgBubble--response${mod}`}>
            {phraseState.text}
          </PlayerBubble>
        </div>
      )}
      {phraseHint && (
        <div className="playerMsgRow playerMsgRowRight">
          <PlayerBubble className="playerMsgBubble playerMsgBubble--response playerMsgBubble--responseErr">
            {phraseHint}
          </PlayerBubble>
        </div>
      )}
    </>
  )
}
