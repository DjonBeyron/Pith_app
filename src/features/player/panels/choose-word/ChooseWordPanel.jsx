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
  // Высота, на которую надо сдвинуть историю при закрытии (см. useLayoutEffect)
  const releaseRef = useRef(0)
  const spacerBeforeRef = useRef(0)
  // Опора для спуска: последнее сообщение и его top до закрытия (см. ниже)
  const anchorRef = useRef(null)
  // Что проявить после остановки истории (ставит таймер закрытия, читает
  // layout-эффект спуска) и все таймеры панели
  const revealRef = useRef(null)
  const timersRef = useRef([])

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
    // На сколько история РЕАЛЬНО опустилась в раскладке: распорка отдала h,
    // но тем же тиком в ленту встали (невидимые) пузыри ответа и забрали своё.
    // Меряем по опоре — последнему сообщению, запомненному до закрытия, —
    // а не считаем из высот: так учитывается всё, что изменилось в этот тик
    const a = anchorRef.current
    anchorRef.current = null
    const measured = a?.el?.isConnected ? a.el.getBoundingClientRect().top - a.top : null
    const drop = Math.max(0, measured ?? (h - spacerH))
    pLog(`[word-choice] спуск: распорка отдала ${h}px, история опустится на ${drop.toFixed(1)}px`
      + `${measured != null ? ` (по опоре; ${(h - spacerH - drop).toFixed(1)}px заняли пузыри)` : ' (по распорке)'}`)
    const { historyStopMs } = playPanelDrop(panel, { drop, panelH: h, label: 'wc' })
    tracePanelRise('wc-спуск', panel, '.chooseWordSpacer', 22)
    // Ответ летит вверх РОВНО с остановки истории (не после ухода панели):
    // момент считается из той же кривой спуска (panelRise.js). Панель в это
    // время ещё едет вниз одна — пузырь въезжает ей навстречу на уже
    // освободившееся место
    const pending = revealRef.current
    revealRef.current = null
    if (!pending) return
    timersRef.current.push(setTimeout(() => {
      pLog(`[word-choice] история встала (+${historyStopMs}мс) → проявляем пузыри`)
      // flushSync: въезд должен стартовать до того, как whenBubbleLanded
      // спросит у строк их анимацию
      flushSync(() => onRevealAnswer?.())
      whenBubbleLanded(() => {
        pLog(`[word-choice] пузырь въехал → onDone(${pending.triggerResult})`)
        onDone?.(pending.triggerResult, pending.selectedId)
      })
    }, historyStopMs))
  }, [show]) // eslint-disable-line react-hooks/exhaustive-deps

  // Все таймеры панели гасятся при размонтировании
  useEffect(() => () => timersRef.current.forEach(clearTimeout), [])

  useEffect(() => {
    if (!isAnswered) return
    const triggerResult = result === 'correct' ? 'word_correct' : 'word_wrong'
    const picked = options.find(o => o.id === selectedId)
    timersRef.current.push(setTimeout(() => {
      // Салют — праздник НАГРАДЫ: снята галочка «Получить награду» — XP не
      // начисляется, и салютовать нечему (правило общее, nodeReward.js).
      // Стартует в тот же тик, что и уход панели
      if (result === 'correct' && isRewardOn('word_choice', wcData)) {
        fireBurst({ count: 30, size: 4, zIndex: 85, portalTo: '.lessonPlayer' })
      }
      // Опора для замера спуска — последнее сообщение ДО закрытия
      const rows = [...document.querySelectorAll('.playerFeedInner .playerMsgRow')]
        .filter(el => !el.closest('[data-pending]'))
      const last = rows[rows.length - 1]
      anchorRef.current = last ? { el: last, top: last.getBoundingClientRect().top } : null
      releaseRef.current = panelHeight
      // Что проявить и чем закрыть ноду — заберёт layout-эффект спуска
      revealRef.current = { triggerResult, selectedId }
      // Пузыри и закрытие — ОДНИМ тиком (React батчит): строки встают в ленту
      // невидимыми (arriving, см. WordChoiceModule), раскладка сразу конечная,
      // и история опускается ровно до места, где останется после их прихода
      if (picked) onPickToChat?.(picked.text)
      onAnswered?.(responseText, result)
      setShow(false)
      pLog(`[word-choice] панель закрывается (result=${result}), пузыри уже в ленте невидимыми`)
    }, SEE_RESULT_MS))
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
