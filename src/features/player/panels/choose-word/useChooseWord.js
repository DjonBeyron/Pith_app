import { useState } from 'react'
import { useAnswerOrder } from '../../useAnswerOrder.js'

export function useChooseWord(node) {
  const [selectedId, setSelectedId] = useState(null)
  const [result,     setResult]     = useState(null) // 'correct' | 'wrong' | null

  // Порядок строк: ученику случайный, админу — верные первыми (useAnswerOrder.js)
  const options    = useAnswerOrder(node.typeData?.word_choice?.options ?? [], o => !!o.isCorrect)
  const isAnswered = result !== null

  function handlePick(option) {
    if (isAnswered) return
    setSelectedId(option.id)
    setResult(option.isCorrect ? 'correct' : 'wrong')
  }

  return { options, selectedId, result, isAnswered, handlePick }
}
