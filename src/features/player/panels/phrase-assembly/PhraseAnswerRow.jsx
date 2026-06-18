export default function PhraseAnswerRow({ placed, result, onRemove }) {
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
          className="phraseAnswerChip"
          onClick={() => onRemove(i)}
          disabled={result === 'correct'}
        >
          {p.word}
        </button>
      ))}
    </div>
  )
}
