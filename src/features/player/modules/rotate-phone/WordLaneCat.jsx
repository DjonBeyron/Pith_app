import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { renderTree } from '../../../scene/v2/renderTree.js'
import '../../../scene/v2/scene-v2.css'
import '../../../scene/v2/scene-v2-cat.css'
import '../../../scene/v2/scene-v2-pit.css'
import { isWeakDevice } from '../../../../shared/lib/deviceTier.js'
import { mouthShape, HALF_AT } from './wordLaneMouth.js'
import { codeAt } from './wordLaneVisemes.js'
import { CAT_SPOTS, VOICE_AT, catPeek } from './wordLaneCatPeek.js'
import { createMouthHold } from './wordLaneMouthHold.js'
import { CAT_FACES, buildCat } from './wordLaneCatTree.js'
import { createCatLook, drawCatMouth, NO_LOOK } from './wordLaneCatLook.js'

// Пит (фиолетовый кот-маскот из конструктора сцен: buildMascot('kit')) — из нижнего края экрана выскакивает ТОЛЬКО ГОЛОВА (тело не рисуется: viewBox обрезан по голове) и торчит
// в разных местах (CAT_SPOTS), вдвое крупнее прежнего кота. БЕЗ идл-анимаций тела (покачивание, дыхание, моргание — scn--live): анимации SVG идут в основном потоке и на смартфонах давали подлагивание в момент, когда кот выскакивает вместе с первым словом диктора; оживляют его только выскакивание (CSS-пружина на композиторе), рот по голосу и лицо-реакция.
// «Живой Пит v2» (scn--v2, wordLaneCatLook.js) включён всегда — это новая игра: зрачки (взгляд, саккады по словам, расширение в начале речи, дрейф, пока кот выглядывает) — CSS-переменные по событиям, без rAF;
// широкие формы рта крупнее (data-vis на голове); усы качаются, пока кот говорит (is-talking, word-lane.css). На слабом устройстве (scn--lite, isWeakDevice) — только рот, как раньше.
// Управляется ИЗВНЕ через apiRef, минуя React на кадрах:
//  • apiRef.current.mouth(level, code?) — громкость 0…1 → форма рта (closed / half / open); есть code (форма по букве, wordLaneVisemes) и звук слышен — рот этой формы (на «о» круглый); звук слышен (≥ VOICE_AT) — кот «говорит» (усы), с выдержкой 300 мс;
//  • apiRef.current.speak(track, ms) — реплика кота: рот идёт по дорожке track (wordLaneVisemes.mouthTrack) ms миллисекунд, громкость в это время рот не трогает; на это время кот «говорит», зрачки расширяются в начале;
//    Голос есть — голова выскакивает (в новом месте), голоса нет HIDE_AFTER_MS — прячется (wordLaneCatPeek.js);
//  • apiRef.current.react(face, ms) — реакция лицом на время ('love' — сердечки, пилюля принята; 'shy' — отвёл взгляд, слово не то) — голова торчит всё это время;
//  • apiRef.current.peek(ms) — просто выскочить на время;
//  • apiRef.current.look.lineStart() / word() / lineEnd() — взгляд: речь началась (зрачки расширяются) / граница слова (саккада) / речь кончилась; apiRef.current.talking(on) — усы вручную.
// Компонент мемоизирован (memo) и после монтажа React'ом не перерисовывается: лицо меняется БЕЗ пересборки дерева — головы всех лиц (CAT_FACES) собраны один раз, видна одна (CSS по data-face на корне), смена — атрибут;
// форма рта держится не меньше 70 мс и не пишется в DOM, если не изменилась (wordLaneMouthHold.js). Раньше смена лица пересобирала SVG-дерево кота (≈70 узлов) на каждую принятую пилюлю, а рот переписывал четыре d на каждый переход.
export const CAT_VIEWBOX = '6 14 174 148' // голова целиком — от макушки с ушами (y≈20) до шеи (подбородок y≈142, плечи до 162); тело ниже не попадает в кадр
function WordLaneCat({ apiRef, skin = 'kit' }) {
  const hostRef = useRef(null)
  const groRef = useRef(null)       // <g class="scn-cat">: общий родитель голов — на нём переменные взгляда и класс is-talking
  const faceRef = useRef('base')    // какая голова показана
  const headsRef = useRef({})       // лицо → <g data-part="head">
  const holdRef = useRef(null)      // выдержка формы рта
  const lineRef = useRef(false)     // идёт реплика кота: рот ведёт её дорожка
  const lineRafRef = useRef(0)
  const timerRef = useRef(0)
  const peekRef = useRef(null)
  const cat = useMemo(() => renderTree(buildCat(skin)), [skin])
  const lite = useMemo(() => isWeakDevice(), []) // слабое устройство: только рот (scn--lite), зрачки и усы не трогаем

  // Нарисовать форму в показанную голову: key — closed / half / open или код Rhubarb (одна заглавная буква)
  const draw = key => drawCatMouth(headsRef.current[faceRef.current], key)
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
    const look = lite ? NO_LOOK : createCatLook({ getRoot: () => groRef.current, skin })
    const peek = catPeek({
      spots: CAT_SPOTS, now: () => performance.now(),
      show: x => { const h = hostRef.current; if (h) { h.style.setProperty('--cat-x', String(x)); h.classList.add('wlCat--up') }; look.idle(true) }, // выглядывает — взгляд изредка уходит в сторону
      hide: () => { hostRef.current?.classList.remove('wlCat--up'); look.idle(false) },
    })
    peekRef.current = peek
    apiRef.current = {
      mouth(level, code = null) {
        if (lineRef.current) return // реплика кота: рот ведёт её дорожка
        hold.set(code && level >= HALF_AT ? code : mouthShape(level))
        peek.voice(level)
        look.talking(level >= VOICE_AT)
      },
      speak(track, ms) {
        cancelAnimationFrame(lineRafRef.current)
        const t0 = performance.now()
        peek.hold(ms + 400)
        look.lineStart(); look.talking(true)
        const step = now => {
          if (now - t0 >= ms) { lineRef.current = false; hold.set('closed'); look.lineEnd(); look.talking(false); return }
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
      look: { lineStart: look.lineStart, word: look.word, lineEnd: look.lineEnd },
      talking: look.talking,
    }
    return () => { apiRef.current = null; holdRef.current = null; hold.dispose(); look.stop(); clearTimeout(timerRef.current); cancelAnimationFrame(lineRafRef.current) }
  }, [apiRef, lite, skin])

  return (
    <div ref={hostRef} className={`scn scn--v2 wlCat${lite ? ' scn--lite' : ''}`} aria-hidden="true" data-testid="wl-cat" data-face="base">
      <svg viewBox={CAT_VIEWBOX} className="wlCatSvg">
        <g ref={groRef} className="scn-cat">{cat}</g>
      </svg>
    </div>
  )
}

export default memo(WordLaneCat)
