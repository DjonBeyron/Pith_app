import { useRef, useState, useLayoutEffect, useEffect } from 'react'
import { pLog } from '../../shared/lib/debug.js'
import { playSound } from '../../shared/lib/sounds.js'
import { wheelScrollShift } from './feedWheel.js'
import { traceFeedClose } from './panels/tracePanelSync.js'
import { traceSlideIn, watchLastTop } from './traceSlideIn.js'
import { useFeedRowFreeze } from './useFeedRowFreeze.js'
import { FeedRefsContext } from './feedRefs.js'

// Double scaleY(-1) trick: outer container flipped → scrollTop=0 = visual bottom.
// Inner content flipped back → messages appear normal.
// No JS scroll management needed — new messages always at bottom automatically.
// Works on iOS Safari (unlike flex column-reverse negative scrollTop).
// panelOpen — снизу открыта панель ответа (выбор слова, сборка фразы и
// т.п.): край ленты в этот момент касается верха панели, а не физического
// низа экрана, и панель уже сама учитывает safe-area у своего низа (см.
// choose-word.css) — лишний отступ тут был бы просто съеденным местом.
// Прилёт сообщения снизу — две фазы, а не одна.
//
// Раньше новая строка ехала translateY(200 → 0), а история в тот же миг
// translateY(shiftPx → 0): переписка трогалась, когда новый пузырь был ещё в
// 200px под своим местом. Толчок начинался до касания — на двух голосовых
// подряд это особенно заметно, верхнее уезжало само по себе.
//
// Теперь считаем точку касания. Новый пузырь стартует на TRAVEL ниже своего
// места, история — на shiftPx ниже своего (её туда отбрасывает FLIP). Значит
// коснутся они, когда пузырю останется пройти ровно shiftPx: до этого он идёт
// один, после — оба едут как одно целое, сохраняя между собой те самые 4px
// зазора ленты.
//
// Общий путь всегда TRAVEL, поэтому длительность постоянна, а деление на фазы
// само подстраивается под высоту пришедшего пузыря.
export const MSG_TRAVEL = 200
const TRAVEL     = MSG_TRAVEL
// Наружу — чтобы всё, что должно звучать и появляться «вместе с сообщением»,
// брало тайминг отсюда, а не заводило свои числа (см. PinMessageModule)
export const MSG_SLIDE_MS = 240
const SLIDE_MS   = MSG_SLIDE_MS
// Разгон: пузырь набирает скорость, пока летит один
const EASE_FLY   = 'cubic-bezier(0.4, 0, 1, 1)'
// Торможение: после касания связка гасит скорость и мягко встаёт на место
const EASE_PUSH  = 'cubic-bezier(0, 0, 0.2, 1)'
// Звук сообщения — за 60мс до конца, как и было
export const MSG_SOUND_AT = SLIDE_MS - 60
const SOUND_AT   = MSG_SOUND_AT

// Кадры новой строки ОТНОСИТЕЛЬНО обёртки ленты, которая сама едет кадрами
// slideFrames(push, true): до касания строка летит одна (TRAVEL−push → 0 поверх
// стоящей обёртки), после — стоит на месте и едет вместе с обёрткой.
// Абсолютно это те же TRAVEL → push → 0, что и раньше
function newRowFrames(push) {
  const contact = Math.max(0, TRAVEL - push) / TRAVEL
  if (contact <= 0) {
    return [
      { transform: `translateY(${TRAVEL - push}px)`, easing: EASE_PUSH },
      { transform: 'translateY(0)' },
    ]
  }
  return [
    { transform: `translateY(${TRAVEL - push}px)`, easing: EASE_FLY },
    { transform: 'translateY(0)', offset: contact, easing: EASE_PUSH },
    { transform: 'translateY(0)' },
  ]
}

// Кадры для прилетающего пузыря и для истории. Оба используют ОДНИ И ТЕ ЖЕ
// значения и кривую на второй фазе — иначе после касания они бы разъезжались
function slideFrames(push, forHistory) {
  const contact = Math.max(0, TRAVEL - push) / TRAVEL
  if (contact <= 0) {
    // Пузырь выше самого пролёта: касание уже произошло, фаза одна
    return [
      { transform: `translateY(${forHistory ? push : TRAVEL}px)`, easing: EASE_PUSH },
      { transform: 'translateY(0)' },
    ]
  }
  return [
    { transform: `translateY(${forHistory ? push : TRAVEL}px)`, easing: forHistory ? 'linear' : EASE_FLY },
    { transform: `translateY(${push}px)`, offset: contact, easing: EASE_PUSH },
    { transform: 'translateY(0)' },
  ]
}

