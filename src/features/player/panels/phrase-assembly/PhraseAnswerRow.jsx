import { wrongChipFlags } from './wrongChips.js'

// blinkIndex — слот с сигналом ошибки автора (см. PROJECT.md): именно это
// слово мигает красным, пока его не уберут тем же тапом, что и любое другое
// wrongIds — снимок id чипов на момент неверной проверки (wrongChips.js): красными бывают только они
export default function PhraseAnswerRow({ placed, result, wrongIds = null, blinkIndex = null, freeze = false, onRemove }) {
  const wrongFlags = wrongChipFlags(placed, wrongIds)
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
          className={`phraseAnswerChip${wrongFlags[i] ? ' phraseAnswerChipErr' : ''}${i === blinkIndex ? ' signalBlinkChip' : ''}`}
          onClick={() => onRemove(i)}
          disabled={result === 'correct' || freeze}
        >
          {p.word}
        </button>
      ))}
    </div>
  )
}
