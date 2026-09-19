import { useState, useEffect, useRef } from 'react'
import { usePhraseAssembly } from './usePhraseAssembly.js'
import PhraseWordChip from './PhraseWordChip.jsx'
import PhraseAnswerRow from './PhraseAnswerRow.jsx'
import { playSound } from '../../../../shared/lib/sounds.js'
import { rememberTap } from '../../xpAnchor.js'
import { usePanelHeight } from '../usePanelHeight.js'
import { usePanelRiseDrop } from '../usePanelRiseDrop.js'
import { fireBurst } from '../../../../shared/lib/burstParticles.js'
import { isRewardOn } from '../../../../shared/lib/nodeReward.js'

// Ученик видит итог в панели (зелёный/красный, тряска), потом панель уезжает
const SEE_RESULT_MS = 700

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

export default function PhraseAssemblyPanel({
  node, onDone, onAnswered, onRevealAnswer, onChecked, onHeightChange, xpAmount = 0, onXpEarned,
  // Сигналы ошибок (см. PROJECT.md): nodes — все ноды урока (резолв ref);
  // onSignalFired(node, release, exerciseNodeId) — рисует сигнал как обычное
  // сообщение ленты (LessonPlayer/useSignalMessages.js) вместо прежнего
  // оверлея; hasSignalFired(nodeId) — та же нода-сигнал срабатывает один раз
  nodes = [], onSignalFired, hasSignalFired,
}) {
  const {
    shuffled, placed, usedIdxs, result, isAnswered, pickChip, removePlaced, checkAnswer,
    blinkIndex, freeze,
  } = usePhraseAssembly(node, nodes, onSignalFired, hasSignalFired)
  const [show, setShow]               = useState(false)
  const [showCounter, setShowCounter] = useState(false)
  const panelRef    = useRef(null)
  const wrongCount  = useRef(0)
  const xpFiredRef  = useRef(false)
  // Refs for close timers so effect cleanup (result→null) can't cancel them
  const closeTimers = useRef([])

  const pa              = node.typeData?.phrase_assembly ?? {}
  const words           = pa.words ?? []
  const wordsTotal      = words.length
  const responseWrong   = pa.responseWrong   ?? ''
  const responseCorrect = pa.responseCorrect ?? ''

  const panelHeight = usePanelHeight(panelRef, onHeightChange)

  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // Подъём/спуск с историей — общий хук (usePanelRiseDrop.js → panelRise.js),
  // тот же, что у «выбери слово» и таблиц
  const rise = usePanelRiseDrop({ show, panelRef, spacerSel: '.phraseAssemblySpacer', panelH: panelHeight, label: 'pa' })

  // Закрытие по итогу («история знает высоту ответа заранее», PROJECT.md):
  // одним тиком — салют (на верном), пузыри в ленту НЕВИДИМЫМИ (arriving) и
  // setShow(false); история едет вниз с панелью ровно до места под ответ,
  // на её остановке хук проявляет пузыри, после въезда — закрывает ноду
  function closeWith(trigger, variantId, sendBubbles) {
    rise.prepareClose({ reveal: {
      onReveal: () => onRevealAnswer?.(),
      done: () => { onHeightChange?.(0); onDone?.(trigger, variantId) },
    } })
    sendBubbles()
    setShow(false)
  }

  useEffect(() => {
    if (result !== 'wrong') return
    wrongCount.current += 1
    const wc = wrongCount.current
    const phrase = placed.map(p => p.word).join(' ')
    // Собранная (неверная) фраза — СПРАВА, красным, от лица ученика: видно,
    // ЧТО именно он собрал. Только следом — подсказка учителя обычным
    // цветом ('hint', не 'wrong' — красный оставлен только за ответом
    // ученика). Раньше подсказка приходила одна, без того, с чем её
    // сравнивать. На последней попытке (wc>=3) свой пузырь ниже — здесь не
    // дублируем.
    if (wc < 3 && phrase.trim()) onAnswered?.(phrase, 'wrong_final')
    if (wc === 1) {
      if (responseWrong.trim()) onAnswered?.(responseWrong, 'hint')
    } else if (wc === 2) {
      onAnswered?.(`Собери фразу из ${wordsTotal} ${wordFormGenitive(wordsTotal)}`, 'hint')
      setTimeout(() => setShowCounter(true), 350)
    } else if (wc >= 3) {
      // Особый переход конкретного слова-ловушки (nodeVariants.js) — если в
      // собранной фразе есть распознанный distractor, берём первый
      const variantId = placed.find(p => p.distractorId)?.distractorId ?? null
      // 700мс — ученик видит красный итог и тряску в самой панели
      closeTimers.current.forEach(clearTimeout)
      closeTimers.current = [setTimeout(() => {
        closeWith('phrase_wrong', variantId, () => {
          if (phrase.trim()) onAnswered?.(phrase, 'wrong_final', true)
        })
      }, SEE_RESULT_MS)]
    }
  }, [result]) // eslint-disable-line

  useEffect(() => {
    if (!isAnswered) return
    // В чат уходит СОБРАННАЯ ФРАЗА — так же, как при последней неверной
    // попытке. Раньше сюда отправлялся responseCorrect, а его по легенде
    // обычно не пишут (он рисуется справа, от лица ученика, и получалось бы,
    // что ученик отвечает сам себе) — значит на верный ответ в переписке не
    // появлялось НИЧЕГО. Отсюда же тянулся баг с реакцией: последним пузырём
    // справа оставалась предыдущая неверная попытка, и нода reaction липла к
    // ней. Если responseCorrect всё-таки задан, он идёт следом отдельной
    // репликой учителя.
    const phrase = placed.map(p => p.word).join(' ')
    const id = setTimeout(() => {
      // Салют — праздник награды (nodeReward.js), одним тиком с уходом панели.
      // Живёт здесь, а не на пузыре в чате (PhraseAssemblyModule передаёт
      // confetti={false}): праздник за сам верный ответ
      if (isRewardOn('phrase_assembly', pa)) {
        fireBurst({ count: 30, size: 4, zIndex: 85, portalTo: '.lessonPlayer' })
      }
      closeWith('phrase_correct', undefined, () => {
        if (phrase.trim()) onAnswered?.(phrase, 'correct', true)
        if (responseCorrect.trim()) onAnswered?.(responseCorrect, 'hint', true)
      })
    }, SEE_RESULT_MS)
    return () => clearTimeout(id)
  }, [isAnswered]) // eslint-disable-line

  return (
    <>
      {/* Распорка: на подъёме и спуске высота меняется РАЗОМ — движение
          истории играет трансформ ленты (panelRise.js); между ними плавно
          следует за ростом панели (слова уходят из банка в строку ответа) */}
      <div
        className="phraseAssemblySpacer"
        style={{
          height: show ? panelHeight : 0,
          transition: show && !rise.opening ? 'height 0.26s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
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
          <PhraseAnswerRow placed={placed} result={result} blinkIndex={blinkIndex} freeze={freeze} onRemove={removePlaced} />
          <div className="phrasePool">
            {shuffled.map((chip, i) => (
              <PhraseWordChip
                key={i}
                word={chip.text}
                used={usedIdxs.has(i)}
                disabled={isAnswered || freeze}
                onClick={e => { rememberTap(e.currentTarget.getBoundingClientRect()); pickChip(i) }}
              />
            ))}
          </div>
          <button
            className="phraseCheckBtn"
            onClick={() => {
              const r = checkAnswer()
              // 'signal' — сигнал ошибки автора уже показан (useSignalState.js
              // внутри usePhraseAssembly.js), попытка «бесплатная»: ни звук, ни
              // счётчик неверных, ни статистика её не видят, панель не закрылась
              if (!r || r === 'signal') return
              onChecked?.(r, placed.map(p => p.word).join(' '))
              playSound(r === 'correct' ? 'answer-correct' : 'answer-wrong', 'собери фразу')
              if (r === 'correct' && xpAmount > 0 && !xpFiredRef.current) {
                xpFiredRef.current = true
                // Пузырь с фразой в чате будет всегда — XP ждёт его и летит от него
                onXpEarned?.(xpAmount, { expectBubble: true })
              }
            }}
            disabled={placed.length === 0 || isAnswered || freeze}
          >
            Проверить
          </button>
        </div>
      </div>
    </>
  )
}
