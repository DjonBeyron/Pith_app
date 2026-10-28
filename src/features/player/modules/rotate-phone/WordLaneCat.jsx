import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { buildMascot } from '../../../scene/v2/sprites/mascot/mascotSprite.js'
import { renderTree } from '../../../scene/v2/renderTree.js'
import { setMouth } from '../../../scene/v2/mouthDriver.js'
import { applyMascotMouthCode } from '../../../scene/v2/sprites/mascot/mascotMouth.js'
import '../../../scene/v2/scene-v2.css'
import '../../../scene/v2/scene-v2-cat.css'
import { mouthShape, HALF_AT } from './wordLaneMouth.js'
import { codeAt } from './wordLaneVisemes.js'
import { CAT_SPOTS, catPeek } from './wordLaneCatPeek.js'

// Пит (фиолетовый кот-маскот из конструктора сцен: buildMascot('kit')) — из нижнего края экрана выскакивает ТОЛЬКО ГОЛОВА (тело не рисуется: viewBox обрезан по голове) и торчит
// в разных местах (CAT_SPOTS), вдвое крупнее прежнего кота. БЕЗ идл-анимаций (покачивание, моргание — scn--live): анимации SVG идут в основном потоке и на смартфонах давали подлагивание в момент, когда кот выскакивает вместе с первым словом диктора; оживляют его только выскакивание (CSS-пружина на композиторе), рот по голосу и лицо-реакция.
// Управляется ИЗВНЕ через apiRef, минуя React на кадрах:
//  • apiRef.current.mouth(level, code?) — громкость 0…1 → форма рта (closed / half / open); есть code (форма по букве, wordLaneVisemes) и звук слышен — рот этой формы (на «о» круглый);
//  • apiRef.current.speak(track, ms) — реплика кота: рот идёт по дорожке track (wordLaneVisemes.mouthTrack) ms миллисекунд, громкость в это время рот не трогает;
//    Голос есть — голова выскакивает (в новом месте), голоса нет HIDE_AFTER_MS — прячется (wordLaneCatPeek.js);
//  • apiRef.current.react(face, ms) — реакция лицом на время ('love' — сердечки, пилюля принята; 'shy' — отвёл взгляд, слово не то) — голова торчит всё это время;
//  • apiRef.current.peek(ms) — просто выскочить на время.
export const CAT_VIEWBOX = '6 14 174 148' // голова целиком — от макушки с ушами (y≈20) до шеи (подбородок y≈142, плечи до 162); тело ниже не попадает в кадр

export default function WordLaneCat({ apiRef, skin = 'kit' }) {
  const [face, setFace] = useState('base')
  const hostRef = useRef(null)
  const shownRef = useRef('closed') // что показано сейчас: форма (closed / half / open) или код Rhubarb (одна заглавная буква)
  const lineRef = useRef(false)     // идёт реплика кота: рот ведёт её дорожка
  const lineRafRef = useRef(0)
  const timerRef = useRef(0)
  const peekRef = useRef(null)
  const tree = useMemo(() => buildMascot(skin, { face, flip: false }), [skin, face])

  const catEl = () => hostRef.current?.querySelector('[data-part="cat"]') ?? null
  const show = (shape, code = null) => {
    const el = catEl()
    const key = code ?? shape
    if (!el || key === shownRef.current) return
    shownRef.current = key
    if (code) { applyMascotMouthCode(el, code); el.removeAttribute('data-mouth') } else setMouth(el, shape)
  }
  // Лицо пересобрало дерево — то, что показываем сейчас, ставим заново (иначе рот «закрылся» бы на полуслове)
  useLayoutEffect(() => { const k = shownRef.current; shownRef.current = null; catEl()?.removeAttribute('data-mouth'); if (/^[A-Z]$/.test(k)) show(null, k); else show(k) /* eslint-disable-line react-hooks/exhaustive-deps */ }, [tree])

  useEffect(() => {
    if (!apiRef) return undefined
    const peek = catPeek({
      spots: CAT_SPOTS, now: () => performance.now(),
      show: x => { const h = hostRef.current; if (h) { h.style.setProperty('--cat-x', String(x)); h.classList.add('wlCat--up') } },
      hide: () => hostRef.current?.classList.remove('wlCat--up'),
    })
    peekRef.current = peek
    apiRef.current = {
      mouth(level, code = null) {
        if (lineRef.current) return // реплика кота: рот ведёт её дорожка
        show(mouthShape(level), code && level >= HALF_AT ? code : null)
        peek.voice(level)
      },
      speak(track, ms) {
        cancelAnimationFrame(lineRafRef.current)
        const t0 = performance.now()
        peek.hold(ms + 400)
        const step = now => {
          if (now - t0 >= ms) { lineRef.current = false; show('closed'); return }
          lineRef.current = true
          show(null, codeAt(track, now - t0))
          lineRafRef.current = requestAnimationFrame(step)
        }
        step(t0)
      },
      react(next, ms = 1500) {
        setFace(next)
        peek.hold(ms)
        clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setFace('base'), ms)
      },
      peek(ms = 1400) { peek.hold(ms) },
    }
    return () => { apiRef.current = null; clearTimeout(timerRef.current); cancelAnimationFrame(lineRafRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiRef])

  return (
    <div ref={hostRef} className="scn wlCat" aria-hidden="true" data-testid="wl-cat">
      <svg viewBox={CAT_VIEWBOX} className="wlCatSvg">
        <g className="scn-cat">{renderTree(tree)}</g>
      </svg>
    </div>
  )
}
