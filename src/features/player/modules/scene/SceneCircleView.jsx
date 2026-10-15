import { useLayoutEffect, useState } from 'react'
import { Play, VolumeX } from 'lucide-react'
import SceneBody from './SceneBody.jsx'
import { useSceneNear } from './useSceneNear.js'
import { getSmallPx } from '../circle/useCircleExpand.js'
import { sceneCircleFit, ringOffset } from './sceneCircleFit.js'
import SceneSoundChip from './SceneSoundChip.jsx'
import { isSolo } from '../../../scene/v2/scenePit.js'

const RING_R = 106
const RING_C = 2 * Math.PI * RING_R

// Режим 'circle' ноды scene: круглая вставка как видеосообщение (те же классы
// circleWrap/circleFrame/кольцо, circle.css), сцена кадрирована на головы
// котов и облачко (sceneCircleFit.js; одиночная сцена — одна голова по центру). Кольцо прогресса — по репликам.
// Тап по кругу — до старта пуск, дальше полноэкранный пузырь 9:16 (вместо
// раскрытия кружка: useCircleExpand завязан на <video>, а сцене в круге тесно).
// rootRef — корень круга (его же меряем: размер = ширина круга).
// display/voice — переопределения ноды (режим показа текста / флаги озвучки) поверх options сцены.
export default function SceneCircleView({
  scene, showBubbles, display = null, voice = null, isHistory, ended = false, pending, status, index, total, paused, sound, rate,
  audioSrcOf = null, soundChip = false, onEnableSound, apiRef, rootRef, onState, onTap,
}) {
  const [size, setSize] = useState(() => (typeof window !== 'undefined' ? getSmallPx() : 200))
  useLayoutEffect(() => {
    const w = rootRef.current?.clientWidth
    if (w) setSize(w)
  }, [rootRef])
  const last = Math.max(0, (scene.timeline?.length ?? 1) - 1)
  const near = useSceneNear(rootRef, isHistory || ended)
  const idle = !isHistory && status !== 'playing'
  const dash = isHistory ? 0 : ringOffset({ status, index, total }, RING_C)

  return (
    <div className="playerMsgRow playerMsgRowCircle">
      <div className="playerMsgBubble playerMsgBubble--circle playerMsgBubble--sceneCircle">
        <div
          ref={rootRef}
          className="circleWrap playerSceneCircle" style={{ width: size + 'px', height: size + 'px' }}
          onClick={isHistory ? undefined : onTap} role={isHistory ? undefined : 'button'} tabIndex={isHistory ? undefined : 0}
          onKeyDown={isHistory ? undefined : e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onTap(e) } }}
          data-status={isHistory ? 'history' : status}
        >
          <div className="circleFrame">
            <div className="playerSceneCircleInner" style={sceneCircleFit(size, { solo: isSolo(scene) })}>
              <SceneBody
                scene={scene} isHistory={isHistory} ended={ended} near={near} last={last} showBubbles={showBubbles}
                display={display} voice={voice} showProgress={false}
                live={{ active: !pending, paused, sound, rate, audioSrcOf, apiRef, onState }}
              />
            </div>
          </div>
          <svg className="circleRingSvg" viewBox="0 0 218 218" aria-hidden="true">
            <circle cx="109" cy="109" r={RING_R} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="1.5" />
            <circle
              className="playerSceneRingArc" cx="109" cy="109" r={RING_R} fill="none"
              stroke="#b6fe3b" strokeWidth="1.5" strokeLinecap="round"
              strokeDasharray={`${RING_C} 9999`} strokeDashoffset={String(dash)}
              transform="rotate(-90 109 109)"
            />
          </svg>
          {idle && (
            <div className="playerScenePlay" aria-hidden="true">
              <Play size={22} color="white" fill="white" />
            </div>
          )}
          {!isHistory && !sound && !soundChip && (
            <div className="circleMutedIcon"><VolumeX size={14} color="white" /></div>
          )}
          {soundChip && <SceneSoundChip onClick={onEnableSound} />}
        </div>
      </div>
    </div>
  )
}
