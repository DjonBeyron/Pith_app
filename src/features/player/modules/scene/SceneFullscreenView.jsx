import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { Play, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import SceneRenderer from '../../../scene/v2/SceneRenderer.jsx'
import { sceneBubbleCropStyle } from '../../../scene/v2/sceneCropStyle.js'
import { setLessonMuted } from '../../lessonVolume.js'
import { SCENE_FS_Z } from './sceneFullscreenModel.js'
import { useSceneFullscreen } from './useSceneFullscreen.js'
import { useSceneProgress } from './useSceneProgress.js'

// Полноэкранный слой сцены — портал в document.body (position:fixed от вьюпорта, а не от containing block
// ленты с scaleY(-1)); слои 10000+ и классы фона/крестика/полосы прогресса те же, что у видео (video.css:
// .videoFsBg, .videoFullClose, .videoFsProgressTrack). Сцена занимает ВЕСЬ экран рамки плеера, как видео с
// object-fit: cover: кадр 360×640 масштабируется по ширине/высоте (fsCoverFrame), а фон за его краями
// продолжается (BLEED) — полос нет ни в портрете, ни в ландшафте, ни на узких экранах. Внутри — свой живой
// SceneRenderer (apiRef/onState — экранные, см. useScenePlayback); crop ноды (масштаб/сдвиг, как у видео) —
// слой вокруг сцены, те же проценты, что в ленте. Раскладка — как у видео: ОДИН значок play по центру (на паузе/до
// старта/после конца — тап по любому месту экрана пускает и ставит на паузу; отдельной нижней кнопки нет), сверху слева —
// кнопка звука (вкл/выкл, общее состояние «без звука» урока — setLessonMuted: озвучка и синтез реплик, значок ноды),
// сверху справа — крестик, снизу — тонкая полоса прогресса по времени (useSceneProgress, как videoFsProgressBar).
// Закрытие: крестик, свайп вниз, Escape, фон за пределами окна плеера (useSceneFullscreen.js).
export default function SceneFullscreenView({
  scene, showBubbles, display, voice, crop = null, paused, sound, muted, rate, audioSrcOf,
  status, index, run, at, apiRef, onState, onTogglePause, onClose, rootRef,
}) {
  const probeRef = useRef(null)
  const fs = useSceneFullscreen({ open: true, rootRef, probeRef, onClose })
  const barRef = useSceneProgress({ scene, voice, rate, sound, status, index, run, at, kind: 'bar' })
  const f = fs.frame
  const frameStyle = f
    ? { left: f.cover.left + 'px', top: f.cover.top + 'px', width: f.cover.width + 'px', height: f.cover.height + 'px' }
    : { visibility: 'hidden', inset: 0 }
  const stageStyle = f
    ? { left: f.left + 'px', top: f.top + 'px', width: f.w + 'px', height: f.h + 'px' }
    : { inset: 0 }
  const ended = status === 'ended'
  const playing = status === 'playing'
  const cropStyle = sceneBubbleCropStyle(crop)
  const renderer = (
    <SceneRenderer
      scene={scene} mode="live" active paused={paused} sound={sound} rate={rate} audioSrcOf={audioSrcOf}
      showBubbles={showBubbles} display={display} voice={voice} showProgress={false} apiRef={apiRef} onState={onState}
    />
  )
  return createPortal(
    <>
      <div className="videoFsBg" onClick={onClose} style={{ zIndex: SCENE_FS_Z.bg, WebkitTapHighlightColor: 'transparent' }} />
      <div
        className="playerSceneFsStage" data-scene-fs="" style={{ ...stageStyle, zIndex: SCENE_FS_Z.stage }}
        onTouchStart={fs.onTouchStart} onTouchEnd={fs.onTouchEnd} onClick={onTogglePause}
        role="button" aria-label={playing ? 'Пауза' : (ended ? 'Заново' : 'Пуск')}
      >
        <div ref={probeRef} className="playerSceneFsProbe" aria-hidden="true" />
        <div className="playerSceneFsFrame" style={frameStyle} data-status={status}>
          {cropStyle ? <div className="playerSceneCrop" style={cropStyle}>{renderer}</div> : renderer}
        </div>
        {!playing && (
          <div className="playerScenePlay" aria-hidden="true">
            {ended ? <RotateCcw size={22} color="white" /> : <Play size={22} color="white" fill="white" />}
          </div>
        )}
      </div>
      <div className="videoFsControls playerSceneFsControls" style={{ zIndex: SCENE_FS_Z.controls, WebkitTapHighlightColor: 'transparent' }}>
        <button type="button" className="videoFullClose" aria-label="Закрыть" onClick={onClose}>×</button>
        <button
          type="button" className="videoFullClose videoFsMute" aria-label={muted ? 'Включить звук' : 'Без звука'} aria-pressed={muted}
          onClick={() => setLessonMuted(!muted)}
        >
          {muted ? <VolumeX size={18} color="white" /> : <Volume2 size={18} color="white" />}
        </button>
        <div className="videoFsProgressTrack" role="progressbar" aria-label="Прогресс сцены">
          <div ref={barRef} className="videoFsProgressBar playerSceneFsProgress" />
        </div>
      </div>
    </>,
    document.body,
  )
}
