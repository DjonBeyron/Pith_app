import { useState } from 'react'
import { useAnswerOrder } from '../../useAnswerOrder.js'
import { playWord } from '../../word-audio/wordAudioPlayer.js'
import { wordKey } from '../../../../shared/lib/wordAudio/wordKey.js'
import { wordChoiceVoice } from '../../../../shared/lib/wordChoiceVoice.js'

export function useChooseWord(node) {
  const [selectedId, setSelectedId] = useState(null)
  const [result,     setResult]     = useState(null) // 'correct' | 'wrong' | null

  // Порядок строк: ученику случайный, админу — верные первыми (useAnswerOrder.js)
  const options    = useAnswerOrder(node.typeData?.word_choice?.options ?? [], o => !!o.isCorrect)
  const isAnswered = result !== null

  function handlePick(option) {
    if (isAnswered) return
    setSelectedId(option.id)
    // Озвучка — только верного и только если включено в админке (wordChoiceVoice.js)
    if (option.isCorrect && wordChoiceVoice.get()) playWord(wordKey(option.text))
    setResult(option.isCorrect ? 'correct' : 'wrong')
  }

  return { options, selectedId, result, isAnswered, handlePick }
}
