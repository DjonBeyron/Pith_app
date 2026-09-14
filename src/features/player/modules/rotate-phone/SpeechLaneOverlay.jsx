import { useState, useEffect, useLayoutEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import SpeechLaneStage from '../../../../shared/ui/SpeechLaneStage.jsx'
import BurstConfetti from '../../../../shared/ui/BurstConfetti.jsx'
import { litWindows } from '../../../../shared/lib/speechLaneTiming.js'
import { pLog } from '../../../../shared/lib/debug.js'
import { useSpeechLaneGame } from './useSpeechLaneGame.js'
import { useStageOrientation } from './useStageOrientation.js'
import { useAudioSource } from '../audio/useAudioSource.js'
import { holdLandscape, landscapeDebugState } from './useLandscapeWatch.js'

// Те же числа держит CSS (speech-lane-overlay.css) — сторож в тестах
export const EXPAND_MS   = 1500
export const DRAW_MS     = 700
export const FIREWORK_MS = 1400

// Заливка и игра: пузырь «переверни» цветом своего фона растягивается на весь
// экран (portal в body поверх всего), сверху вниз рисуются два пунктира,
// идёт прогон (useSpeechLaneGame), потом фейерверк снизу вверх и экран
// стягивается обратно в пузырь. Всё это время альбомная ориентация впущена
// (holdLandscape) — заглушка «Поверните вертикально» не должна лечь
// поверх игры; при замке поворота сцена рисуется повёрнутой (useStageOrientation).
export default function SpeechLaneOverlay({ bubbleRef, node, file, score, rotation, onFinished }) {
  const [phase, setPhase] = useState('expand')   // expand → draw → play → fireworks → collapse
  const [full, setFull] = useState(false)
  const { src } = useAudioSource(node, file)
  const { mode, sign } = useStageOrientation(rotation)
  const tData = node.typeData?.rotate_phone ?? {}
  const lit = useMemo(() => litWindows(score.layers, tData.wordTimings, score.audioClips), [score, tData.wordTimings])

  // Рамка и цвет пузыря — откуда растём и куда стягиваемся. Меряем при
  // старте и перед стягиванием заново: чат мог проскроллиться
  const measure = () => {
    const bubbleEl = bubbleRef?.current
    const r = bubbleEl?.getBoundingClientRect()
    const cs = bubbleEl ? getComputedStyle(bubbleEl) : null
    return {
      left: r?.left ?? window.innerWidth / 2, top: r?.top ?? window.innerHeight / 2,
      width: r?.width ?? 0, height: r?.height ?? 0,
      radius: cs?.borderRadius || '18px', color: cs?.backgroundColor || '#1a1d22',
    }
  }
  const [box, setBox] = useState(null)           // {left, top, width, height, radius, color}

  // Старт: рамка пузыря (до первой отрисовки — оттого layout-эффект) →
  // следующий кадр → на весь экран (переход в CSS)
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBox(measure())
    const release = holdLandscape('оверлей игры')
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setFull(true)))
    return () => { cancelAnimationFrame(id); release() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Расписание фаз. Игра сама зовёт onEnd → fireworks
  useEffect(() => {
    let id
    if (phase === 'expand' && full) id = setTimeout(() => setPhase('draw'), EXPAND_MS)
    else if (phase === 'draw') id = setTimeout(() => setPhase('play'), DRAW_MS)
    else if (phase === 'fireworks') id = setTimeout(() => { setBox(measure()); setFull(false); setPhase('collapse') }, FIREWORK_MS)
    else if (phase === 'collapse') id = setTimeout(() => onFinished?.(), EXPAND_MS)
    return () => clearTimeout(id)
  }, [phase, full]) // eslint-disable-line react-hooks/exhaustive-deps

  // Снимок ориентации на каждой фазе — если заглушка всё же видна, по логу
  // ясно, на каком шаге и при каком числе держателей
  useEffect(() => { pLog(`[speech-lane] фаза: ${phase}${phase === 'play' ? ` (режим ${mode})` : ''} · ${landscapeDebugState()}`) }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  const { t, level, audioRef } = useSpeechLaneGame({
    active: phase === 'play',
    audioClips: score.audioClips, timelineLen: score.timelineLen, wave: tData.waveformData,
    onEnd: () => setPhase('fireworks'),
  })

  if (!box) return null
  const style = full
    ? { left: 0, top: 0, width: '100vw', height: '100dvh', borderRadius: 0, background: box.color }
    : { left: box.left, top: box.top, width: box.width, height: box.height, borderRadius: box.radius, background: box.color }
  const showStage = phase === 'draw' || phase === 'play' || phase === 'fireworks'

  return createPortal(
    <div className={`slOverlay${full ? ' slOverlay--full' : ''}`} style={style}>
      {showStage && (
        <div className={`slOverlayStage slOverlayStage--${mode}${phase === 'draw' ? ' slOverlayStage--drawing' : ''}`}
          style={{ '--sl-rot': `${sign * 90}deg` }}>
          <SpeechLaneStage layers={score.layers} t={t} lit={lit} level={level} />
        </div>
      )}
      {phase === 'fireworks' && <BurstConfetti count={40} size={5} zIndex={10001} />}
      {src && <audio ref={audioRef} src={src} preload="auto" />}
    </div>,
    document.body,
  )
}
