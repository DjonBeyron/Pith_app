import { useChooseWord } from './useChooseWord.js'
import ChooseWordOption from './ChooseWordOption.jsx'
import ChooseWordResponse from './ChooseWordResponse.jsx'

export default function ChooseWordPanel({ node }) {
  const { options, selectedId, result, isAnswered, handlePick } = useChooseWord(node)
  const responseText = result === 'correct'
    ? (node.typeData?.word_choice?.responseCorrect ?? '')
    : (node.typeData?.word_choice?.responseWrong   ?? '')

  function getState(opt) {
    if (!isAnswered) return 'default'
    if (opt.id === selectedId) return result  // 'correct' | 'wrong'
    return 'dimmed'
  }

  return (
    <div className="chooseWordPanel">
      <div className="chooseWordInner">
        {isAnswered && responseText && (
          <ChooseWordResponse text={responseText} result={result} />
        )}
        {options.map(opt => (
          <ChooseWordOption
            key={opt.id}
            text={opt.text}
            state={getState(opt)}
            onClick={() => handlePick(opt)}
            disabled={isAnswered}
          />
        ))}
      </div>
    </div>
  )
}
