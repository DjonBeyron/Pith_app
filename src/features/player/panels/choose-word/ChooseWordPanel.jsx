import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { useChooseWord } from './useChooseWord.js'
import ChooseWordOption from './ChooseWordOption.jsx'
import { playSound } from '../../../../shared/lib/sounds.js'
import { rememberTap } from '../../xpAnchor.js'
import { pLog } from '../../../../shared/lib/debug.js'
import { fireBurst } from '../../../../shared/lib/burstParticles.js'
import { isRewardOn } from '../../../../shared/lib/nodeReward.js'
import { playPanelRise, playPanelDrop, tracePanelRise } from '../panelRise.js'
import { whenBubbleLanded } from '../whenBubbleLanded.js'

// Порядок после тапа — тот же, что у ручной таблицы (PROJECT.md, «панель
// уезжает раньше ответа»): 700мс ученик видит цвет варианта в панели → панель
// и история едут вниз ОДНИМ тиком с салютом → на освободившееся место
// въезжают пузыри (выбранное слово, если у ноды галочка, и реплика) → нода
// закрывается. Раньше реплика прилетала НАД панелью, толкала историю вверх,
// а потом всё вместе съезжало вниз — два встречных движения подряд.
//
// onPicked — статистика по тапу (сразу); onPickToChat — выбранное слово
// пузырём справа, зовётся ВМЕСТЕ с репликой после ухода панели (передаётся
// только при галочке «отправлять выбранное в чат», см. PlayerPanels.jsx).
const SEE_RESULT_MS = 700
// Панель 0.28s и сдвиг ленты 280мс (panelRise.js) — пузыри после обоих
const PANEL_GONE_MS = 300

export default function ChooseWordPanel({
  node, onDone, onAnswered, onPicked, onPickToChat, onHeightChange, xpAmount = 0, onXpEarned,
}) {
  const { options, selectedId, result, isAnswered, handlePick } = useChooseWord(node)
  const [show, setShow] = useState(false)
  const [panelHeight, setPanelHeight] = useState(0)
  const panelRef   = useRef(null)
  const xpFiredRef = useRef(false)
  // Высота, на которую надо сдвинуть историю при закрытии (см. useLayoutEffect)
  const releaseRef = useRef(0)
  const spacerBeforeRef = useRef(0)

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
    // Высота распорки ДО показа (min-height: safe-area + слот «печатает») —
    // от неё считается, на сколько раскладка реально поднимет историю
    spacerBeforeRef.current = document.querySelector('.chooseWordSpacer')?.getBoundingClientRect().height ?? 0
    const id = requestAnimationFrame(() => setShow(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // Подъём и спуск — одной парой WAAPI-анимаций на панели и ленте
  // (panelRise.js): распорка меняет высоту РАЗОМ (без height-анимации, это
  // layout), видимый скачок гасит трансформ ленты. На подъёме история стоит,
  // пока верх панели не коснётся низа последнего сообщения с итоговым зазором,
  // и только потом едет вверх вместе с панелью; на спуске — зеркально.
  // Layout-эффект: анимации должны встать ДО первой отрисовки нового layout
  useLayoutEffect(() => {
    const panel = panelRef.current
    const spacer = document.querySelector('.chooseWordSpacer')
    if (!panel || !spacer) return
    const spacerH = spacer.getBoundingClientRect().height
    if (show) {
      if (!panelHeight) return
      const drop = Math.max(0, spacerH - spacerBeforeRef.current)
      playPanelRise(panel, { drop, panelH: panelHeight, label: 'wc' })
      tracePanelRise('wc-подъём', panel, '.chooseWordSpacer')
      return
    }
    if (!releaseRef.current) return
    const h = releaseRef.current
    releaseRef.current = 0
    const drop = Math.max(0, h - spacerH)
    playPanelDrop(panel, { drop, panelH: h, label: 'wc' })
    tracePanelRise('wc-спуск', panel, '.chooseWordSpacer', 22)
  }, [show]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isAnswered) return
    const triggerResult = result === 'correct' ? 'word_correct' : 'word_wrong'
    const picked = options.find(o => o.id === selectedId)
    const timers = []
    timers.push(setTimeout(() => {
      // Салют — праздник НАГРАДЫ: снята галочка «Получить награду» — XP не
      // начисляется, и салютовать нечему (правило общее, nodeReward.js).
      // Стартует в тот же тик, что и уход панели
      if (result === 'correct' && isRewardOn('word_choice', wcData)) {
        fireBurst({ count: 30, size: 4, zIndex: 85, portalTo: '.lessonPlayer' })
      }
      releaseRef.current = panelHeight
      setShow(false)
      pLog(`[word-choice] панель закрывается (result=${result}, сдвиг истории ${panelHeight}px)`)
      timers.push(setTimeout(() => {
        pLog('[word-choice] панель уехала → пузыри в чат')
        // flushSync: пузыри должны ОКАЗАТЬСЯ В DOM до того, как whenBubbleLanded
        // спросит у них анимацию въезда
        flushSync(() => {
          if (picked) onPickToChat?.(picked.text)
          onAnswered?.(responseText, result)
        })
        whenBubbleLanded(() => {
          pLog(`[word-choice] пузырь въехал → onDone(${triggerResult})`)
          onDone?.(triggerResult, selectedId)
        })
      }, PANEL_GONE_MS))
    }, SEE_RESULT_MS))
    return () => timers.forEach(clearTimeout)
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
                  onXpEarned?.(xpAmount)
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
