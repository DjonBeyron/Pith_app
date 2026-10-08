import { useState, useEffect, useRef } from 'react'
import { useTypeWord } from './useTypeWord.js'
import TypeWordKeyboard from './TypeWordKeyboard.jsx'
import TypeWordTyped from './TypeWordTyped.jsx'
import { letterCount, letterForm, capitalizeFirst, needsShift } from '../../../../shared/lib/typeWordKeys.js'
import { playSound } from '../../../../shared/lib/sounds.js'
import { usePanelHeight } from '../usePanelHeight.js'
import { usePanelRiseDrop } from '../usePanelRiseDrop.js'
import { fireBurst } from '../../../../shared/lib/burstParticles.js'
import { isRewardOn } from '../../../../shared/lib/nodeReward.js'
import { playWord } from '../../word-audio/wordAudioPlayer.js'
import { wordKey } from '../../../../shared/lib/wordAudio/wordKey.js'
import SolveCorrectButton from '../../admin/SolveCorrectButton.jsx'
import { typeWholeWord } from './solveCorrect.js'
import { useSolveAfterRender } from '../useSolveAfterRender.js'

// Ученик видит итог в панели (зелёный/красный, тряска), потом панель уезжает
const SEE_RESULT_MS = 700

// Панель «Напечатай слово»: за основу взята «Собери фразу» (тот же корпус панели,
// строка ответа, «Проверить», тот же подъём/спуск с историей), но вместо банка слов
// — клавиатура как на iPhone, где светятся только нужные буквы (TypeWordKeyboard.jsx).
// Три попытки, как у «Собери фразу»; сигналы ошибок — тоже как у неё (см. useTypeWord.js).
export default function TypeWordPanel({
  node, onDone, onAnswered, onRevealAnswer, onChecked, onHeightChange, xpAmount = 0, onXpEarned,
  // Сигналы ошибок: nodes — все ноды урока (резолв ref), onSignalFired(node, release,
  // exerciseNodeId) — рисует сигнал сообщением в ленте, hasSignalFired(nodeId) — один раз за урок
  nodes = [], onSignalFired, hasSignalFired,
}) {
  const tw = useTypeWord(node, nodes, onSignalFired, hasSignalFired)
  const d = node.typeData?.type_word ?? {}
  const { word, typed, result, frozen } = tw
  // В чат слово уходит с заглавной, как его печатает ученик (первая буква всегда заглавная)
  const shownWord = capitalizeFirst(word.trim())
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
    // 'signal' — сигнал ошибки автора уже показан: попытка «бесплатная», ни звука, ни счёта,
    // ни статистики, панель не закрывается (см. useTypeWord.js)
    if (!r || r === 'signal') return
    onChecked?.(r, typed)
    if (r !== 'correct') playSound('answer-wrong', 'напечатай слово')

    if (r === 'correct') {
      // Услышать слово целиком — награда за верно напечатанное; «верно» звучит
      // ПОСЛЕ слова, а не поверх него (нет озвучки — сразу)
      const correct = () => playSound('answer-correct', 'напечатай слово')
      if (!playWord(wordKey(word), { onEnded: correct })) correct()
      // Пузырь в чате будет всегда — XP ждёт его и летит от него
      if (xpAmount > 0) onXpEarned?.(xpAmount, { expectBubble: true })
      later(() => {
        if (isRewardOn('type_word', d)) fireBurst({ count: 30, size: 4, zIndex: 85, portalTo: '.lessonPlayer' })
        closeWith('type_correct', () => {
          // В чат — слово с заглавной; остальной регистр — как написал автор (iPhone), а не как напечатал ученик
          onAnswered?.(shownWord, 'correct', true)
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
        if (shownWord) onAnswered?.(shownWord, 'hint', true)
      }))
    }
  }

  // Авто-ответ админа: слово целиком, как будто напечатано по буквам
  // (solveCorrect.js); проверка — после коммита, когда tw.check видит новый
  // typed (useSolveAfterRender). XP тут и так летит от пузыря — тап не нужен
  const armSolve = useSolveAfterRender(typed, onCheck)
  function solveCorrect() {
    if (frozen || result) return
    armSolve()
    tw.setAll(typeWholeWord(word))
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
        <SolveCorrectButton onSolve={solveCorrect} disabled={frozen || !!result} />
        <div className="phraseInner">
          <div className={`phraseCounter${showCounter ? ' phraseCounterVisible' : ''}`}>
            букв: {typed.replace(/\s/g, '').length} из {letterCount(word)}
          </div>
          <div className={rowCls} aria-live="polite" aria-label="Напечатай слово">
            {/* Курсор внутри TypeWordTyped и вне потока (absolute): его появление/исчезновение текст не сдвигает */}
            <TypeWordTyped typed={typed} blinkIndex={tw.blinkIndex} caret={!frozen} />
          </div>
          <TypeWordKeyboard model={tw.model} disabled={frozen} shift={needsShift(typed)} onKey={tw.press} onBackspace={tw.backspace} />
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
