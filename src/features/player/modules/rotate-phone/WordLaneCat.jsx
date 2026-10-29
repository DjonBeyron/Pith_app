import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { renderTree } from '../../../scene/v2/renderTree.js'
import { setMouth } from '../../../scene/v2/mouthDriver.js'
import { applyMascotMouthCode } from '../../../scene/v2/sprites/mascot/mascotMouth.js'
import '../../../scene/v2/scene-v2.css'
import '../../../scene/v2/scene-v2-cat.css'
import { mouthShape, HALF_AT } from './wordLaneMouth.js'
import { codeAt } from './wordLaneVisemes.js'
import { CAT_SPOTS, catPeek } from './wordLaneCatPeek.js'
import { createMouthHold } from './wordLaneMouthHold.js'
import { CAT_FACES, buildCat } from './wordLaneCatTree.js'

// Пит (фиолетовый кот-маскот из конструктора сцен: buildMascot('kit')) — из нижнего края экрана выскакивает ТОЛЬКО ГОЛОВА (тело не рисуется: viewBox обрезан по голове) и торчит
// в разных местах (CAT_SPOTS), вдвое крупнее прежнего кота. БЕЗ идл-анимаций (покачивание, моргание — scn--live): анимации SVG идут в основном потоке и на смартфонах давали подлагивание в момент, когда кот выскакивает вместе с первым словом диктора; оживляют его только выскакивание (CSS-пружина на композиторе), рот по голосу и лицо-реакция.
// Управляется ИЗВНЕ через apiRef, минуя React на кадрах:
//  • apiRef.current.mouth(level, code?) — громкость 0…1 → форма рта (closed / half / open); есть code (форма по букве, wordLaneVisemes) и звук слышен — рот этой формы (на «о» круглый);
//  • apiRef.current.speak(track, ms) — реплика кота: рот идёт по дорожке track (wordLaneVisemes.mouthTrack) ms миллисекунд, громкость в это время рот не трогает;
//    Голос есть — голова выскакивает (в новом месте), голоса нет HIDE_AFTER_MS — прячется (wordLaneCatPeek.js);
//  • apiRef.current.react(face, ms) — реакция лицом на время ('love' — сердечки, пилюля принята; 'shy' — отвёл взгляд, слово не то) — голова торчит всё это время;
//  • apiRef.current.peek(ms) — просто выскочить на время.
// Компонент мемоизирован (memo) и после монтажа React'ом не перерисовывается: лицо меняется БЕЗ пересборки дерева — головы всех лиц (CAT_FACES) собраны один раз, видна одна (CSS по data-face на корне), смена — атрибут;
// форма рта держится не меньше 70 мс и не пишется в DOM, если не изменилась (wordLaneMouthHold.js). Раньше смена лица пересобирала SVG-дерево кота (≈70 узлов) на каждую принятую пилюлю, а рот переписывал четыре d на каждый переход.
export const CAT_VIEWBOX = '6 14 174 148' // голова целиком — от макушки с ушами (y≈20) до шеи (подбородок y≈142, плечи до 162); тело ниже не попадает в кадр
const isCode = key => /^[A-Z]$/.test(key)

function WordLaneCat({ apiRef, skin = 'kit' }) {
  const hostRef = useRef(null)
  const faceRef = useRef('base')    // какая голова показана
  const headsRef = useRef({})       // лицо → <g data-part="head">
  const holdRef = useRef(null)      // выдержка формы рта
  const lineRef = useRef(false)     // идёт реплика кота: рот ведёт её дорожка
  const lineRafRef = useRef(0)
  const timerRef = useRef(0)
  const peekRef = useRef(null)
  const cat = useMemo(() => renderTree(buildCat(skin)), [skin])

  // Нарисовать форму в показанную голову: key — closed / half / open или код Rhubarb (одна заглавная буква)
  const draw = key => {
    const el = headsRef.current[faceRef.current]
    if (!el) return
    if (isCode(key)) { applyMascotMouthCode(el, key); el.removeAttribute('data-mouth') } else setMouth(el, key)
  }
  const setFace = face => {
    const next = CAT_FACES.includes(face) ? face : 'base'
    if (next === faceRef.current) return
    faceRef.current = next
    hostRef.current?.setAttribute('data-face', next)
    holdRef.current?.redraw() // в новую голову — тот рот, что показан сейчас (иначе «закрылся» бы на полуслове)
  }
  // Дерево собрано (или пересобрано) — находим головы
  useLayoutEffect(() => {
    headsRef.current = Object.fromEntries([...hostRef.current.querySelectorAll('[data-part="head"]')].map(h => [h.getAttribute('data-face'), h]))
    holdRef.current?.redraw()
  }, [cat])

  useEffect(() => {
    if (!apiRef) return undefined
    const hold = createMouthHold({ apply: draw })
    holdRef.current = hold
    const peek = catPeek({
      spots: CAT_SPOTS, now: () => performance.now(),
      show: x => { const h = hostRef.current; if (h) { h.style.setProperty('--cat-x', String(x)); h.classList.add('wlCat--up') } },
      hide: () => hostRef.current?.classList.remove('wlCat--up'),
    })
    peekRef.current = peek
    apiRef.current = {
      mouth(level, code = null) {
        if (lineRef.current) return // реплика кота: рот ведёт её дорожка
        hold.set(code && level >= HALF_AT ? code : mouthShape(level))
        peek.voice(level)
      },
      speak(track, ms) {
        cancelAnimationFrame(lineRafRef.current)
        const t0 = performance.now()
        peek.hold(ms + 400)
        const step = now => {
          if (now - t0 >= ms) { lineRef.current = false; hold.set('closed'); return }
          lineRef.current = true
          hold.set(codeAt(track, now - t0))
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
    return () => { apiRef.current = null; holdRef.current = null; hold.dispose(); clearTimeout(timerRef.current); cancelAnimationFrame(lineRafRef.current) }
  }, [apiRef])

  return (
    <div ref={hostRef} className="scn wlCat" aria-hidden="true" data-testid="wl-cat" data-face="base">
      <svg viewBox={CAT_VIEWBOX} className="wlCatSvg">
        <g className="scn-cat">{cat}</g>
      </svg>
    </div>
  )
}

export default memo(WordLaneCat)
