import { useRef, useLayoutEffect } from 'react'
import { pLog } from '../../shared/lib/debug.js'
import { playSound } from '../../shared/lib/sounds.js'

// Double scaleY(-1) trick: outer container flipped → scrollTop=0 = visual bottom.
// Inner content flipped back → messages appear normal.
// No JS scroll management needed — new messages always at bottom automatically.
// Works on iOS Safari (unlike flex column-reverse negative scrollTop).
export default function PlayerFeed({ children }) {
  const innerRef     = useRef(null)
  const prevElsRef   = useRef(new Set())
  const prevRowCount = useRef(0)

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
      const newRows      = rows.filter(el => !prevEls.has(el))
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

        // Bubble sound fires 60ms before animation end (at 130ms of 190ms duration).
        // Photo-choice answer sound fires at END — needs to wait for the photo to be visible.
        if (hasBubble && !photoAnswer) {
          setTimeout(() => {
            pLog('[feed] sound message-in fired (-60ms)')
            playSound('message-in')
          }, 130)
        }

        const anim = el.animate(
          [{ transform: 'translateY(200px)' }, { transform: 'translateY(0)' }],
          { duration: 190, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'backwards' },
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

      // Existing rows: FLIP — instantly push back to where they were, animate up in sync.
      // fill:'backwards' holds the start frame from first paint so there's no visible jump.
      if (existingRows.length && shiftPx > 0) {
        existingRows.forEach(el => {
          el.animate(
            [{ transform: `translateY(${shiftPx}px)` }, { transform: 'translateY(0)' }],
            { duration: 190, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'backwards' },
          )
        })
      }
    }

    const next = new Set(rows)
    prevElsRef.current   = next
    prevRowCount.current = rowCount
  })

  return (
    <div className="playerFeed">
      <div className="playerFeedInner" ref={innerRef}>
        {children}
      </div>
    </div>
  )
}
