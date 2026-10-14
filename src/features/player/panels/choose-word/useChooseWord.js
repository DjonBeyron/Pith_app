import { useState } from 'react'
import { useAnswerOrder } from '../../useAnswerOrder.js'
import { playWord } from '../../word-audio/wordAudioPlayer.js'
import { wordKey } from '../../../../shared/lib/wordAudio/wordKey.js'
import { wordChoiceVoice } from '../../../../shared/lib/wordChoiceVoice.js'

export function useChooseWord(node) {
  const [selectedId, setSelectedId] = useState(null)
  const [result,     setResult]     = useState(null) // 'correct' | 'wrong' | null
  const [timedOut,   setTimedOut]   = useState(false) // время на ответ вышло (timeLimitSec): итог «неверно» без выбора

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

  // Время вышло: никто не выбран, итог «неверно» (выход word_wrong). В статистику ошибок это не идёт — панель зовёт onPicked только по тапу
  function handleTimeout() {
    if (result !== null) return
    setTimedOut(true)
    setResult('wrong')
  }

  return { options, selectedId, result, isAnswered, timedOut, handlePick, handleTimeout }
}
