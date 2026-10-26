import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { buildMascot } from '../../../scene/v2/sprites/mascot/mascotSprite.js'
import { renderTree } from '../../../scene/v2/renderTree.js'
import { setMouth } from '../../../scene/v2/mouthDriver.js'
import '../../../scene/v2/scene-v2.css'
import '../../../scene/v2/scene-v2-cat.css'
import { mouthShape } from './wordLaneMouth.js'

// Пит (фиолетовый кот-маскот из конструктора сцен: buildMascot('kit')) в углу игры. Тот же спрайт и те же идл-анимации (дыхание, покачивание головы, моргание, хвост —
// scene-v2-cat.css), что у кружка Пита в уроках. Управляется ИЗВНЕ через apiRef, минуя React на каждом кадре:
//  • apiRef.current.mouth(level) — громкость 0…1 → форма рта closed / half / open (раскрывается, пока говорит диктор или ученик; setMouth пишет data-mouth прямо в DOM);
//  • apiRef.current.react(face, ms) — реакция лицом на время: 'love' (сердечки — пилюля принята), 'shy' (отвёл взгляд, румянец — слово не то); потом снова обычное лицо.
// Вне игры (нет apiRef) — просто стоит и дышит.
export default function WordLaneCat({ apiRef, skin = 'kit' }) {
  const [face, setFace] = useState('base')
  const hostRef = useRef(null)
  const shapeRef = useRef('closed')
  const timerRef = useRef(0)
  const tree = useMemo(() => buildMascot(skin, { face, flip: false }), [skin, face])

  const catEl = () => hostRef.current?.querySelector('[data-part="cat"]') ?? null
  // Лицо пересобрало дерево — форму рта, которую держим сейчас, ставим заново (иначе рот «закрылся» бы на полуслове)
  useLayoutEffect(() => { const el = catEl(); if (el) { el.removeAttribute('data-mouth'); setMouth(el, shapeRef.current) } }, [tree])

  useEffect(() => {
    if (!apiRef) return undefined
    apiRef.current = {
      mouth(level) {
        const shape = mouthShape(level)
        if (shape === shapeRef.current) return
        shapeRef.current = shape
        setMouth(catEl(), shape)
      },
      react(next, ms = 1500) {
        setFace(next)
        clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setFace('base'), ms)
      },
    }
    return () => { apiRef.current = null; clearTimeout(timerRef.current) }
  }, [apiRef])

  return (
    <div ref={hostRef} className="scn scn--live wlCat" aria-hidden="true" data-testid="wl-cat">
      <svg viewBox="0 0 200 240" className="wlCatSvg">
        <g className="scn-cat">{renderTree(tree)}</g>
      </svg>
    </div>
  )
}
