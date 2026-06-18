import { useState } from 'react'
import PlayerBubble from '../../PlayerBubble.jsx'
import PlayerTypingText from '../../PlayerTypingText.jsx'

const WAVE = [7,11,16,22,14,19,24,17,10,20,13,22,18,11,25,21,15,9,18,24,16,12,21,14,19,10,17,23,15,9,13,19,21,14,17,24,11,18,22,15,10,19,13,25,16,9,20,23,12,17]

function PlayTriangle() {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
      <polygon points="1,0 10,5 1,10" fill="var(--player-bg, #0e1013)" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="0" width="3" height="10" fill="var(--player-bg, #0e1013)" rx="1" />
      <rect x="6" y="0" width="3" height="10" fill="var(--player-bg, #0e1013)" rx="1" />
    </svg>
  )
}

export default function AudioModule({ node, file }) {
  const src        = file?.r2Url ?? null
  const text       = node.typeData?.audio?.text ?? ''
  const highlights = node.typeData?.audio?.highlights ?? []

  const [isPlaying, setIsPlaying] = useState(false)
  const [isFading,  setIsFading]  = useState(false)

  function handleTypingChange(active) {
    if (active) setIsFading(true)
  }

  const bubbleClass = [
    'playerMsgBubble',
    'playerMsgBubble--audio',
    isFading ? 'playerMsgBubbleFading' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className="playerMsgRow">
      <PlayerBubble className={bubbleClass}>
        {src && <audio src={src} style={{ display: 'none' }} />}
        <div className="playerAudio">
          <div className="playerAudioRow">
            <button
              className="playerAudioBtn"
              onClick={() => setIsPlaying(p => !p)}
              aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}
            >
              {isPlaying ? <PauseIcon /> : <PlayTriangle />}
            </button>
            <div className="playerAudioWaveCol">
              <div className="playerAudioWave">
                {WAVE.map((h, i) => (
                  <div
                    key={i}
                    className={`playerAudioBar${isPlaying ? ' playerAudioBarPlaying' : ''}`}
                    style={{ '--bar-h': h + 'px', '--delay': (i * 0.07) + 's' }}
                  />
                ))}
              </div>
              <span className="playerAudioDur">00:00</span>
            </div>
          </div>
          {text && (
            <div className="playerAudioTextSection">
              <PlayerTypingText text={text} highlights={highlights} onTypingChange={handleTypingChange} />
            </div>
          )}
        </div>
      </PlayerBubble>
    </div>
  )
}
