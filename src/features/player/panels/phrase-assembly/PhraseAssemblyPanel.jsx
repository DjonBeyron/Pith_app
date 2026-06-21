import { useState, useEffect, useRef } from 'react'
import { usePhraseAssembly } from './usePhraseAssembly.js'
import PhraseWordChip from './PhraseWordChip.jsx'
import PhraseAnswerRow from './PhraseAnswerRow.jsx'

function wordsSuffix(n) {
  return n === 1 ? 'слова' : 'слов'
}

export default function PhraseAssemblyPanel({ node, onDone, onAnswered, onHint, onHeightChange }) {
  const { shuffled, placed, usedIdxs, result, isAnswered, pickChip, removePlaced, checkAnswer } =
    usePhraseAssembly(node)
  const [show, setShow] = useState(false)
  const [panelHeight, setPanelHeight] = useState(0)
  const panelRef   = useRef(null)
  const wrongCount = useRef(0)

  const pa          = node.typeData?.phrase_assembly ?? {}
  const words       = pa.words ?? []
  const wordsTotal  = words.length
  const responseWrong   = pa.responseWrong   ?? ''
  const responseCorrect = pa.responseCorrect ?? ''

  useEffect(() => {
    const h = panelRef.current?.offsetHeight ?? 0
    setPanelHeight(h)
    onHeightChange?.(h)
  }, [shuffled.length])

  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    if (result !== 'wrong') return
    wrongCount.current += 1
    if (wrongCount.current === 1) {
      onAnswered?.(responseWrong, 'wrong')
    } else if (wrongCount.current === 2) {
      onHint?.(`Собери фразу из ${wordsTotal} ${wordsSuffix(wordsTotal)}`)
    } else if (wrongCount.current >= 3) {
      // 3-й неверный: панель уходит, триггер срабатывает
      const slideOut = setTimeout(() => setShow(false), 400)
      const done     = setTimeout(() => { onHeightChange?.(0); onDone?.() }, 400 + 420)
      return () => { clearTimeout(slideOut); clearTimeout(done) }
    }
  }, [result]) // eslint-disable-line

  // Верный: responseCorrect в чат как новый пузырь, задержка, slide-out
  useEffect(() => {
    if (!isAnswered) return
    const answer   = setTimeout(() => onAnswered?.(responseCorrect, 'correct'), 700)
    const slideOut = setTimeout(() => setShow(false), 700 + 900)
    const done     = setTimeout(() => { onHeightChange?.(0); onDone?.() }, 700 + 900 + 420)
    return () => { clearTimeout(answer); clearTimeout(slideOut); clearTimeout(done) }
  }, [isAnswered]) // eslint-disable-line

  return (
    <>
      <div
        className="phraseAssemblySpacer"
        style={{
          height: show ? panelHeight : 0,
          transition: show
            ? 'height 0.38s cubic-bezier(0.22, 1, 0.36, 1)'
            : 'height 0.28s cubic-bezier(0.4, 0, 1, 1)',
        }}
      />
      <div
        ref={panelRef}
        className={`phrasePanel${show ? ' phrasePanelVisible' : ''}`}
      >
        <div className="phraseInner">
          <div className="phraseCounter">{placed.length} из {wordsTotal}</div>
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
    </>
  )
}
