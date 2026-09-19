import { useState, useEffect, useRef } from 'react'
import { useChooseWord } from './useChooseWord.js'
import ChooseWordOption from './ChooseWordOption.jsx'
import { playSound } from '../../../../shared/lib/sounds.js'
import { rememberTap } from '../../xpAnchor.js'
import { pLog } from '../../../../shared/lib/debug.js'
import { fireBurst } from '../../../../shared/lib/burstParticles.js'
import { isRewardOn } from '../../../../shared/lib/nodeReward.js'
import { usePanelRiseDrop } from '../usePanelRiseDrop.js'

// Порядок после тапа (PROJECT.md, «история знает высоту ответа заранее»):
// 700мс ученик видит цвет варианта → ОДНИМ тиком: салют, пузыри ответа встают
// в ленту НЕВИДИМЫМИ (arriving, WordChoiceModule) и панель закрывается —
// раскладка сразу конечная, история едет вниз вместе с панелью ровно до
// места, где останется после прихода ответа (спуск меряется по опоре) →
// в момент ОСТАНОВКИ истории (считается из кривой спуска, panelRise.js)
// пузыри проявляются и въезжают снизу навстречу уходящей панели → нода
// закрывается. Раньше реплика прилетала НАД панелью и толкала историю вверх,
// потом всё съезжало вниз, а после ухода панели история снова поднималась.
//
// onPicked — статистика по тапу (сразу); onPickToChat — выбранное слово
// пузырём справа (только при галочке «отправлять выбранное в чат»);
// onRevealAnswer — снять arriving, когда панель ушла (PlayerPanels.jsx).
const SEE_RESULT_MS = 700

export default function ChooseWordPanel({
  node, onDone, onAnswered, onRevealAnswer, onPicked, onPickToChat, onHeightChange, xpAmount = 0, onXpEarned,
}) {
  const { options, selectedId, result, isAnswered, handlePick } = useChooseWord(node)
  const [show, setShow] = useState(false)
  const [panelHeight, setPanelHeight] = useState(0)
  const panelRef   = useRef(null)
  const xpFiredRef = useRef(false)

  const wcData = node.typeData?.word_choice ?? {}
  const responseText = result === 'correct'
    ? (wcData.responseCorrect ?? '')
    : (wcData.responseWrong   ?? '')

  useEffect(() => {
    const h = panelRef.current?.offsetHeight ?? 0
    setPanelHeight(h)
    onHeightChange?.(h)
  }, [options.length])

  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // Подъём/спуск с историей — общий хук (usePanelRiseDrop.js → panelRise.js)
  const rise = usePanelRiseDrop({ show, panelRef, spacerSel: '.chooseWordSpacer', panelH: panelHeight, label: 'wc' })

  useEffect(() => {
    if (!isAnswered) return
    const triggerResult = result === 'correct' ? 'word_correct' : 'word_wrong'
    const picked = options.find(o => o.id === selectedId)
    const id = setTimeout(() => {
      // Салют — праздник НАГРАДЫ: снята галочка «Получить награду» — XP не
      // начисляется, и салютовать нечему (правило общее, nodeReward.js).
      // Стартует в тот же тик, что и уход панели
      if (result === 'correct' && isRewardOn('word_choice', wcData)) {
        fireBurst({ count: 30, size: 4, zIndex: 85, portalTo: '.lessonPlayer' })
      }
      // Опора и что проявить на остановке истории — хуку; пузыри и закрытие
      // ОДНИМ тиком (React батчит): строки встают в ленту невидимыми
      // (arriving, WordChoiceModule), раскладка сразу конечная
      rise.prepareClose({ reveal: {
        onReveal: () => onRevealAnswer?.(),
        done: () => onDone?.(triggerResult, selectedId),
      } })
      if (picked) onPickToChat?.(picked.text)
      onAnswered?.(responseText, result)
      setShow(false)
      pLog(`[word-choice] панель закрывается (result=${result}), пузыри уже в ленте невидимыми`)
    }, SEE_RESULT_MS)
    return () => clearTimeout(id)
  }, [isAnswered]) // eslint-disable-line
  function getState(opt) {
    if (!isAnswered) return 'default'
    if (opt.id === selectedId) return result
    return 'dimmed'
  }

  return (
    <>
      {/* Распорка: высота меняется РАЗОМ в обе стороны — движение истории
          целиком играет трансформ ленты (panelRise.js), height-анимации нет */}
      <div
        className="chooseWordSpacer"
        style={{ height: show ? panelHeight : 0, transition: 'none' }}
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
                playSound(snd, 'выбор слова')
                rememberTap(e.currentTarget.getBoundingClientRect())
                if (opt.isCorrect && xpAmount > 0 && !xpFiredRef.current) {
                  xpFiredRef.current = true
                  // Пузырь ответа будет, если в чат уходит выбранное слово или
                  // есть реплика на верный — XP тогда ждёт его и летит от него
                  const expectBubble = !!onPickToChat || !!wcData.responseCorrect?.trim()
                  onXpEarned?.(xpAmount, { expectBubble })
                }
                if (!isAnswered) onPicked?.(opt)
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
