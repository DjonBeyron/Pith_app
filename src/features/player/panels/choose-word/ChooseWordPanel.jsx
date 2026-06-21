import { useEffect } from 'react'
import { useChooseWord } from './useChooseWord.js'
import ChooseWordOption from './ChooseWordOption.jsx'

export default function ChooseWordPanel({ node, onDone, onAnswered }) {
  const { options, selectedId, result, isAnswered, handlePick } = useChooseWord(node)

  const responseText = result === 'correct'
    ? (node.typeData?.word_choice?.responseCorrect ?? '')
    : (node.typeData?.word_choice?.responseWrong   ?? '')

  useEffect(() => {
    if (!isAnswered) return
    onAnswered?.(responseText, result)
    onDone?.()
  }, [isAnswered]) // eslint-disable-line

  function getState(opt) {
    if (!isAnswered) return 'default'
    if (opt.id === selectedId) return result
    return 'dimmed'
  }

  return (
    <div className="chooseWordPanel">
      <div className="chooseWordInner">
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
