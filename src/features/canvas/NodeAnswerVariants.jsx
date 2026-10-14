import { useRef } from 'react'
import { NO_AUTOCORRECT } from '../../shared/lib/noAutoCorrectProps.js'

// «Другие верные ответы» ноды «Собери фразу»: дополнительные порядки слов рядом с главным (поле answers, phraseVariants.js).
// Засчитывается любой. Слова из дополнительных ответов, которых нет в главном, попадут в банк слов автоматически.
// answers: массив массивов слов [["Every","day","we","try"]]; вводится строкой, режется по пробелам.
export default function NodeAnswerVariants({ answers = [], onChange }) {
  const inputRef = useRef(null)

  function add() {
    const words = (inputRef.current?.value ?? '').split(/\s+/).filter(Boolean)
    if (!words.length) return
    onChange([...answers, words])
    inputRef.current.value = ''
    inputRef.current.focus({ preventScroll: true })
  }

  return (
    <div onClick={e => e.stopPropagation()}>
      <p className="nodePaLabel">Другие верные ответы</p>
      {answers.length > 0 && (
        <div className="nodePaWordsPreview">
          {answers.map((a, i) => (
            <span key={i} className="nodePaWordChip">
              {(Array.isArray(a) ? a : String(a).split(/\s+/)).join(' ')}
              <button className="nodePaDistractorDel" onClick={() => onChange(answers.filter((_, k) => k !== i))}>×</button>
            </span>
          ))}
        </div>
      )}
      <div className="nodeWcAddRow">
        <input
          ref={inputRef}
          className="nodeWcInput"
          placeholder="ещё один верный порядок слов..."
          aria-label="Другой верный ответ"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          onClick={e => e.stopPropagation()}
          {...NO_AUTOCORRECT}
        />
        <button className="nodeWcAddBtn" onClick={add}>+</button>
      </div>
    </div>
  )
}
