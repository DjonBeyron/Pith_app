import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { Play, VolumeX } from 'lucide-react'
import SceneBody from './SceneBody.jsx'
import { useSceneNear } from './useSceneNear.js'
import { getSmallPx } from '../circle/useCircleExpand.js'
import { useSceneCircleExpand } from './useSceneCircleExpand.js'
import { useSceneProgress } from './useSceneProgress.js'
import { sceneCircleViewBox } from './sceneCircleFit.js'
import SceneSoundChip from './SceneSoundChip.jsx'
import SceneCircleDebug from './SceneCircleDebug.jsx'
import { isSolo } from '../../../scene/v2/scenePit.js'

// Слой сцены — размером с круг (кадр задаёт viewBox, sceneCircleViewBox), а не гигантская обёртка, которую потом ещё и раздувает раскрытие
const INNER_STYLE = { position: 'absolute', inset: 0 }
const RING_R = 106
const RING_C = 2 * Math.PI * RING_R
const WRAP = { flexWrap: 'wrap' } // окно отладки админа (SceneCircleDebug) встаёт под кружком второй строкой; без него — один ребёнок, wrap ничего не меняет

// Режим 'circle' ноды scene: круглая вставка как видеосообщение (те же классы circleWrap/circleFrame/кольцо,
// circle.css), сцена кадрирована на головы котов и облачко (sceneCircleFit.js; одиночная сцена — одна голова
// по центру; crop ноды — масштаб/сдвиг содержимого внутри круга, как у видео-кружка). Поведение — как у
// видео-кружка: тап раскрывает кружок на ширину плеера (useSceneCircleExpand → circle/useCircleExpand.js:
// transform, подложка, свайп вниз/тап по фону/Esc закрывают); тот же единственный живой SVG растёт, не клонируется.
// Кольцо прогресса — по ВРЕМЕНИ воспроизведения, плавно и синхронно с режиссёром (useSceneProgress.js,
// sceneProgressModel.js): WAAPI-анимация дуги, без setState на кадр.
// Доигравшая сцена замирает в статичный кадр (SceneBody), но в раскрытом кружке снова живая — «ещё раз».
// rootRef — корень круга (его же меряем: размер = ширина круга).
// display/voice — переопределения ноды (режим показа текста / флаги озвучки) поверх options сцены.
// trace/tag — трасса сцены (useScenePlayback → sceneTrace.js): сюда пишут раскрытие и кольцо, админ видит её в SceneCircleDebug под кружком.
export default function SceneCircleView({
  scene, showBubbles, display = null, voice = null, crop = null, isHistory, ended = false, pending, status, index, run = 0, at, total = 0, mode = 'timer',
  paused, sound, rate, audioSrcOf = null, soundChip = false, bottomOffset = 0, onEnableSound, apiRef, rootRef, onState, onExpand, onFreeze,
  trace = null, tag = null,
}) {
  const [size, setSize] = useState(() => (typeof window !== 'undefined' ? getSmallPx() : 200))
  useLayoutEffect(() => {
    const w = rootRef.current?.clientWidth
    if (w) setSize(w)
  }, [rootRef])
  const ex = useSceneCircleExpand({ rootRef, size, bottomOffset, onExpand, status, enabled: !isHistory, trace: trace ?? undefined })
  const open = ex.expanded || ex.collapsing
  const frozenEnded = ended && !(open && ex.grown) // доигравшая: статичный кадр, пока кружок растёт (живой SVG — после роста)
  // Свернули повтор доигравшей сцены: рамка стала статичной, состояние ноды — «ended» (useScenePlayback.freeze)
  useEffect(() => { if (frozenEnded && status !== 'ended') onFreeze?.() }, [frozenEnded, status, onFreeze])
  const viewBox = useMemo(() => sceneCircleViewBox({ solo: isSolo(scene), crop }), [scene, crop])
  const last = Math.max(0, (scene.timeline?.length ?? 1) - 1)
  const near = useSceneNear(rootRef, isHistory || frozenEnded)
  const idle = !isHistory && status !== 'playing'
  const ringRef = useSceneProgress({
    scene, voice, rate, sound, status, index, run, at, kind: 'ring', circumference: RING_C, enabled: !isHistory, trace,
  })
  const wrapStyle = {
    width: size + 'px', height: size + 'px',
    ...(ex.expanded ? { transform: ex.expandTransform ?? undefined, zIndex: 10 } : {}),
    ...(ex.collapsing && !ex.expanded ? { zIndex: 10 } : {}),
  }

  return (
    <div className="playerMsgRow playerMsgRowCircle" style={isHistory ? undefined : WRAP}>
      {ex.expanded && <div className="circleBackdrop" onClick={() => ex.collapse('тап по подложке')} />}
      <div className={`playerMsgBubble playerMsgBubble--circle playerMsgBubble--sceneCircle${open ? ' playerMsgBubble--circle--expanded' : ''}`}>
        <div
          ref={rootRef}
          className="circleWrap playerSceneCircle" style={wrapStyle}
          onClick={isHistory ? undefined : ex.handleTap} role={isHistory ? undefined : 'button'} tabIndex={isHistory ? undefined : 0}
          onTouchStart={isHistory ? undefined : ex.onTouchStart} onTouchEnd={isHistory ? undefined : ex.onTouchEnd}
          onKeyDown={isHistory ? undefined : e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); ex.handleTap() } }}
          data-status={isHistory ? 'history' : status} data-expanded={ex.expanded ? '' : undefined}
        >
          <div className="circleFrame">
            <div className="playerSceneCircleInner" style={INNER_STYLE}>
              <SceneBody
                scene={scene} isHistory={isHistory} ended={frozenEnded} near={near} last={last} showBubbles={showBubbles}
                display={display} voice={voice} showProgress={false} viewBox={viewBox}
                live={{ active: !pending, paused, sound, rate, audioSrcOf, apiRef, onState }}
              />
            </div>
          </div>
          <svg className="circleRingSvg" viewBox="0 0 218 218" aria-hidden="true">
            <circle cx="109" cy="109" r={RING_R} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="1.5" />
            <circle
              ref={ringRef} className="playerSceneRingArc" cx="109" cy="109" r={RING_R} fill="none"
              stroke="#b6fe3b" strokeWidth="1.5" strokeLinecap="round"
              strokeDasharray={`${RING_C} 9999`} strokeDashoffset={String(RING_C)}
              transform="rotate(-90 109 109)"
            />
          </svg>
          {idle && (
            <div className="playerScenePlay" aria-hidden="true">
              <Play size={22} color="white" fill="white" />
            </div>
          )}
          {!isHistory && !sound && !soundChip && !ex.expanded && (
            <div className="circleMutedIcon"><VolumeX size={14} color="white" /></div>
          )}
          {soundChip && <SceneSoundChip onClick={onEnableSound} />}
        </div>
      </div>
      {!isHistory && (
        <SceneCircleDebug
          tag={tag} status={status} index={index} total={total || scene.timeline?.length || 0} mode={mode}
          sound={sound} soundChip={soundChip} ended={ended} frozen={frozenEnded} expanded={ex.expanded} grown={ex.grown}
          circumference={RING_C}
        />
      )}
    </div>
  )
}
