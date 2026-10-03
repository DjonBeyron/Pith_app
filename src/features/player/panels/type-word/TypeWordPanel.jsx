import { useState, useEffect, useRef } from 'react'
import { useTypeWord } from './useTypeWord.js'
import TypeWordKeyboard from './TypeWordKeyboard.jsx'
import { letterCount, letterForm } from '../../../../shared/lib/typeWordKeys.js'
import { playSound } from '../../../../shared/lib/sounds.js'
import { usePanelHeight } from '../usePanelHeight.js'
import { usePanelRiseDrop } from '../usePanelRiseDrop.js'
import { fireBurst } from '../../../../shared/lib/burstParticles.js'
import { isRewardOn } from '../../../../shared/lib/nodeReward.js'
import { playWord } from '../../word-audio/wordAudioPlayer.js'
import { wordKey } from '../../../../shared/lib/wordAudio/wordKey.js'

// Ученик видит итог в панели (зелёный/красный, тряска), потом панель уезжает
const SEE_RESULT_MS = 700

// Панель «Напечатай слово»: за основу взята «Собери фразу» (тот же корпус панели,
// строка ответа, «Проверить», тот же подъём/спуск с историей), но вместо банка слов
// — клавиатура как на iPhone, где светятся только нужные буквы (TypeWordKeyboard.jsx).
// Три попытки, как у «Собери фразу»; сигналов ошибок нет.
export default function TypeWordPanel({
  node, onDone, onAnswered, onRevealAnswer, onChecked, onHeightChange, xpAmount = 0, onXpEarned,
}) {
  const tw = useTypeWord(node)
  const d = node.typeData?.type_word ?? {}
  const { word, typed, result, frozen } = tw
  const [show, setShow]               = useState(false)
  const [showCounter, setShowCounter] = useState(false)
  const panelRef   = useRef(null)
  const wrongCount = useRef(0)
  const timers     = useRef([])

  const panelHeight = usePanelHeight(panelRef, onHeightChange)

  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const rise = usePanelRiseDrop({ show, panelRef, spacerSel: '.typeWordSpacer', panelH: panelHeight, label: 'tw' })

  // Закрытие по итогу («история знает высоту ответа заранее», PROJECT.md): одним
  // тиком — пузыри в ленту НЕВИДИМЫМИ (arriving) и setShow(false); на остановке
  // истории хук проявляет пузыри, после въезда — закрывает ноду
  function closeWith(trigger, sendBubbles) {
    rise.prepareClose({ reveal: {
      onReveal: () => onRevealAnswer?.(),
      done: () => { onHeightChange?.(0); onDone?.(trigger) },
    } })
    sendBubbles()
    setShow(false)
  }

  function later(fn) { timers.current.push(setTimeout(fn, SEE_RESULT_MS)) }

  function onCheck() {
    const r = tw.check()
    if (!r) return
    onChecked?.(r, typed)
    playSound(r === 'correct' ? 'answer-correct' : 'answer-wrong', 'напечатай слово')

    if (r === 'correct') {
      playWord(wordKey(word)) // услышать слово целиком — награда за верно напечатанное
      // Пузырь в чате будет всегда — XP ждёт его и летит от него
      if (xpAmount > 0) onXpEarned?.(xpAmount, { expectBubble: true })
      later(() => {
        if (isRewardOn('type_word', d)) fireBurst({ count: 30, size: 4, zIndex: 85, portalTo: '.lessonPlayer' })
        closeWith('type_correct', () => {
          // В чат — слово так, как его написал автор (регистр: London), а не как напечатал ученик
          onAnswered?.(word, 'correct', true)
          if (d.responseCorrect?.trim()) onAnswered?.(d.responseCorrect, 'hint', true)
        })
      })
      return
    }

    wrongCount.current += 1
    const wc = wrongCount.current
    // Напечатанное (неверное) — СПРАВА, красным, от лица ученика; подсказка учителя — следом
    if (wc < 3 && typed.trim()) onAnswered?.(typed, 'wrong_final')
    if (wc === 1) {
      if (d.responseWrong?.trim()) onAnswered?.(d.responseWrong, 'hint')
    } else if (wc === 2) {
      const n = letterCount(word)
      onAnswered?.(`Слово из ${n} ${letterForm(n)}`, 'hint')
      timers.current.push(setTimeout(() => setShowCounter(true), 350))
    } else {
      tw.lock()
      later(() => closeWith('type_wrong', () => {
        if (typed.trim()) onAnswered?.(typed, 'wrong_final', true)
        // Раскрываем слово: после трёх попыток важнее увидеть верное написание
        if (word.trim()) onAnswered?.(word, 'hint', true)
      }))
    }
  }

  if (!word.trim()) return null

  const rowCls = [
    'phraseAnswerRow twAnswerRow',
    typed && !result ? 'phraseAnswerFilled' : '',
    result === 'wrong' ? 'phraseAnswerErr' : '',
    result === 'correct' ? 'twAnswerOk' : '',
  ].filter(Boolean).join(' ')

  return (
    <>
      {/* Распорка: на подъёме и спуске высота меняется РАЗОМ — движение истории играет
          трансформ ленты (panelRise.js); между ними плавно следует за ростом панели */}
      <div
        className="typeWordSpacer"
        style={{
          height: show ? panelHeight : 0,
          transition: show && !rise.opening ? 'height 0.26s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
        }}
      />
      <div ref={panelRef} className={`phrasePanel${show ? ' phrasePanelVisible' : ''}`}>
        <div className="phraseInner">
          <div className={`phraseCounter${showCounter ? ' phraseCounterVisible' : ''}`}>
            букв: {typed.replace(/\s/g, '').length} из {letterCount(word)}
          </div>
          <div className={rowCls} aria-live="polite">
            {typed === '' && <span className="phraseAnswerPlaceholder">Напечатай слово...</span>}
            {typed !== '' && <span className="twTyped" data-testid="tw-typed">{typed}</span>}
            {!frozen && <span className="twCaret" aria-hidden="true" />}
          </div>
          <TypeWordKeyboard model={tw.model} disabled={frozen} onKey={tw.press} onBackspace={tw.backspace} />
          <button
            className="phraseCheckBtn"
            onClick={onCheck}
            disabled={!typed.trim() || frozen || result === 'wrong'}
          >
            Проверить
          </button>
        </div>
      </div>
    </>
  )
}
