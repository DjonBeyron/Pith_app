import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { renderTree } from './renderTree.js'
import SceneBubbleV2 from './SceneBubbleV2.jsx'
import { useSceneDirectorV2 } from './useSceneDirectorV2.js'
import { backgroundSprite, catSprite, getSprite } from './sprites/spriteRegistry.js'
import { slotsInDrawOrder, CAT_PLACEMENT } from './sprites/slots.js'
import { SCENE_VIEWBOX } from './sprites/backgrounds.js'
import { isWeakDevice } from '../../../shared/lib/deviceTier.js'
import { bubbleDisplay } from './sceneOptions.js'
import { sceneStaticMarkup } from './staticMarkup.js'
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
// rate — множитель скорости речи (скорость голоса урока); onState({ status, index, total })
// — только на границах реплик (нода урока ждёт 'ended' → onDone).
// display ('none' | 'text' | 'both') и voice ({ original?, translation? }) — переопределения
// поверх options сцены (sceneOptions.js); showBubbles — старый проп (false → 'none').
// Задание scene.task скрывает переводы в облачке даже при 'both'.

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
  scene, mode = 'live', active = true, paused = false, sound = true, rate = 1, lite, frameIndex = null,
  showBubbles, display, voice = null, showProgress = true, onTap, apiRef, onState, audioSrcOf = null, className = '', children,
}) {
  const live = mode === 'live'
  const mouthEls = useRef({ a: null, b: null })
  const rootRef = useRef(null)
  const [onScreen, setOnScreen] = useState(true)
  // audioSrcOf(url) — подмена ссылки озвучки реплики (blob прогрева ноды урока), иначе null
  const director = useSceneDirectorV2(scene, { enabled: live, sound, rate, active: active && onScreen, paused, mouthEls, audioSrcOf, voice })
  const { status: dStatus, index: dIndex, total: dTotal, mode: dMode, run: dRun } = director
  // apiRef — ДО эффекта onState: объект director новый каждый рендер, эффект переустанавливает ref в каждом коммите
  // (cleanup → null → заново), а onState может сразу звать apiRef.current.play() (лента: круг заново после 'ended')
  useEffect(() => {
    if (!apiRef) return undefined
    apiRef.current = live ? director : null
    return () => { apiRef.current = null }
  }, [apiRef, director, live])
  // mode ('audio' | 'speech' | 'timer') — чем звучит текущая реплика (нода урока: чип «Включить звук»)
  // run — счётчик запусков реплик: у сцены из ОДНОЙ реплики с loop состояние (playing, 0) повторяется, и без run круг был бы не виден
  useEffect(() => { if (live) onState?.({ status: dStatus, index: dIndex, total: dTotal, mode: dMode, run: dRun }) }, [live, onState, dStatus, dIndex, dTotal, dMode, dRun])

  // Рот переключает mouthDriver прямо на корне кота (data-mouth), минуя React
  const onCatEl = useCallback((who, el) => {
    mouthEls.current[who] = el?.querySelector?.('[data-part="cat"]') ?? null
  }, [])

  // Вне экрана — CSS-анимации стоят и режиссёр на авто-паузе
  useEffect(() => {
    const el = rootRef.current
    if (!live || !el || typeof IntersectionObserver === 'undefined') return undefined
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0.05 })
    io.observe(el)
    return () => io.disconnect()
  }, [live])

  const isLite = lite ?? isWeakDevice()
  const shown = bubbleDisplay(scene, { display, showBubbles }) // 'none' | 'text' | 'both' (task → не 'both')
  const line = live ? director.line : (frameIndex !== null ? scene.timeline?.[frameIndex] ?? null : null)
  const speaking = live ? director.speakingWho : null
  const phase = live ? director.phase : null
  const bubbleVisible = !!line && shown !== 'none' && (live ? director.status !== 'idle' : true)
  const bg = backgroundSprite(scene.location)
  const bgTree = useMemo(() => (live ? bg.build() : null), [bg, live])
  // Идл-анимации идут в idle и playing; на паузе/в конце — замирают
  const animPaused = live && (!active || paused || !onScreen || (director.status !== 'playing' && director.status !== 'idle'))

  const cls = [
    'scn', live ? 'scn--live' : 'scn--static', isLite ? 'scn--lite' : '', animPaused ? 'scn--paused' : '', className,
  ].filter(Boolean).join(' ')

  const emotionOf = who => (line && line.who === who ? line.emotion : 'neutral')

  return (
    <div
      ref={rootRef} className={cls} data-speaking={speaking ?? ''} data-status={live ? director.status : 'static'}
      data-display={shown} data-phase={phase ?? undefined}
      onClick={onTap} role={onTap ? 'button' : undefined} tabIndex={onTap ? 0 : undefined}
      onKeyDown={onTap ? e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onTap(e) } } : undefined}
    >
      {live ? (
        <svg className="scn__svg" viewBox={SCENE_VIEWBOX} preserveAspectRatio="xMidYMid slice" aria-label={scene.title || 'Сцена'} role="img">
          {renderTree(bgTree)}
          <Props scene={scene} />
          {/* Пока звучит перевод («диктор»), кот не «говорит»: рот закрыт, покачивания головы нет */}
          <Cat who="a" character={scene.characters.a} emotion={emotionOf('a')} talking={speaking === 'a' && phase !== 'translation'} onEl={onCatEl} />
          <Cat who="b" character={scene.characters.b} emotion={emotionOf('b')} talking={speaking === 'b' && phase !== 'translation'} onEl={onCatEl} />
        </svg>
      ) : (
        // Статика — готовой строкой (staticMarkup.js): без fiber-ов на ~190 узлов
        <svg
          className="scn__svg" viewBox={SCENE_VIEWBOX} preserveAspectRatio="xMidYMid slice" aria-label={scene.title || 'Сцена'} role="img"
          dangerouslySetInnerHTML={{ __html: sceneStaticMarkup(scene, line, frameIndex ?? -1) }}
        />
      )}

      <SceneBubbleV2
        line={line} name={line ? scene.characters[line.who]?.name : ''} side={line?.who ?? 'a'}
        visible={bubbleVisible} showTranslation={shown === 'both'} phase={phase}
      />

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
