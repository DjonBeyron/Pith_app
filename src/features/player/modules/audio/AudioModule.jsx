import { useState, useEffect, useRef } from 'react'
import PlayerBubble from '../../PlayerBubble.jsx'
import PlayerTypingText from '../../PlayerTypingText.jsx'
import { analyzeWaveform, drawWaveBar, fmtAudioTime, probeAudioDuration } from '../../../../shared/lib/audioUtils.js'

function PlayTriangle() {
  return <svg width="9" height="9" viewBox="0 0 10 10"><polygon points="1,0 10,5 1,10" fill="var(--player-bg,#0e1013)" /></svg>
}
function PauseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <rect x="1" y="0" width="3" height="10" fill="var(--player-bg,#0e1013)" rx="1" />
      <rect x="6" y="0" width="3" height="10" fill="var(--player-bg,#0e1013)" rx="1" />
    </svg>
  )
}

export default function AudioModule({ node, file }) {
  const [objectUrl, setObjectUrl] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isFading,  setIsFading]  = useState(false)
  const [waveData,  setWaveData]  = useState(null)
  const [duration,  setDuration]  = useState(null)

  const audioRef  = useRef(null)
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)
  const timeRef   = useRef(null)

  const text       = node.typeData?.audio?.text       ?? ''
  const highlights = node.typeData?.audio?.highlights ?? []

  useEffect(() => {
    if (!file?.localFile) { setObjectUrl(null); return }
    const url = URL.createObjectURL(file.localFile)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file?.localFile])

  const src = file?.r2Url ?? objectUrl

  useEffect(() => {
    setWaveData(null); setDuration(null)
    if (!src) return
    probeAudioDuration(src).then(d => { if (d) setDuration(d) })
    analyzeWaveform(src).then(wd => setWaveData(wd)).catch(() => {})
  }, [src])

  useEffect(() => { drawWaveBar(canvasRef.current, waveData, 0) }, [waveData])

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (audioRef.current) audioRef.current.pause()
  }, [])

  function toggle() {
    const audio = audioRef.current
    if (!audio) return
    if (!audio.paused) {
      audio.pause()
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      setIsPlaying(false); return
    }
    setIsPlaying(true)
    function tick() {
      const ct = audio.currentTime, d = duration || audio.duration || 1
      drawWaveBar(canvasRef.current, waveData, ct / d)
      if (timeRef.current) timeRef.current.textContent = fmtAudioTime(Math.max(0, d - ct))
      rafRef.current = requestAnimationFrame(tick)
    }
    audio.onended = () => {
      setIsPlaying(false)
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      drawWaveBar(canvasRef.current, waveData, 0)
      if (timeRef.current) timeRef.current.textContent = fmtAudioTime(duration || 0)
    }
    audio.play().catch(() => {})
    rafRef.current = requestAnimationFrame(tick)
  }

  const bubbleClass = [
    'playerMsgBubble', 'playerMsgBubble--audio',
    isFading ? 'playerMsgBubbleFading' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className="playerMsgRow">
      <PlayerBubble className={bubbleClass}>
        {src && <audio ref={audioRef} src={src} preload="metadata" />}
        <div className="playerAudio">
          <div className="playerAudioRow">
            <button className="playerAudioBtn" onClick={toggle} aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}>
              {isPlaying ? <PauseIcon /> : <PlayTriangle />}
            </button>
            <div className="playerAudioWaveCol">
              <canvas ref={canvasRef} className="playerAudioWaveCanvas" width={180} height={26} />
              <span ref={timeRef} className="playerAudioDur">{fmtAudioTime(duration)}</span>
            </div>
          </div>
          {text && (
            <div className="playerAudioTextSection">
              <PlayerTypingText
                text={text} highlights={highlights}
                onTypingChange={active => { if (active) setIsFading(true) }}
              />
            </div>
          )}
        </div>
      </PlayerBubble>
    </div>
  )
}
