// blinkIndex — слот с сигналом ошибки автора (см. PROJECT.md): именно это
// слово мигает красным, пока его не уберут тем же тапом, что и любое другое
export default function PhraseAnswerRow({ placed, result, blinkIndex = null, freeze = false, onRemove }) {
  const cls = [
    'phraseAnswerRow',
    placed.length > 0 && !result  ? 'phraseAnswerFilled' : '',
    result === 'correct'          ? 'phraseAnswerOk'     : '',
    result === 'wrong'            ? 'phraseAnswerErr'    : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={cls}>
      {placed.length === 0 && (
        <span className="phraseAnswerPlaceholder">Собери фразу...</span>
      )}
      {placed.map((p, i) => (
        <button
          key={i}
          className={`phraseAnswerChip${i === blinkIndex ? ' signalBlinkChip' : ''}`}
          onClick={() => onRemove(i)}
          disabled={result === 'correct' || freeze}
        >
          {p.word}
        </button>
      ))}
    </div>
  )
}
