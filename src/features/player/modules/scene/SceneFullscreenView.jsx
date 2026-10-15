import { createPortal } from 'react-dom'
import { Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import SceneRenderer from '../../../scene/v2/SceneRenderer.jsx'
import { setLessonMuted } from '../../lessonVolume.js'
import { SCENE_FS_Z } from './sceneFullscreenModel.js'
import { useSceneFullscreen } from './useSceneFullscreen.js'

// Полноэкранный слой сцены — портал в document.body (position:fixed от вьюпорта, а не
// от containing block ленты с scaleY(-1)); слои 10000+ и классы фона/крестика те же,
// что у видео (video.css: .videoFsBg, .videoFullClose). Внутри — свой живой
// SceneRenderer (apiRef/onState — экранные, см. useScenePlayback), кадр 9:16 по
// центру рамки плеера, снизу кнопки: пауза/пуск (после конца — заново), звук
// вкл/выкл (= «без звука» урока, как у видео), крестик. Тап по сцене — пауза/пуск.
// Закрытие: фон, крестик, свайп вниз, Escape (useSceneFullscreen.js).
export default function SceneFullscreenView({
  scene, showBubbles, display, voice, paused, sound, muted, rate, audioSrcOf,
  status, apiRef, onState, onTogglePause, onClose, rootRef,
}) {
  const fs = useSceneFullscreen({ open: true, rootRef, onClose })
  const frameStyle = fs.frame
    ? { width: fs.frame.width + 'px', height: fs.frame.height + 'px' }
    : { width: 'min(100vw, 56.25vh)', aspectRatio: '9 / 16' }
  const stageStyle = fs.frame
    ? { left: fs.frame.left + 'px', top: fs.frame.top + 'px', width: fs.frame.w + 'px', height: fs.frame.h + 'px' }
    : { inset: 0 }
  const ended = status === 'ended'
  const playing = status === 'playing'
  return createPortal(
    <>
      <div className="videoFsBg" onClick={onClose} style={{ zIndex: SCENE_FS_Z.bg, WebkitTapHighlightColor: 'transparent' }} />
      <div
        className="playerSceneFsStage" data-scene-fs="" style={{ ...stageStyle, zIndex: SCENE_FS_Z.stage }}
        onTouchStart={fs.onTouchStart} onTouchEnd={fs.onTouchEnd} onClick={onClose}
      >
        <div className="playerSceneFsFrame" style={frameStyle} data-status={status} onClick={e => e.stopPropagation()}>
          <SceneRenderer
            scene={scene} mode="live" active paused={paused} sound={sound} rate={rate} audioSrcOf={audioSrcOf}
            showBubbles={showBubbles} display={display} voice={voice} apiRef={apiRef} onState={onState} onTap={onTogglePause}
          />
          {!playing && (
            <div className="playerScenePlay" aria-hidden="true">
              {ended ? <RotateCcw size={22} color="white" /> : <Play size={22} color="white" fill="white" />}
            </div>
          )}
        </div>
      </div>
      <div className="videoFsControls playerSceneFsControls" style={{ zIndex: SCENE_FS_Z.controls, WebkitTapHighlightColor: 'transparent' }}>
        <button type="button" className="videoFullClose" aria-label="Закрыть" onClick={onClose}>×</button>
        <div className="playerSceneFsBar">
          <button type="button" className="playerSceneFsBtn" aria-label={playing ? 'Пауза' : (ended ? 'Заново' : 'Пуск')} onClick={onTogglePause}>
            {playing ? <Pause size={20} color="white" fill="white" /> : (ended ? <RotateCcw size={20} color="white" /> : <Play size={20} color="white" fill="white" />)}
          </button>
          <button
            type="button" className="playerSceneFsBtn" aria-label={muted ? 'Включить звук' : 'Без звука'} aria-pressed={muted}
            onClick={e => { e.stopPropagation(); setLessonMuted(!muted) }}
          >
            {muted ? <VolumeX size={20} color="white" /> : <Volume2 size={20} color="white" />}
          </button>
        </div>
      </div>
    </>,
    document.body,
  )
}
