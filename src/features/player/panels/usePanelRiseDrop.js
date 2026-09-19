import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { pLog } from '../../../shared/lib/debug.js'
import { playPanelRise, playPanelDrop, tracePanelRise } from './panelRise.js'
import { whenBubbleLanded } from './whenBubbleLanded.js'

// Подъём и спуск панели ответа ВМЕСТЕ с историей — общий хук для «выбери
// слово» и обеих таблиц (panelRise.js делает сами анимации, здесь — когда и
// с какими числами их запускать).
//
// Подъём: распорка под лентой меняет высоту РАЗОМ, история стоит, пока верх
// панели не коснётся низа последнего сообщения, дальше едет с панелью 1:1.
// drop = высота распорки после показа − до показа (min-height у неё есть
// всегда: safe-area + слот «печатает»).
//
// Спуск: панель зовёт prepareClose({ reveal }) ДО setShow(false) в том же
// тике, что и вставка пузырей ответа (невидимых, arriving — см.
// useDeferredArrival.js). Хук запоминает опору — последнее сообщение и его
// top — и после коммита меряет, на сколько история РЕАЛЬНО опустилась
// (распорка отдала место, пузыри часть забрали). История едет вниз с
// панелью ровно на эту величину и встаёт; в момент остановки (historyStopMs
// из той же кривой) зовётся reveal.onReveal (проявить пузыри), после их
// въезда — reveal.done (закрыть ноду).
//
// opening — true, пока идёт подъём: распорке таблиц на это время нужен
// transition: none (spacerStyle.js), а дальше она снова плавно следует за
// ростом панели по ходу ответа.
//
// Возвращает { opening, prepareClose }. Панели с уходом «в чат»
// (flyPanelToChat) prepareClose не зовут — там свой путь.
export function usePanelRiseDrop({ show, panelRef, spacerSel, panelH, label }) {
  const [opening, setOpening] = useState(true)
  const ctl = useRef({ spacerBefore: 0, releaseH: 0, anchor: null, reveal: null, timers: [] })

  useEffect(() => {
    const c = ctl.current
    c.spacerBefore = document.querySelector(spacerSel)?.getBoundingClientRect().height ?? 0
    return () => c.timers.forEach(clearTimeout)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const c = ctl.current
    const panel = panelRef.current
    const spacer = document.querySelector(spacerSel)
    if (!panel || !spacer) return
    const spacerH = spacer.getBoundingClientRect().height
    if (show) {
      if (!panelH) return
      const drop = Math.max(0, spacerH - c.spacerBefore)
      const anim = playPanelRise(panel, { drop, panelH, label })
      tracePanelRise(`${label}-подъём`, panel, spacerSel)
      const settle = () => setOpening(false)
      anim.finished.then(settle).catch(settle)
      return
    }
    if (!c.releaseH) return
    const h = c.releaseH
    c.releaseH = 0
    const a = c.anchor
    c.anchor = null
    const measured = a?.el?.isConnected ? a.el.getBoundingClientRect().top - a.top : null
    const drop = Math.max(0, measured ?? (h - spacerH))
    pLog(`[${label}] спуск: распорка отдала ${h}px, история опустится на ${drop.toFixed(1)}px`
      + `${measured != null ? ` (по опоре; ${(h - spacerH - drop).toFixed(1)}px заняли пузыри)` : ' (по распорке)'}`)
    const { historyStopMs } = playPanelDrop(panel, { drop, panelH: h, label })
    tracePanelRise(`${label}-спуск`, panel, spacerSel, 22)
    const reveal = c.reveal
    c.reveal = null
    if (!reveal) return
    c.timers.push(setTimeout(() => {
      pLog(`[${label}] история встала (+${historyStopMs}мс) → проявляем пузыри`)
      // flushSync: въезд должен стартовать до того, как whenBubbleLanded
      // спросит у строк их анимацию
      flushSync(() => reveal.onReveal?.())
      whenBubbleLanded(() => {
        pLog(`[${label}] пузырь въехал → закрываем ноду`)
        reveal.done?.()
      })
    }, historyStopMs))
  }, [show]) // eslint-disable-line react-hooks/exhaustive-deps

  // Звать ДО setShow(false), в том же тике, что и вставка пузырей.
  // reveal: { onReveal, done } — что сделать на остановке истории и после
  // въезда пузырей; без reveal — просто спуск (панель закроет ноду сама)
  function prepareClose({ reveal = null } = {}) {
    const c = ctl.current
    const rows = [...document.querySelectorAll('.playerFeedInner .playerMsgRow')]
      .filter(el => !el.closest('[data-pending]'))
    const last = rows[rows.length - 1]
    c.anchor = last ? { el: last, top: last.getBoundingClientRect().top } : null
    c.releaseH = panelH
    c.reveal = reveal
  }

  return { opening, prepareClose }
}
