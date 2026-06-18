import { usePhraseAssembly } from './usePhraseAssembly.js'
import PhraseWordChip from './PhraseWordChip.jsx'
import PhraseAnswerRow from './PhraseAnswerRow.jsx'

export default function PhraseAssemblyPanel({ node }) {
  const { shuffled, placed, usedIdxs, result, isAnswered, pickChip, removePlaced, checkAnswer } =
    usePhraseAssembly(node)

  const responseText = result === 'correct'
    ? (node.typeData?.phrase_assembly?.responseCorrect ?? '')
    : (result === 'wrong' ? (node.typeData?.phrase_assembly?.responseWrong ?? '') : '')

  return (
    <div className="phrasePanel">
      <div className="phraseInner">
        {result && responseText && (
          <div className="phraseResponseRow">
            <div className={`phraseResponseBubble${result === 'correct' ? ' phraseResponseOk' : ' phraseResponseErr'}`}>
              {responseText}
            </div>
          </div>
        )}
        <PhraseAnswerRow placed={placed} result={result} onRemove={removePlaced} />
        <div className="phrasePool">
          {shuffled.map((word, i) => (
            <PhraseWordChip
              key={i}
              word={word}
              used={usedIdxs.has(i)}
              disabled={isAnswered}
              onClick={() => pickChip(i)}
            />
          ))}
        </div>
        <button
          className="phraseCheckBtn"
          onClick={checkAnswer}
          disabled={placed.length === 0 || isAnswered}
        >
          Проверить
        </button>
      </div>
    </div>
  )
}
