import PlayerBubble from '../../PlayerBubble.jsx'

export default function PhraseAssemblyModule({ phraseState }) {
  if (!phraseState?.text) return null
  const mod = phraseState.result === 'correct' ? ' playerMsgBubble--responseOk' : ' playerMsgBubble--responseErr'
  return (
    <div className="playerMsgRow playerMsgRowRight">
      <PlayerBubble className={`playerMsgBubble playerMsgBubble--response${mod}`}>
        {phraseState.text}
      </PlayerBubble>
    </div>
  )
}
