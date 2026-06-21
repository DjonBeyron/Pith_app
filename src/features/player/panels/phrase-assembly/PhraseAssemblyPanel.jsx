import { useState, useEffect, useRef } from 'react'
import { usePhraseAssembly } from './usePhraseAssembly.js'
import PhraseWordChip from './PhraseWordChip.jsx'
import PhraseAnswerRow from './PhraseAnswerRow.jsx'
import { pLog } from '../../../../shared/lib/debug.js'

function wordForm(n) {
  const m10 = n % 10, m100 = n % 100
  if (m100 >= 11 && m100 <= 14) return 'слов'
  if (m10 === 1) return 'слово'
  if (m10 >= 2 && m10 <= 4) return 'слова'
  return 'слов'
}

function wordFormGenitive(n) {
  return n === 1 ? 'слова' : 'слов'
}

export default function PhraseAssemblyPanel({ node, onDone, onAnswered, onHint, onHeightChange }) {
  const { shuffled, placed, usedIdxs, result, isAnswered, pickChip, removePlaced, checkAnswer } =
    usePhraseAssembly(node)
  const [show, setShow]               = useState(false)
  const [panelHeight, setPanelHeight] = useState(0)
  const [showCounter, setShowCounter] = useState(false)
  const panelRef   = useRef(null)
  const wrongCount = useRef(0)

  const pa              = node.typeData?.phrase_assembly ?? {}
  const words           = pa.words ?? []
  const wordsTotal      = words.length
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
    const wc = wrongCount.current
    pLog('[PhraseAssembly] wrong #', wc, 'placed=', placed.map(p => p.word).join(' '))

    if (wc === 1) {
      onAnswered?.(responseWrong, 'wrong')
    } else if (wc === 2) {
      onHint?.(`Собери фразу из ${wordsTotal} ${wordFormGenitive(wordsTotal)}`)
      setTimeout(() => setShowCounter(true), 350)
    } else if (wc >= 3) {
      // 3-й неверный: собранная фраза в чат справа красным + триггер phrase_wrong
      const phrase = placed.map(p => p.word).join(' ')
      onAnswered?.(phrase, 'wrong_final')
      const slideOut = setTimeout(() => setShow(false), 700)
      const done     = setTimeout(() => {
        onHeightChange?.(0)
        pLog('[PhraseAssembly] onDone phrase_wrong, nodeId=', node.id)
        onDone?.('phrase_wrong')
      }, 700 + 420)
      return () => { clearTimeout(slideOut); clearTimeout(done) }
    }
  }, [result]) // eslint-disable-line

  useEffect(() => {
    if (!isAnswered) return
    const phrase = placed.map(p => p.word).join(' ')
    pLog('[PhraseAssembly] correct, onDone phrase_correct, nodeId=', node.id)
    const answer   = setTimeout(() => onAnswered?.(responseCorrect, 'correct'), 700)
    const slideOut = setTimeout(() => setShow(false), 700 + 900)
    const done     = setTimeout(() => { onHeightChange?.(0); onDone?.('phrase_correct') }, 700 + 900 + 420)
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
          <div className={`phraseCounter${showCounter ? ' phraseCounterVisible' : ''}`}>
            выбрано {placed.length} {wordForm(placed.length)} из {wordsTotal}
          </div>
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
