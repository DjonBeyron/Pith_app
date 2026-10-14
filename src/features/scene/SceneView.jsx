import { useState } from 'react'
import SceneBackground from './SceneBackground.jsx'
import CatCharacter from './CatCharacter.jsx'
import SpeechBubble from './SpeechBubble.jsx'
import { useSceneDirector } from './useSceneDirector.js'
import { unlockSpeech } from './sceneSpeech.js'

// Вертикальная сцена 9:16 (как видео в ленте): фон, два кота слева/справа, облачко.
// Тап по сцене — пауза/пуск. Переключатели облачков и звука, кнопка «заново».
// iOS: озвучка стартует только из жеста — оверлей «▶ Старт» до первого запуска.
// Смена сценария — через key у SceneView (режиссёр сбрасывается размонтированием).
export default function SceneView({ scene }) {
  const [bubbles, setBubbles] = useState(true)
  const [sound, setSound] = useState(true)
  const [started, setStarted] = useState(false)
  const director = useSceneDirector(scene, { sound })

  const [left, right] = scene.characters
  const speakerSide = director.speaker ? (director.speaker.id === left.id ? 'left' : 'right') : null

  const start = () => {
    unlockSpeech()
    setStarted(true)
    director.play()
  }

  const onStageTap = () => {
    if (!started) { start(); return }
    if (director.status === 'ended') director.restart()
    else director.toggle()
  }

  const catProps = (c, side) => {
    const isSpeaker = director.line?.who === c.id
    return {
      colors: c.colors,
      emotion: isSpeaker ? director.line.emotion : 'neutral',
      pose: isSpeaker ? director.line.pose : 'idle',
      talking: director.speakingId === c.id,
      wordTick: director.wordTick,
      flip: side === 'right',
      className: `scene-cat scene-cat--${side}`,
      style: { '--blink-delay': side === 'left' ? '0s' : '1.7s', '--idle-delay': side === 'left' ? '0s' : '0.9s' },
    }
  }

  const statusLabel = {
    idle: 'готово', playing: 'играет', paused: 'пауза', ended: 'конец',
  }[director.status]

  return (
    <div className="scene">
      <div className="scene__stage" onClick={onStageTap} role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onStageTap() } }}>
        <SceneBackground id={scene.background} />
        <CatCharacter {...catProps(left, 'left')} />
        {right && <CatCharacter {...catProps(right, 'right')} />}

        <SpeechBubble
          visible={bubbles && started && director.status !== 'idle' && !!director.line}
          text={director.line?.text}
          name={director.speaker?.name}
          side={speakerSide ?? 'left'}
        />

        {!started && (
          <div className="scene__overlay">
            <button type="button" className="scene__start" onClick={e => { e.stopPropagation(); start() }}>
              ▶ Старт
            </button>
            <div className="scene__hint">Озвучка включится после нажатия</div>
          </div>
        )}
        {started && director.status === 'paused' && (
          <div className="scene__overlay scene__overlay--soft"><span className="scene__pauseIcon">❚❚</span></div>
        )}
        {started && director.status === 'ended' && (
          <div className="scene__overlay scene__overlay--soft">
            <button type="button" className="scene__start" onClick={e => { e.stopPropagation(); director.restart() }}>
              ↻ Ещё раз
            </button>
          </div>
        )}
        <div className="scene__progress" aria-hidden="true">
          {scene.timeline.map((_, i) => (
            <span key={i} className={`scene__dot${i === director.index ? ' is-on' : ''}${i < director.index ? ' is-done' : ''}`} />
          ))}
        </div>
      </div>

      <div className="scene__bar">
        <button type="button" className={`scene__btn${bubbles ? ' is-on' : ''}`} onClick={() => setBubbles(b => !b)}
          aria-pressed={bubbles}>
          💬 {bubbles ? 'Облачка вкл' : 'Облачка выкл'}
        </button>
        <button type="button" className={`scene__btn${sound ? ' is-on' : ''}`} onClick={() => setSound(s => !s)}
          aria-pressed={sound}>
          {sound ? '🔊 Звук вкл' : '🔇 Звук выкл'}
        </button>
        <button type="button" className="scene__btn" onClick={() => { if (!started) setStarted(true); director.restart() }}>
          ↻ Заново
        </button>
        <span className="scene__status">
          {statusLabel} · {Math.min(director.index + 1, director.total)}/{director.total} · {director.mode === 'speech' ? 'голос' : 'таймер'}
        </span>
      </div>
    </div>
  )
}