// Ученик прокрутил переписку вверх дальше этого — новое сообщение не должно
// двигать то, что он читает
const READING_PX = 80
export default function PlayerFeed({ children, panelOpen = false }) {
  const outerRef     = useRef(null)
  const innerRef     = useRef(null)
  const prevElsRef   = useRef(new Set())
  const prevRowCount = useRef(0)
  // Положение опоры (последнего сообщения) в последнем кадре ДО вставки —
  // «старое место» для трассы прилёта; пишет watchLastTop (только в трейсе)
  const lastTopRef   = useRef(null)
  // Элементы ленты для хуков-потомков (feedRefs.js) — в state, чтобы их
  // можно было читать в рендере (ref в рендере читать нельзя)
  const [feedEls, setFeedEls] = useState(null)
  useLayoutEffect(() => {
    // Один раз после монтирования — осознанный setState в layout-эффекте
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFeedEls({ outer: outerRef.current, inner: innerRef.current })
  }, [])

  // Колесо мыши в перевёрнутом контейнере крутило ленту в обратную сторону:
  // браузер прибавляет deltaY к scrollTop, не зная про scaleY(-1), и «вниз»
  // уезжало вверх. Пальцем этого не видно (жест переворачивается вместе с
  // картинкой), поэтому баг жил только на десктопе. Скроллим сами, вычитая
  // дельту. passive:false — иначе preventDefault игнорируется.
  useEffect(() => {
    const el = outerRef.current
    if (!el) return
    const onWheel = e => {
      if (!e.deltaY) return
      e.preventDefault()
      el.scrollTop += wheelScrollShift(e.deltaY, e.deltaMode, el.clientHeight)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Режим трейса: положение опоры каждый кадр — для traceSlideIn.js
  useEffect(() => watchLastTop(innerRef.current, lastTopRef), [])
  // Строки дальше полутора экранов — заморожены (useFeedRowFreeze.js)
  useFeedRowFreeze(outerRef, innerRef)

  // Третий участник подъёма истории: сама лента меняет нижний запас, когда
  // снизу открывается панель ответа. Момент важен для разбора рассинхрона
  useEffect(() => {
    pLog(`[feed] panelOpen=${panelOpen}`)
    // Закрытие смотрим покадрово: там история сперва опускается вместе с
    // распоркой, а потом дёргается вверх — трасса говорит, кто из двоих
    // (запас ленты или распорка) меняется не в такт
    if (!panelOpen) traceFeedClose('панель закрылась')
  }, [panelOpen])

  useLayoutEffect(() => {
    const inner = innerRef.current
    if (!inner) return

    // Exclude rows inside [data-pending] wrappers — they are pre-rendered off-screen.
    // When a pending node becomes active its wrapper loses data-pending, and the same
    // DOM element enters the active count for the first time → animation fires.
    const rows = [...inner.querySelectorAll('.playerMsgRow')]
      .filter(el => !el.closest('[data-pending]'))
    const rowCount = rows.length
    const prevEls = prevElsRef.current
    // Новизну строк считаем по НАБОРУ элементов, а не по их числу: окно ленты
    // (useFeedWindow.js) вытесняет самую старую строку на каждую новую, и число
    // строк не меняется. Раньше эффект здесь выходил по «число то же» — без
    // въезда, звука, толчка истории и удержания прокрутки, а на следующем шаге
    // та же строка считалась новой повторно (толчок вдвое больше, лишние звуки)
    // Таблица, которая превращается из панели, отмечена data-no-slide: она
    // встаёт сразу на своё место, без въезда снизу. Иначе превращение целится
    // в едущий пузырь и приходится ждать конца его анимации
    const newRows      = rows.filter(el => !prevEls.has(el) && !el.closest('[data-no-slide]'))
    const existingRows = rows.filter(el =>  prevEls.has(el))

    if (newRows.length) {

      // Measure how far existing rows already jumped (layout reflow before this effect).
      // Место, занятое новой строкой, меряем по факту: от нижнего края
      // предыдущего соседа в потоке до её нижнего края (высота + зазор ленты,
      // если браузер его добавил). Формула «offsetHeight + 4» ошибалась на
      // зазор, когда его не было, — и компенсация прокрутки ниже сдвигала
      // читаемые строки на 4 px
      let shiftPx = 0
      newRows.forEach(el => {
        const wrap = el.parentElement ?? el
        let prev = wrap.previousElementSibling
        while (prev && (prev.hasAttribute('data-pending') || prev.tagName === 'BUTTON')) prev = prev.previousElementSibling
        const r = wrap.getBoundingClientRect()
        shiftPx += prev ? Math.max(0, r.bottom - prev.getBoundingClientRect().bottom) : r.height
      })

      // Ученик читает историю выше: сообщение встаёт внизу молча — без
      // въезда и толчка переписки, а прокрутка остаётся на том же месте
      // (якорение браузера у ленты выключено, см. feed.css — держим сами)
      const outer = outerRef.current
      if (outer && outer.scrollTop > READING_PX && shiftPx > 0) {
        outer.scrollTop += shiftPx
        pLog(`[feed] сообщение ниже читаемого места: без въезда, scrollTop ${Math.round(outer.scrollTop)}`)
        prevElsRef.current   = new Set(rows)
        prevRowCount.current = rowCount
        return
      }

      // New rows: slide in from below. Их кадры — ОТНОСИТЕЛЬНО обёртки ленты:
      // толчок истории теперь едет на самой .playerFeedInner (один слой вместо
      // анимации на каждой видимой строке — профиль: ~9 слоёв на въезд, в 2,5
      // раза больше работы композитора на кадр), и новая строка до касания
      // идёт одна (TRAVEL−shift → 0), а после — вместе с обёрткой
      newRows.forEach((el, i) => {
        pLog(`[feed] slide-in START row+${i} (rowCount=${rowCount})`)
        // .stickerWrap — sticker module has no playerMsgBubble, uses its own container
        const hasBubble   = !!(el.querySelector('.playerMsgBubble, .stickerWrap'))
        // .pcAnswerPhoto — photo-choice response: correct/wrong sound instead of message-in
        const photoAnswer = el.querySelector('.pcAnswerPhoto')
        // .playerMsgBubble--pick — выбранное слово, улетевшее в чат: звук уже
        // сыграл тап по варианту, message-in поверх него звучит грязно
        const pickBubble  = el.querySelector('.playerMsgBubble--pick')
        // Ответ ученика (строка справа): у него свой звук «верно/неверно»,
        // «новое сообщение» — только у реплик учителя слева
        const studentRow  = el.classList.contains('playerMsgRowRight')

        // Bubble sound fires 60ms before animation end (at 130ms of 190ms duration).
        // Photo-choice answer sound fires at END — needs to wait for the photo to be visible.
        if (hasBubble && !photoAnswer && !pickBubble && !studentRow) {
          setTimeout(() => {
            pLog('[feed] sound message-in fired (-60ms)')
            playSound('message-in', 'лента: новое сообщение')
          }, SOUND_AT)
        }

        const anim = el.animate(
          newRowFrames(shiftPx),
          { duration: SLIDE_MS, fill: 'backwards' },
        )
        if (photoAnswer) {
          anim.finished.then(() => {
            pLog(`[feed] slide-in END row+${i} — photoAnswer=true`)
            const snd = photoAnswer.classList.contains('pcAnswerPhotoOk') ? 'answer-correct' : 'answer-wrong'
            pLog(`[feed] sound ${snd} fired (photo answer)`)
            playSound(snd, 'лента: ответ фото')
          }).catch(() => {})
        }
      })

      // Existing rows: FLIP — отбрасываем их назад, туда где они стояли, и
      // ведём вверх, но НЕ сразу: до точки касания они стоят (см. slideFrames).
      // fill:'backwards' держит стартовый кадр с первой отрисовки, без прыжка.
      if (existingRows.length && shiftPx > 0) {
        pLog(`[feed] толчок ${shiftPx}px, касание на ${Math.round(Math.max(0, TRAVEL - shiftPx) / TRAVEL * SLIDE_MS)}мс`)
        // Вся история — одной анимацией обёртки. scaleY(-1) обёртки входит в
        // кадры: иначе WAAPI перекрыл бы переворот на время анимации
        inner.animate(
          slideFrames(shiftPx, true).map(f => ({ ...f, transform: `scaleY(-1) ${f.transform}` })),
          { duration: SLIDE_MS, fill: 'backwards' },
        )
        // Прилёт в открытую панель (подсказка/сигнал над таблицей) — покадрово:
        // глазом видно микро-опускание истории в первые кадры (traceSlideIn.js)
        if (panelOpen) {
          const old = lastTopRef.current   // последний кадр ДО вставки (watchLastTop)
          traceSlideIn({
            anchor: existingRows[existingRows.length - 1], fresh: newRows[0],
            old,
            shiftPx,
          })
        }
      }
    }

    const next = new Set(rows)
    prevElsRef.current   = next
    prevRowCount.current = rowCount
  })

  return (
    <div className="playerFeed" ref={outerRef}>
      <div className="playerFeedInner" ref={innerRef}>
        <FeedRefsContext.Provider value={feedEls}>
          {children}
        </FeedRefsContext.Provider>
      </div>
    </div>
  )
}
