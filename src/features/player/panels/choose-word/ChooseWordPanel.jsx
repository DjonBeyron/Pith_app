import { useState, useEffect, useRef } from 'react'
import { useChooseWord } from './useChooseWord.js'
import ChooseWordOption from './ChooseWordOption.jsx'
import { playSound } from '../../../../shared/lib/sounds.js'
import { pLog } from '../../../../shared/lib/debug.js'

export default function ChooseWordPanel({ node, onDone, onAnswered, onHeightChange, xpAmount = 0, onXpEarned }) {
  const { options, selectedId, result, isAnswered, handlePick } = useChooseWord(node)
  const [show, setShow] = useState(false)
  const [panelHeight, setPanelHeight] = useState(0)
  const panelRef   = useRef(null)
  const xpFiredRef = useRef(false)

  const responseText = result === 'correct'
    ? (node.typeData?.word_choice?.responseCorrect ?? '')
    : (node.typeData?.word_choice?.responseWrong   ?? '')

  useEffect(() => {
    const h = panelRef.current?.offsetHeight ?? 0
    setPanelHeight(h)
    onHeightChange?.(h)
  }, [options.length])

  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // onAnswered откладывается до slide-out — пузырь появляется из-за края панели
  useEffect(() => {
    if (!isAnswered) return
    const triggerResult = result === 'correct' ? 'word_correct' : 'word_wrong'
    const answer   = setTimeout(() => onAnswered?.(responseText, result), 700)
    const slideOut = setTimeout(() => setShow(false), 700 + 900)
    const done     = setTimeout(() => onDone?.(triggerResult), 700 + 900 + 420)
    return () => { clearTimeout(answer); clearTimeout(slideOut); clearTimeout(done) }
  }, [isAnswered]) // eslint-disable-line

  function getState(opt) {
    if (!isAnswered) return 'default'
    if (opt.id === selectedId) return result
    return 'dimmed'
  }

  return (
    <>
      {/* Спейсер синхронизирован с панелью: вход — spring, уход — ускорение */}
      <div
        className="chooseWordSpacer"
        style={{
          height: show ? panelHeight : 0,
          transition: show
            ? 'height 0.38s cubic-bezier(0.22, 1, 0.36, 1)'
            : 'height 0.28s cubic-bezier(0.4, 0, 1, 1)',
        }}
      />
      {/* Панель вне потока (fixed) — анимируется через translateY на GPU */}
      <div
        ref={panelRef}
        className={`chooseWordPanel${show ? ' chooseWordPanelVisible' : ''}`}
      >
        <div className="chooseWordInner">
          {options.map(opt => (
            <ChooseWordOption
              key={opt.id}
              text={opt.text}
              state={getState(opt)}
              onClick={(e) => {
                const snd = opt.isCorrect ? 'answer-correct' : 'answer-wrong'
                pLog(`[word-choice] tap isCorrect=${opt.isCorrect} → sound=${snd}`)
                playSound(snd)
                if (opt.isCorrect && xpAmount > 0 && !xpFiredRef.current) {
                  xpFiredRef.current = true
                  const rect = e.currentTarget.getBoundingClientRect()
                  onXpEarned?.(xpAmount, rect)
                }
                handlePick(opt)
              }}
              disabled={isAnswered}
            />
          ))}
        </div>
      </div>
    </>
  )
}
