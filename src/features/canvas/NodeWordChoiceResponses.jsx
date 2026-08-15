// Блок «что уходит в чат после ответа» для ноды word_choice: тексты реакции
// на верно/неверно + галочка «Отправлять выбранное в чат» (тогда перед
// реакцией справа прилетает пузырь с текстом самого выбранного варианта).
export default function NodeWordChoiceResponses({
  responseCorrect, responseWrong,
  onResponseCorrectChange, onResponseWrongChange,
  sendPickToChat = false, onSendPickChange,
}) {
  return (
    <div className="nodeWcResponseWrap">
      <label
        className="nodeWcSendPick"
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={sendPickToChat}
          onChange={e => onSendPickChange?.(e.target.checked)}
        />
        <span className="nodeWcSendPickLabel">Отправлять выбранное в чат</span>
      </label>
      <div className="nodeWcResponseRow">
        <span className="nodeWcResponseLabel nodeWcResponseLabelOk">✓</span>
        <input
          className="nodeWcResponseInput"
          value={responseCorrect}
          onChange={e => onResponseCorrectChange(e.target.value)}
          placeholder="Текст верного ответа..."
          onClick={e => e.stopPropagation()}
        />
      </div>
      <div className="nodeWcResponseRow">
        <span className="nodeWcResponseLabel nodeWcResponseLabelErr">✗</span>
        <input
          className="nodeWcResponseInput"
          value={responseWrong}
          onChange={e => onResponseWrongChange(e.target.value)}
          placeholder="Текст неверного ответа..."
          onClick={e => e.stopPropagation()}
        />
      </div>
    </div>
  )
}
