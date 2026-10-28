import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { renderTree } from './renderTree.js'
import SceneBubbleV2 from './SceneBubbleV2.jsx'
import { useSceneDirectorV2 } from './useSceneDirectorV2.js'
import { backgroundSprite, characterSprite, getSprite } from './sprites/spriteRegistry.js'
import { slotsInDrawOrder, CAT_PLACEMENT, catPlacement } from './sprites/slots.js'
import { isSolo } from './scenePit.js'
import { SCENE_VIEWBOX } from './sprites/backgrounds.js'
import { isWeakDevice } from '../../../shared/lib/deviceTier.js'
import { bubbleDisplay } from './sceneOptions.js'
import { sceneStaticMarkup } from './staticMarkup.js'
import './scene-v2.css'
import './scene-v2-cat.css'
import './scene-v2-pit.css'
import { resolveAnimV2 } from './animFlags.js'
import { sceneTrace } from './sceneTrace.js'
import { settleSceneIdle } from './sceneSettle.js'

// Быстрый рендерер сцены v2 (9:16, адаптивный). Один <svg>: фон → предметы
// по слотам → два кота (или один по центру — одиночная сцена, scenePit.js: облачко
// side 'c' по центру, корень несёт data-solo); облачко — HTML поверх. Режимы:
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
// animV2 — «живой Пит v2» (рот из 9 форм по буквам и громкости, зрачки, усы; только маскот): true / false — явно (стенд сравнения), не задан —
// флаг админки (animFlags.js, по умолчанию выключен). Класс .scn--v2 включает стили зрачков и усов (scene-v2-pit.css); на lite остаётся только рот.

