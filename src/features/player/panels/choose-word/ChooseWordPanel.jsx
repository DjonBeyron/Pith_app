import { useState, useEffect, useRef } from 'react'
import { useChooseWord } from './useChooseWord.js'
import ChooseWordOption from './ChooseWordOption.jsx'

export default function ChooseWordPanel({ node, onDone, onAnswered, onHeightChange }) {
  const { options, selectedId, result, isAnswered, handlePick } = useChooseWord(node)
  const [show, setShow] = useState(false)
  const [panelHeight, setPanelHeight] = useState(0)
  const panelRef = useRef(null)

  const responseText = result === 'correct'
    ? (node.typeData?.word_choice?.responseCorrect ?? '')
    : (node.typeData?.word_choice?.responseWrong   ?? '')

  // Измеряем высоту панели и сообщаем родителю для bottomOffset
  useEffect(() => {
    const h = panelRef.current?.offsetHeight ?? -1
    console.log('[CWP] measured panelHeight=', h, 'options=', options.length)
    setPanelHeight(h)
    onHeightChange?.(h)
  }, [options.length])

  // Slide-in: один кадр после монтирования
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      console.log('[CWP] show → true, panelHeight=', panelRef.current?.offsetHeight)
      setShow(true)
    })
    return () => cancelAnimationFrame(id)
  }, [])

  // onAnswered откладывается до slide-out — пузырь появляется из-за края панели
  useEffect(() => {
    if (!isAnswered) return
    console.log('[CWP] answered → slide-out in 700ms, panelHeight=', panelHeight)
    const answer   = setTimeout(() => onAnswered?.(responseText, result), 700)
    const slideOut = setTimeout(() => { console.log('[CWP] show → false'); setShow(false) }, 700 + 900)
    const done     = setTimeout(() => onDone?.(), 700 + 900 + 420)
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
          <div style={{fontSize:9,color:'rgba(255,255,255,0.3)',marginBottom:2}}>
            h={panelHeight} show={String(show)}
          </div>
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
    </>
  )
}
