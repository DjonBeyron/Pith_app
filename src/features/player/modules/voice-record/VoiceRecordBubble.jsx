import { useState, useEffect, useRef } from 'react'
import { drawWaveBar, fmtAudioTime } from '../../../../shared/lib/audioUtils.js'

function PlayIcon()  { return <svg width="9"  height="9"  viewBox="0 0 10 10"><polygon points="1,0 10,5 1,10" fill="currentColor" /></svg> }
function PauseIcon() { return <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="0" width="3" height="10" fill="currentColor" rx="1" /><rect x="6" y="0" width="3" height="10" fill="currentColor" rx="1" /></svg> }

export default function VoiceRecordBubble({ url, dur, waveData }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const canvasRef = useRef(null)
  const audioRef  = useRef(null)
  const timeRef   = useRef(null)
  const rafRef    = useRef(null)

  useEffect(() => {
    const tid = setTimeout(() => drawWaveBar(canvasRef.current, waveData, 0), 0)
    return () => clearTimeout(tid)
  }, [waveData])

  useEffect(() => () => {
    if (rafRef.current)   cancelAnimationFrame(rafRef.current)
    if (audioRef.current) audioRef.current.pause()
  }, [])

  function toggle() {
    if (!url) return
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause()
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      setIsPlaying(false); return
    }
    const audio = audioRef.current ?? new Audio(url)
    if (!audioRef.current) audioRef.current = audio
    setIsPlaying(true)

    const onEnded = () => {
      setIsPlaying(false)
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      drawWaveBar(canvasRef.current, waveData, 0)
      if (timeRef.current) timeRef.current.textContent = fmtAudioTime(dur || 0)
    }
    audio.addEventListener('ended', onEnded, { once: true })

    function tick() {
      const ct = audio.currentTime, d = dur || 1
      drawWaveBar(canvasRef.current, waveData, ct / d)
      if (timeRef.current) timeRef.current.textContent = fmtAudioTime(Math.max(0, d - ct))
      rafRef.current = requestAnimationFrame(tick)
    }
    audio.play().catch(() => {})
    rafRef.current = requestAnimationFrame(tick)
  }

  return (
    <div className="playerMsgRow playerMsgRowRight">
      <div className="vrUserBubble">
        <button className={`vrWavePlayBtn${isPlaying ? ' vrWavePlayBtnActive' : ''}`} onClick={toggle}>
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <canvas ref={canvasRef} className="vrWaveCanvas" width={130} height={24} />
        <span ref={timeRef} className="vrWaveTime">{fmtAudioTime(dur || 0)}</span>
      </div>
    </div>
  )
}