function Cat({ who, character, emotion, face, talking, onEl, solo = false }) {
  const sprite = characterSprite(character)
  const tree = useMemo(
    () => sprite.build({
      palette: character.palette, stripes: character.stripes !== false, emotion, flip: who === 'b',
      face, pupilReaction: character.pupilReaction !== false, extraFace: character.extraFace !== false, // лицо маскота (обычный кот их не читает)
    }),
    [sprite, character.palette, character.stripes, character.pupilReaction, character.extraFace, emotion, face, who],
  )
  const p = catPlacement(who, solo)
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
  scene, mode = 'live', active = true, paused = false, sound = true, rate = 1, lite, frameIndex = null, animV2: animV2Prop,
  showBubbles, display, voice = null, showProgress = true, viewBox = null, onTap, apiRef, onState, audioSrcOf = null, className = '', children,
  settle = false, // родитель просит успокоить позу заранее (кружок сворачивает повтор доигравшей сцены — впереди замена статичным кадром)
}) {
  const live = mode === 'live'
  const solo = isSolo(scene) // один кот (a) по центру, b не рисуется
  const mouthEls = useRef({ a: null, b: null })
  const rootRef = useRef(null)
  const [onScreen, setOnScreen] = useState(true)
  // audioSrcOf(url) — подмена ссылки озвучки реплики (blob прогрева ноды урока), иначе null
  const animV2 = resolveAnimV2(animV2Prop)
  const director = useSceneDirectorV2(scene, { enabled: live, sound, rate, active: active && onScreen, paused, mouthEls, audioSrcOf, voice, animV2, lite })
  const { status: dStatus, index: dIndex, total: dTotal, mode: dMode, run: dRun, anchor: dAnchor, anchorMs: dAnchorMs } = director
  // apiRef — ДО эффекта onState: объект director новый каждый рендер, эффект переустанавливает ref в каждом коммите
  // (cleanup → null → заново), а onState может сразу звать apiRef.current.play() (лента: круг заново после 'ended')
  useEffect(() => {
    if (!apiRef) return undefined
    apiRef.current = live ? director : null
    return () => { apiRef.current = null }
  }, [apiRef, director, live])
  // mode ('audio' | 'speech' | 'timer') — чем звучит текущая реплика (нода урока: чип «Включить звук»)
  // run — счётчик запусков реплик: у сцены из ОДНОЙ реплики с loop состояние (playing, 0) повторяется, и без run круг был бы не виден
  // anchor — файл реплики реально зазвучал: то же состояние ещё раз с новым временем (кольцо заново отсчитывает длительность реплики)
  useEffect(() => { if (live) onState?.({ status: dStatus, index: dIndex, total: dTotal, mode: dMode, run: dRun, anchor: dAnchor, anchorMs: dAnchorMs }) }, [live, onState, dStatus, dIndex, dTotal, dMode, dRun, dAnchor, dAnchorMs])

  // Рот переключает mouthDriver прямо на корне кота (data-mouth), минуя React
  const onCatEl = useCallback((who, el) => {
    mouthEls.current[who] = el?.querySelector?.('[data-part="cat"]') ?? null
  }, [])

  // Вне экрана — CSS-анимации стоят и режиссёр на авто-паузе. threshold 0 (любой видимый пиксель), не 0.05: рамка кружка Пита — кадр
  // в ~20 раз больше круга (обрезан overflow), видимая доля ≈ 4 % — при пороге 5 % режиссёр считал сцену «вне экрана» и никогда не играл
  useEffect(() => {
    const el = rootRef.current
    if (!live || !el || typeof IntersectionObserver === 'undefined') return undefined
    const io = new IntersectionObserver(([e]) => { sceneTrace(`рендерер: ${e.isIntersecting ? 'на экране' : 'ВНЕ экрана'} (ratio=${Math.round((e.intersectionRatio ?? 0) * 1000) / 1000})`); setOnScreen(e.isIntersecting) }, { threshold: 0 })
    io.observe(el)
    return () => io.disconnect()
  }, [live])

  const isLite = lite ?? isWeakDevice()
  // Сцена доиграла: идл-анимации не замирают в случайной позе (а потом «прыгали» бы в нейтраль при замене статичным кадром), а плавно
  // успокаиваются (sceneSettle.js). Повтор («ещё раз») снимает — анимации снова идут. На lite анимаций нет — нечего успокаивать
  const settling = live && !isLite && (director.status === 'ended' || settle)
  useEffect(() => {
    if (!settling) return undefined
    return settleSceneIdle(rootRef.current, { onDone: n => sceneTrace(`кадр: поза успокаивается (${n} частей) перед заморозкой`) })
  }, [settling])
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
    'scn', live ? 'scn--live' : 'scn--static', isLite ? 'scn--lite' : '', live && animV2 ? 'scn--v2' : '', animPaused ? 'scn--paused' : '', className,
  ].filter(Boolean).join(' ')

  const emotionOf = who => (line && line.who === who ? line.emotion : 'neutral')
  const faceOf = who => (line ? (line.who === who ? line.face : line.react) : undefined) // лицо маскота: говорящий — face, слушающий — react

  return (
    <div
      ref={rootRef} className={cls} data-speaking={speaking ?? ''} data-status={live ? director.status : 'static'}
      data-display={shown} data-phase={phase ?? undefined} data-solo={solo ? '1' : undefined}
      onClick={onTap} role={onTap ? 'button' : undefined} tabIndex={onTap ? 0 : undefined}
      onKeyDown={onTap ? e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onTap(e) } } : undefined}
    >
      {live ? (
        <svg className="scn__svg" viewBox={viewBox ?? SCENE_VIEWBOX} preserveAspectRatio="xMidYMid slice" aria-label={scene.title || 'Сцена'} role="img">
          {renderTree(bgTree)}
          <Props scene={scene} />
          {/* Пока звучит перевод («диктор»), кот не «говорит»: рот закрыт, покачивания головы нет */}
          <Cat who="a" solo={solo} character={scene.characters.a} emotion={emotionOf('a')} face={faceOf('a')} talking={speaking === 'a' && phase !== 'translation'} onEl={onCatEl} />
          {!solo && <Cat who="b" character={scene.characters.b} emotion={emotionOf('b')} face={faceOf('b')} talking={speaking === 'b' && phase !== 'translation'} onEl={onCatEl} />}
        </svg>
      ) : (
        // Статика — готовой строкой (staticMarkup.js): без fiber-ов на ~190 узлов
        <svg
          className="scn__svg" viewBox={viewBox ?? SCENE_VIEWBOX} preserveAspectRatio="xMidYMid slice" aria-label={scene.title || 'Сцена'} role="img"
          dangerouslySetInnerHTML={{ __html: sceneStaticMarkup(scene, line, frameIndex ?? -1) }}
        />
      )}

      <SceneBubbleV2
        line={line} name={line ? scene.characters[line.who]?.name : ''} side={solo ? 'c' : line?.who ?? 'a'}
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
