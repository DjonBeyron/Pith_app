import { useRef, useLayoutEffect, useEffect } from 'react'
import { pLog } from '../../shared/lib/debug.js'
import { playSound } from '../../shared/lib/sounds.js'
import { wheelScrollShift } from './feedWheel.js'
import { traceFeedClose } from './panels/tracePanelSync.js'

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
const TRAVEL     = 200
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

export default function PlayerFeed({ children, panelOpen = false }) {
  const outerRef     = useRef(null)
  const innerRef     = useRef(null)
  const prevElsRef   = useRef(new Set())
  const prevRowCount = useRef(0)

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
    if (rowCount === prevRowCount.current) return

    const prevEls = prevElsRef.current

    if (rowCount > prevRowCount.current) {
      // Таблица, которая превращается из панели, отмечена data-no-slide: она
      // встаёт сразу на своё место, без въезда снизу. Иначе превращение целится
      // в едущий пузырь и приходится ждать конца его анимации
      const newRows      = rows.filter(el => !prevEls.has(el) && !el.closest('[data-no-slide]'))
      const existingRows = rows.filter(el =>  prevEls.has(el))

      // Measure how far existing rows already jumped (layout reflow before this effect).
      // wrapper div height + CSS gap (4px) = exact shift amount.
      let shiftPx = 0
      newRows.forEach(el => {
        shiftPx += (el.parentElement?.offsetHeight ?? el.offsetHeight) + 4
      })

      // New rows: slide in from below.
      newRows.forEach((el, i) => {
        pLog(`[feed] slide-in START row+${i} (rowCount=${rowCount})`)
        // .stickerWrap — sticker module has no playerMsgBubble, uses its own container
        const hasBubble   = !!(el.querySelector('.playerMsgBubble, .stickerWrap'))
        // .pcAnswerPhoto — photo-choice response: correct/wrong sound instead of message-in
        const photoAnswer = el.querySelector('.pcAnswerPhoto')
        // .playerMsgBubble--pick — выбранное слово, улетевшее в чат: звук уже
        // сыграл тап по варианту, message-in поверх него звучит грязно
        const pickBubble  = el.querySelector('.playerMsgBubble--pick')

        // Bubble sound fires 60ms before animation end (at 130ms of 190ms duration).
        // Photo-choice answer sound fires at END — needs to wait for the photo to be visible.
        if (hasBubble && !photoAnswer && !pickBubble) {
          setTimeout(() => {
            pLog('[feed] sound message-in fired (-60ms)')
            playSound('message-in')
          }, SOUND_AT)
        }

        const anim = el.animate(
          slideFrames(shiftPx, false),
          { duration: SLIDE_MS, fill: 'backwards' },
        )
        if (photoAnswer) {
          anim.finished.then(() => {
            pLog(`[feed] slide-in END row+${i} — photoAnswer=true`)
            const snd = photoAnswer.classList.contains('pcAnswerPhotoOk') ? 'answer-correct' : 'answer-wrong'
            pLog(`[feed] sound ${snd} fired (photo answer)`)
            playSound(snd)
          }).catch(() => {})
        }
      })

      // Existing rows: FLIP — отбрасываем их назад, туда где они стояли, и
      // ведём вверх, но НЕ сразу: до точки касания они стоят (см. slideFrames).
      // fill:'backwards' держит стартовый кадр с первой отрисовки, без прыжка.
      if (existingRows.length && shiftPx > 0) {
        pLog(`[feed] толчок ${shiftPx}px, касание на ${Math.round(Math.max(0, TRAVEL - shiftPx) / TRAVEL * SLIDE_MS)}мс`)
        existingRows.forEach(el => {
          el.animate(slideFrames(shiftPx, true), { duration: SLIDE_MS, fill: 'backwards' })
        })
      }
    }

    const next = new Set(rows)
    prevElsRef.current   = next
    prevRowCount.current = rowCount
  })

  return (
    <div className={`playerFeed${panelOpen ? ' playerFeed--panelOpen' : ''}`} ref={outerRef}>
      <div className="playerFeedInner" ref={innerRef}>
        {children}
      </div>
    </div>
  )
}
