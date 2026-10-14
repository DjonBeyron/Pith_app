import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { renderTree } from './renderTree.js'
import SceneBubbleV2 from './SceneBubbleV2.jsx'
import { useSceneDirectorV2 } from './useSceneDirectorV2.js'
import { backgroundSprite, catSprite, getSprite } from './sprites/spriteRegistry.js'
import { slotsInDrawOrder, CAT_PLACEMENT } from './sprites/slots.js'
import { SCENE_VIEWBOX } from './sprites/backgrounds.js'
import { isWeakDevice } from '../../../shared/lib/deviceTier.js'
import './scene-v2.css'
import './scene-v2-cat.css'

// Быстрый рендерер сцены v2 (9:16, адаптивный). Один <svg>: фон → предметы
// по слотам → два кота; облачко — HTML поверх. Режимы:
//   live   — режиссёр играет реплики, рот через data-mouth на DOM (без
//            перерендера), идл-анимации CSS (только transform/opacity);
//   static — статичный кадр (соседний слайд ленты, постер): без режиссёра,
//            без анимационных классов; frameIndex — показать реплику кадром.
// lite (по умолчанию deviceTier.isWeakDevice()) — только рот и облачко.
// Пауза анимаций: !active / paused / вне экрана / document.hidden /
// data-scrolling у родителя (CSS). contain: layout paint на контейнере.
// apiRef — ref, в который кладётся API режиссёра (play/pause/toggle/restart/goTo).

function Cat({ who, character, emotion, talking, onEl }) {
  const sprite = catSprite(character.gender)
  const tree = useMemo(
    () => sprite.build({ palette: character.palette, stripes: character.stripes !== false, emotion, flip: who === 'b' }),
    [sprite, character.palette, character.stripes, emotion, who],
  )
  const p = CAT_PLACEMENT[who]
  return (
    <g
      data-who={who}
      className={`scn-cat${talking ? ' is-talking' : ''}`}
      style={{ '--idle-delay': who === 'a' ? '0s' : '0.9s', '--blink-delay': who === 'a' ? '0s' : '1.7s' }}
      transform={`translate(${p.x} ${p.y}) scale(${CAT_PLACEMENT.scale})`}
      ref={el => onEl(who, el)}
    >
      {renderTree(tree)}
    </g>
  )
}

function Props({ scene }) {
  return slotsInDrawOrder(scene.location).map(slot => {
    const id = scene.slots?.[slot.id]
    const sprite = id ? getSprite(id) : null
    if (!sprite || sprite.kind !== 'prop') return null
    const s = slot.scale ?? 1
    return (
      <g key={slot.id} data-slot={slot.id} transform={`translate(${slot.x} ${slot.y})${s !== 1 ? ` scale(${s})` : ''}`}>
        {renderTree(sprite.build())}
      </g>
    )
  })
}

export default function SceneRenderer({
  scene, mode = 'live', active = true, paused = false, sound = true, lite, frameIndex = null,
  showBubbles, showProgress = true, onTap, apiRef, className = '', children,
}) {
  const live = mode === 'live'
  const mouthEls = useRef({ a: null, b: null })
  const rootRef = useRef(null)
  const [onScreen, setOnScreen] = useState(true)
  const director = useSceneDirectorV2(scene, { enabled: live, sound, active: active && onScreen, paused, mouthEls })

  // Рот переключает mouthDriver прямо на корне кота (data-mouth), минуя React
  const onCatEl = useCallback((who, el) => {
    mouthEls.current[who] = el?.querySelector?.('[data-part="cat"]') ?? null
  }, [])

  useEffect(() => {
    if (!apiRef) return undefined
    apiRef.current = live ? director : null
    return () => { apiRef.current = null }
  }, [apiRef, director, live])

  // Вне экрана — CSS-анимации стоят и режиссёр на авто-паузе
  useEffect(() => {
    const el = rootRef.current
    if (!live || !el || typeof IntersectionObserver === 'undefined') return undefined
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0.05 })
    io.observe(el)
    return () => io.disconnect()
  }, [live])

  const isLite = lite ?? isWeakDevice()
  const bubbles = showBubbles ?? scene.options?.bubbles ?? true
  const line = live ? director.line : (frameIndex !== null ? scene.timeline?.[frameIndex] ?? null : null)
  const speaking = live ? director.speakingWho : null
  const bubbleVisible = !!line && bubbles && (live ? director.status !== 'idle' : true)
  const bg = backgroundSprite(scene.location)
  const bgTree = useMemo(() => bg.build(), [bg])
  // Идл-анимации идут в idle и playing; на паузе/в конце — замирают
  const animPaused = live && (!active || paused || !onScreen || (director.status !== 'playing' && director.status !== 'idle'))

  const cls = [
    'scn', live ? 'scn--live' : 'scn--static', isLite ? 'scn--lite' : '', animPaused ? 'scn--paused' : '', className,
  ].filter(Boolean).join(' ')

  const emotionOf = who => (line && line.who === who ? line.emotion : 'neutral')

  return (
    <div
      ref={rootRef} className={cls} data-speaking={speaking ?? ''} data-status={live ? director.status : 'static'}
      onClick={onTap} role={onTap ? 'button' : undefined} tabIndex={onTap ? 0 : undefined}
      onKeyDown={onTap ? e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onTap(e) } } : undefined}
    >
      <svg className="scn__svg" viewBox={SCENE_VIEWBOX} preserveAspectRatio="xMidYMid slice" aria-label={scene.title || 'Сцена'} role="img">
        {renderTree(bgTree)}
        <Props scene={scene} />
        <Cat who="a" character={scene.characters.a} emotion={emotionOf('a')} talking={speaking === 'a'} onEl={onCatEl} />
        <Cat who="b" character={scene.characters.b} emotion={emotionOf('b')} talking={speaking === 'b'} onEl={onCatEl} />
      </svg>

      <SceneBubbleV2 line={line} name={line ? scene.characters[line.who]?.name : ''} side={line?.who ?? 'a'} visible={bubbleVisible} />

      {live && showProgress && scene.timeline?.length > 1 && (
        <div className="scn__progress" aria-hidden="true">
          {scene.timeline.map((_, i) => (
            <span key={i} className={`scn__dot${i === director.index ? ' is-on' : ''}${i < director.index ? ' is-done' : ''}`} />
          ))}
        </div>
      )}
      {children}
    </div>
  )
}
