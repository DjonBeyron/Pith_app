import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { buildMascot } from '../../../scene/v2/sprites/mascot/mascotSprite.js'
import { renderTree } from '../../../scene/v2/renderTree.js'
import { setMouth } from '../../../scene/v2/mouthDriver.js'
import '../../../scene/v2/scene-v2.css'
import '../../../scene/v2/scene-v2-cat.css'
import { mouthShape } from './wordLaneMouth.js'
import { CAT_SPOTS, catPeek } from './wordLaneCatPeek.js'

// Пит (фиолетовый кот-маскот из конструктора сцен: buildMascot('kit')) — из нижнего края экрана выскакивает ТОЛЬКО ГОЛОВА (тело не рисуется: viewBox обрезан по голове) и торчит
// в разных местах (CAT_SPOTS), вдвое крупнее прежнего кота. Те же идл-анимации (покачивание головы, моргание — scene-v2-cat.css), что у кружка Пита в уроках.
// Управляется ИЗВНЕ через apiRef, минуя React на кадрах:
//  • apiRef.current.mouth(level) — громкость 0…1 → форма рта (closed / half / open). Голос есть — голова выскакивает (в новом месте), голоса нет HIDE_AFTER_MS — прячется (wordLaneCatPeek.js);
//  • apiRef.current.react(face, ms) — реакция лицом на время ('love' — сердечки, пилюля принята; 'shy' — отвёл взгляд, слово не то) — голова торчит всё это время;
//  • apiRef.current.peek(ms) — просто выскочить на время.
export const CAT_VIEWBOX = '10 16 166 112'

export default function WordLaneCat({ apiRef, skin = 'kit' }) {
  const [face, setFace] = useState('base')
  const hostRef = useRef(null)
  const shapeRef = useRef('closed')
  const timerRef = useRef(0)
  const peekRef = useRef(null)
  const tree = useMemo(() => buildMascot(skin, { face, flip: false }), [skin, face])

  const catEl = () => hostRef.current?.querySelector('[data-part="cat"]') ?? null
  // Лицо пересобрало дерево — форму рта, которую держим сейчас, ставим заново (иначе рот «закрылся» бы на полуслове)
  useLayoutEffect(() => { const el = catEl(); if (el) { el.removeAttribute('data-mouth'); setMouth(el, shapeRef.current) } }, [tree])

  useEffect(() => {
    if (!apiRef) return undefined
    const peek = catPeek({
      spots: CAT_SPOTS, now: () => performance.now(),
      show: x => { const h = hostRef.current; if (h) { h.style.setProperty('--cat-x', String(x)); h.classList.add('wlCat--up') } },
      hide: () => hostRef.current?.classList.remove('wlCat--up'),
    })
    peekRef.current = peek
    apiRef.current = {
      mouth(level) {
        const shape = mouthShape(level)
        if (shape !== shapeRef.current) { shapeRef.current = shape; setMouth(catEl(), shape) }
        peek.voice(level)
      },
      react(next, ms = 1500) {
        setFace(next)
        peek.hold(ms)
        clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setFace('base'), ms)
      },
      peek(ms = 1400) { peek.hold(ms) },
    }
    return () => { apiRef.current = null; clearTimeout(timerRef.current) }
  }, [apiRef])

  return (
    <div ref={hostRef} className="scn scn--live wlCat" aria-hidden="true" data-testid="wl-cat">
      <svg viewBox={CAT_VIEWBOX} className="wlCatSvg">
        <g className="scn-cat">{renderTree(tree)}</g>
      </svg>
    </div>
  )
}
