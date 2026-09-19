import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { useChooseWord } from './useChooseWord.js'
import ChooseWordOption from './ChooseWordOption.jsx'
import { playSound } from '../../../../shared/lib/sounds.js'
import { rememberTap } from '../../xpAnchor.js'
import { pLog } from '../../../../shared/lib/debug.js'
import { fireBurst } from '../../../../shared/lib/burstParticles.js'
import { isRewardOn } from '../../../../shared/lib/nodeReward.js'
import { playFeedRelease } from '../feedRelease.js'
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
// Панель 0.28s (.chooseWordPanel) и сдвиг ленты 280мс — пузыри после обоих
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

  // Сдвиг истории — ПОСЛЕ того, как распорка отдала место, но ДО отрисовки
  // (layout-эффект). Приём и цифры — ровно те же, что у TableManualPanel:
  // распорка снимается разом, видимый скачок гасит трансформ на ленте, и он
  // уходит в ноль той же кривой и за то же время, что и сама панель
  useLayoutEffect(() => {
    if (show || !releaseRef.current) return
    const h = releaseRef.current
    releaseRef.current = 0
    const spacer = document.querySelector('.chooseWordSpacer')
    const drop = Math.max(0, h - (spacer ? spacer.getBoundingClientRect().height : 0))
    if (drop < 1) return
    const inner = document.querySelector('.playerFeedInner')
    if (inner) inner.style.transform = `scaleY(-1) translateY(${-drop}px)`
    requestAnimationFrame(() => {
      playFeedRelease(drop, { duration: 280, easing: 'cubic-bezier(0.4, 0, 1, 1)' })
    })
  }, [show])

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
        fireBurst({ count: 30, size: 4, zIndex: 60, portalTo: '.lessonPlayer' })
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
      {/* Спейсер: вход — spring вместе с панелью; уход — БЕЗ анимации высоты
          (это layout, пересчёт каждый кадр), сдвиг истории играет трансформ */}
      <div
        className="chooseWordSpacer"
        style={{
          height: show ? panelHeight : 0,
          transition: show ? 'height 0.38s cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
        }}
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
