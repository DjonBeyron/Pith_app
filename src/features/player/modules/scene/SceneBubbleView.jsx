import { Play, VolumeX } from 'lucide-react'
import PlayerBubble from '../../PlayerBubble.jsx'
import SceneBody from './SceneBody.jsx'
import { useSceneNear } from './useSceneNear.js'
import SceneSoundChip from './SceneSoundChip.jsx'
import { sceneBubbleCropStyle } from '../../../scene/v2/sceneCropStyle.js'

// Режим 'bubble' ноды scene: пузырь как у видео (тёмная подложка, скругление
// 4/14, 9:16), внутри живая сцена. Тап по сцене — до старта пуск на месте, дальше
// полный экран (useScenePlayback.handleTap, как у видео). История — статичный
// последний кадр; доигравшая сцена (ended) тоже замирает в такой кадр (SceneBody.jsx). Пропсы плоские (не объект хука): так компилятор React видит,
// что рефы в рендере не читаются.
// display/voice — переопределения ноды (режим показа текста / флаги озвучки) поверх options сцены.
// soundChip — автозапуск пошёл без звука (политика автоплея): чип «Включить звук».
export default function SceneBubbleView({
  scene, showBubbles, display = null, voice = null, crop = null, isHistory, ended = false, pending, status, paused, sound, rate, audioSrcOf = null,
  soundChip = false, onEnableSound, apiRef, rootRef, onState, onTap,
}) {
  const last = Math.max(0, (scene.timeline?.length ?? 1) - 1)
  const near = useSceneNear(rootRef, isHistory || ended)
  const idle = !isHistory && status !== 'playing'
  // crop ноды — масштаб/сдвиг сцены внутри рамки, как у видео; умолчание → слоя нет, DOM как у старых нод
  const cropStyle = sceneBubbleCropStyle(crop)
  const body = (
    <SceneBody
      scene={scene} isHistory={isHistory} ended={ended} near={near} last={last} showBubbles={showBubbles}
      display={display} voice={voice} showProgress onTap={onTap}
      live={{ active: !pending, paused, sound, rate, audioSrcOf, apiRef, onState }}
    />
  )
  return (
    <div className="playerMsgRow">
      <PlayerBubble fixed className="playerMsgBubble playerMsgBubble--video playerMsgBubble--scene">
        <div ref={rootRef} className="playerSceneFrame" data-status={isHistory ? 'history' : status}>
          {cropStyle ? <div className="playerSceneCrop" style={cropStyle}>{body}</div> : body}
          {idle && (
            <div className="playerScenePlay" aria-hidden="true">
              <Play size={22} color="white" fill="white" />
            </div>
          )}
          {!isHistory && !sound && !soundChip && (
            <div className="videoMutedIcon"><VolumeX size={14} color="white" /></div>
          )}
          {soundChip && <SceneSoundChip onClick={onEnableSound} />}
        </div>
      </PlayerBubble>
    </div>
  )
}
