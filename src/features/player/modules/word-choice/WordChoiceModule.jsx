import PlayerBubble from '../../PlayerBubble.jsx'

// Рендерит ответ пользователя в чате после выбора варианта.
// Пока не отвечено — ничего не показывает (панель опций снизу).
export default function WordChoiceModule({ wordChoiceState }) {
  if (!wordChoiceState) return null
  const { text, result } = wordChoiceState
  if (!text) return null
  const mod = result === 'correct' ? ' playerMsgBubble--responseOk' : ' playerMsgBubble--responseErr'
  return (
    <div className="playerMsgRow playerMsgRowRight">
      <PlayerBubble className={`playerMsgBubble playerMsgBubble--response${mod}`}>
        {text}
      </PlayerBubble>
    </div>
  )
}
