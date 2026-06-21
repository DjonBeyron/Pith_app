import { useState, useEffect } from 'react'
import { useChooseWord } from './useChooseWord.js'
import ChooseWordOption from './ChooseWordOption.jsx'

export default function ChooseWordPanel({ node, onDone, onAnswered }) {
  const { options, selectedId, result, isAnswered, handlePick } = useChooseWord(node)
  const [show, setShow] = useState(false)

  const responseText = result === 'correct'
    ? (node.typeData?.word_choice?.responseCorrect ?? '')
    : (node.typeData?.word_choice?.responseWrong   ?? '')

  // Slide-in: один кадр после монтирования → добавляем класс → max-height анимация
  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // После ответа: сообщаем родителю, затем задержка → slide-out → onDone
  useEffect(() => {
    if (!isAnswered) return
    onAnswered?.(responseText, result)
    const slideOut = setTimeout(() => setShow(false), 700)
    const done     = setTimeout(() => onDone?.(), 700 + 380)
    return () => { clearTimeout(slideOut); clearTimeout(done) }
  }, [isAnswered]) // eslint-disable-line

  function getState(opt) {
    if (!isAnswered) return 'default'
    if (opt.id === selectedId) return result
    return 'dimmed'
  }

  return (
    <div className={`chooseWordPanel${show ? ' chooseWordPanelVisible' : ''}`}>
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
