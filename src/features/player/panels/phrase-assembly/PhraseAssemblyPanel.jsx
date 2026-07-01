import { useState, useEffect, useRef } from 'react'
import { usePhraseAssembly } from './usePhraseAssembly.js'
import PhraseWordChip from './PhraseWordChip.jsx'
import PhraseAnswerRow from './PhraseAnswerRow.jsx'
import { playSound } from '../../../../shared/lib/sounds.js'

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

export default function PhraseAssemblyPanel({ node, onDone, onAnswered, onHeightChange, xpAmount = 0, onXpEarned }) {
  const { shuffled, placed, usedIdxs, result, isAnswered, pickChip, removePlaced, checkAnswer } =
    usePhraseAssembly(node)
  const [show, setShow]               = useState(false)
  const [panelHeight, setPanelHeight] = useState(0)
  const [showCounter, setShowCounter] = useState(false)
  const panelRef    = useRef(null)
  const checkBtnRef = useRef(null)
  const wrongCount  = useRef(0)
  const xpFiredRef  = useRef(false)
  // Refs for close timers so effect cleanup (result→null) can't cancel them
  const closeTimers = useRef([])

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
    if (wc === 1) {
      if (responseWrong.trim()) onAnswered?.(responseWrong, 'wrong')
    } else if (wc === 2) {
      onAnswered?.(`Собери фразу из ${wordsTotal} ${wordFormGenitive(wordsTotal)}`, 'hint')
      setTimeout(() => setShowCounter(true), 350)
    } else if (wc >= 3) {
      const phrase = placed.map(p => p.word).join(' ')
      onAnswered?.(phrase, 'wrong_final')
      closeTimers.current.forEach(clearTimeout)
      closeTimers.current = [
        setTimeout(() => setShow(false), 700),
        setTimeout(() => { onHeightChange?.(0); onDone?.('phrase_wrong') }, 700 + 420),
      ]
    }
  }, [result]) // eslint-disable-line

  useEffect(() => {
    if (!isAnswered) return
    const phrase = placed.map(p => p.word).join(' ')
    const answer   = setTimeout(() => { if (responseCorrect.trim()) onAnswered?.(responseCorrect, 'correct') }, 700)
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
            ref={checkBtnRef}
            className="phraseCheckBtn"
            onClick={() => {
              const r = checkAnswer()
              if (!r) return
              playSound(r === 'correct' ? 'answer-correct' : 'answer-wrong')
              if (r === 'correct' && xpAmount > 0 && !xpFiredRef.current) {
                xpFiredRef.current = true
                const rect = checkBtnRef.current?.getBoundingClientRect()
                onXpEarned?.(xpAmount, rect)
              }
            }}
            disabled={placed.length === 0 || isAnswered}
          >
            Проверить
          </button>
        </div>
      </div>
    </>
  )
}
