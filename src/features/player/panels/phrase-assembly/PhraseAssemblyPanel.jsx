import { useState, useEffect, useRef } from 'react'
import { usePhraseAssembly } from './usePhraseAssembly.js'
import PhraseWordChip from './PhraseWordChip.jsx'
import PhraseAnswerRow from './PhraseAnswerRow.jsx'

export default function PhraseAssemblyPanel({ node, onDone, onAnswered, onHint, onHeightChange }) {
  const { shuffled, placed, usedIdxs, result, isAnswered, pickChip, removePlaced, checkAnswer } =
    usePhraseAssembly(node)
  const [show, setShow] = useState(false)
  const [panelHeight, setPanelHeight] = useState(0)
  const panelRef   = useRef(null)
  const wrongCount = useRef(0)

  const words      = node.typeData?.phrase_assembly?.words ?? []
  const wordsTotal = words.length

  useEffect(() => {
    const h = panelRef.current?.offsetHeight ?? 0
    setPanelHeight(h)
    onHeightChange?.(h)
  }, [shuffled.length])

  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // Неверный: 1-й → фраза в чат, 2-й → подсказка, дальше тихо, панель остаётся
  useEffect(() => {
    if (result !== 'wrong') return
    wrongCount.current += 1
    const phrase = placed.map(p => p.word).join(' ')
    if (wrongCount.current === 1) {
      onAnswered?.(phrase, 'wrong')
    } else if (wrongCount.current === 2) {
      onHint?.(`Собери фразу из ${wordsTotal} слов`)
    }
  }, [result]) // eslint-disable-line

  // Верный: фраза в чат, задержка, slide-out
  useEffect(() => {
    if (!isAnswered) return
    const phrase = placed.map(p => p.word).join(' ')
    const answer   = setTimeout(() => onAnswered?.(phrase, 'correct'), 700)
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
