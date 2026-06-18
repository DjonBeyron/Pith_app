import { useState } from 'react'

export function useChooseWord(node) {
  const [selectedId, setSelectedId] = useState(null)
  const [result,     setResult]     = useState(null) // 'correct' | 'wrong' | null

  const options    = node.typeData?.word_choice?.options ?? []
  const isAnswered = result !== null

  function handlePick(option) {
    if (isAnswered) return
    setSelectedId(option.id)
    setResult(option.isCorrect ? 'correct' : 'wrong')
  }

  return { options, selectedId, result, isAnswered, handlePick }
}
