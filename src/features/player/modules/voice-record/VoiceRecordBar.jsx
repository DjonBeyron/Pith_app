import { useState, useEffect, useRef } from 'react'
import { analyzeWaveform, drawWaveBar, fmtAudioTime, probeAudioDuration } from '../../../../shared/lib/audioUtils.js'
import { pLog } from '../../../../shared/lib/debug.js'

function PlayIcon()  { return <svg width="9"  height="9"  viewBox="0 0 10 10"><polygon points="1,0 10,5 1,10" fill="currentColor" /></svg> }
function PauseIcon() { return <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="0" width="3" height="10" fill="currentColor" rx="1" /><rect x="6" y="0" width="3" height="10" fill="currentColor" rx="1" /></svg> }

// Probe supported MIME type once at module level (not inside render)
const RECORD_MIME = typeof MediaRecorder !== 'undefined'
  ? (MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
    : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '')
  : ''

export default function VoiceRecordBar({ onSend }) {
  const [phase,     setPhase]     = useState('idle')  // idle | recording | recorded
  const [isPlaying, setIsPlaying] = useState(false)

  const ringsCanvasRef = useRef(null)
  const waveCanvasRef  = useRef(null)
  const timerRef       = useRef(null)
  const timeRef        = useRef(null)
  const phaseRef       = useRef('idle')

  const streamRef   = useRef(null)
  const analyserRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef   = useRef([])
  const recStartRef = useRef(0)
  const rafRef      = useRef(null)
  const playRafRef  = useRef(null)
  const audioRef    = useRef(null)
  const recTimerRef = useRef(null)
  const waveDataRef = useRef(null)
  const recDurRef   = useRef(null)
  const recUrlRef   = useRef(null)
  const sentRef     = useRef(false)

  useEffect(() => { phaseRef.current = phase }, [phase])

  // startRingRaf must be defined before the useEffect that calls it
  function startRingRaf() {
    const canvas = ringsCanvasRef.current
    if (!canvas || !analyserRef.current) return
    const ctx2d = canvas.getContext('2d')
    const freq  = new Uint8Array(analyserRef.current.frequencyBinCount)
    const W = canvas.width, H = canvas.height, CX = W / 2, CY = H / 2

    function avg(arr, from, to) {
      const f = Math.floor(from * arr.length), t = Math.floor(to * arr.length)
      let s = 0; for (let i = f; i < t; i++) s += arr[i]
      return s / Math.max(1, t - f) / 255
    }

    function tick() {
      analyserRef.current.getByteFrequencyData(freq)
      const boost = phaseRef.current === 'recording' ? 2.1 : 1
      const v0 = avg(freq, 0, 0.05) * boost
      const v1 = avg(freq, 0.05, 0.2) * boost
      const v2 = avg(freq, 0.2, 0.5) * boost
      ctx2d.clearRect(0, 0, W, H)
      const maxR = CX - 3
      ;[{ r: 68, v: v2, a: 0.07 }, { r: 54, v: v1, a: 0.11 }, { r: 42, v: v0, a: 0.16 }].forEach(({ r, v, a }) => {
        ctx2d.beginPath()
        ctx2d.arc(CX, CY, Math.min(r * (1 + v * 0.7), maxR), 0, Math.PI * 2)
        ctx2d.fillStyle = `rgba(255,80,100,${Math.min(a + v * 0.32, 0.5)})`
        ctx2d.fill()
      })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  useEffect(() => {
    let audioCtx = null
    pLog('VoiceRecordBar mount — requesting mic. RECORD_MIME:', RECORD_MIME || '(none)')
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then(stream => {
        pLog('mic: getUserMedia OK, tracks:', stream.getAudioTracks().length)
        streamRef.current = stream
        audioCtx = new (window.AudioContext || window.webkitAudioContext)()
        const src      = audioCtx.createMediaStreamSource(stream)
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 256
        src.connect(analyser)
        analyserRef.current = analyser
        startRingRaf()
      })
      .catch(err => {
        pLog('mic: getUserMedia ERROR:', err.name, err.message)
        console.warn('[VoiceRec] mic:', err.message)
      })
    return () => {
      if (rafRef.current)      cancelAnimationFrame(rafRef.current)
      if (playRafRef.current)  cancelAnimationFrame(playRafRef.current)
      if (recTimerRef.current) clearInterval(recTimerRef.current)
      if (streamRef.current)   streamRef.current.getTracks().forEach(t => t.stop())
      if (audioCtx) try { audioCtx.close() } catch { /* ignored */ }
      if (recUrlRef.current && !sentRef.current) URL.revokeObjectURL(recUrlRef.current)
    }
  }, [])

  useEffect(() => {
    if (phase !== 'recorded') return
    const tid = setTimeout(() => drawWaveBar(waveCanvasRef.current, waveDataRef.current, 0), 0)
    return () => clearTimeout(tid)
  }, [phase])

  function handlePressStart(e) {
    e.preventDefault()
    pLog('handlePressStart: phase=', phaseRef.current, 'stream=', !!streamRef.current)
    if (phaseRef.current !== 'idle' || !streamRef.current) return
    const mimeOpts = RECORD_MIME ? { mimeType: RECORD_MIME } : {}
    pLog('MediaRecorder create, mimeOpts:', JSON.stringify(mimeOpts))
    const recorder = new MediaRecorder(streamRef.current, mimeOpts)
    chunksRef.current = []
    recorder.ondataavailable = ev => { if (ev.data.size > 0) chunksRef.current.push(ev.data) }
    recorder.onstop = handleRecordStop
    recorder.start(100)
    recorderRef.current = recorder
    recStartRef.current = Date.now()
    pLog('recording started, recorder.state=', recorder.state)
    setPhase('recording')
    recTimerRef.current = setInterval(() => {
      if (!timerRef.current) return
      const s = Math.floor((Date.now() - recStartRef.current) / 1000)
      timerRef.current.textContent = `⏺ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
    }, 200)
  }

  function handlePressEnd() {
    if (phaseRef.current !== 'recording') return
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    clearInterval(recTimerRef.current)
  }

  async function handleRecordStop() {
    const elapsed  = (Date.now() - recStartRef.current) / 1000
    const chunks   = chunksRef.current
    pLog('handleRecordStop: chunks=', chunks.length, 'elapsed=', elapsed.toFixed(2) + 's')
    const mimeType = chunks[0]?.type || 'audio/webm'
    const blob = new Blob(chunks, { type: mimeType })
    pLog('blob: size=', blob.size, 'type=', blob.type)
    const url  = URL.createObjectURL(blob)
    pLog('objectURL created:', url.slice(0, 40))
    recUrlRef.current = url
    setPhase('recorded')
    try {
      let dur = await probeAudioDuration(url)
      pLog('probeAudioDuration result=', dur, 'elapsed=', elapsed.toFixed(2))
      if (!dur || !isFinite(dur)) dur = elapsed
      recDurRef.current = dur
      if (timeRef.current) timeRef.current.textContent = fmtAudioTime(dur)
      const wd = await analyzeWaveform(url)
      pLog('analyzeWaveform result length=', wd?.length ?? 'null')
      waveDataRef.current = wd
      if (waveCanvasRef.current) drawWaveBar(waveCanvasRef.current, wd, 0)
    } catch (e) {
      pLog('analyze ERROR:', e.message)
      console.warn('[VoiceRec] analyze:', e.message)
    }
  }

  function handlePlayToggle() {
    pLog('handlePlayToggle: url=', !!recUrlRef.current, 'paused=', audioRef.current?.paused ?? 'no-audio')
    if (!recUrlRef.current) return
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause()
      if (playRafRef.current) { cancelAnimationFrame(playRafRef.current); playRafRef.current = null }
      setIsPlaying(false); return
    }
    const isNew = !audioRef.current
    const audio = audioRef.current ?? new Audio(recUrlRef.current)
    if (!audioRef.current) audioRef.current = audio
    pLog('audio.play() attempt, isNew=', isNew, 'src=', audio.src?.slice(0, 40))
    setIsPlaying(true)
    function tick() {
      const ct = audio.currentTime, d = recDurRef.current || 1
      drawWaveBar(waveCanvasRef.current, waveDataRef.current, ct / d)
      if (timeRef.current) timeRef.current.textContent = fmtAudioTime(Math.max(0, d - ct))
      playRafRef.current = requestAnimationFrame(tick)
    }
    audio.addEventListener('ended', () => {
      pLog('audio ended (preview)')
      setIsPlaying(false)
      if (playRafRef.current) { cancelAnimationFrame(playRafRef.current); playRafRef.current = null }
      drawWaveBar(waveCanvasRef.current, waveDataRef.current, 0)
      if (timeRef.current && recDurRef.current) timeRef.current.textContent = fmtAudioTime(recDurRef.current)
    }, { once: true })
    audio.play()
      .then(() => pLog('audio.play() resolved OK'))
      .catch(e => {
        pLog('audio.play() ERROR:', e.name, e.message)
        console.warn('[VoiceRec] play:', e.message)
      })
    playRafRef.current = requestAnimationFrame(tick)
  }

  function handleDelete() {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    if (playRafRef.current) { cancelAnimationFrame(playRafRef.current); playRafRef.current = null }
    if (recUrlRef.current) { URL.revokeObjectURL(recUrlRef.current); recUrlRef.current = null }
    waveDataRef.current = null
    recDurRef.current   = null
    setIsPlaying(false)
    setPhase('idle')
  }

  const isRecorded = phase === 'recorded'

  return (
    <div className="vrWrap">
      <div className="vrTimerRow" style={{ visibility: phase === 'recording' ? 'visible' : 'hidden' }}>
        <span ref={timerRef} className="vrTimerText">⏺ 0:00</span>
      </div>
      <div className="vrListenHint" style={{ visibility: isRecorded ? 'visible' : 'hidden' }}>
        Прослушай перед отправкой
      </div>
      <div className="vrWaveStrip" style={!isRecorded ? { visibility: 'hidden', pointerEvents: 'none' } : undefined}>
        <button className={`vrWavePlayBtn${isPlaying ? ' vrWavePlayBtnActive' : ''}`} onClick={handlePlayToggle}>
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <canvas ref={waveCanvasRef} className="vrWaveCanvas" width={180} height={28} />
        <span ref={timeRef} className="vrWaveTime">0:00</span>
        <button className="vrWaveDelete" onClick={handleDelete} aria-label="Удалить">✕</button>
      </div>
      <div className="vrMicArea">
        <canvas ref={ringsCanvasRef} className="vrRingsCanvas" width={240} height={240} style={{ pointerEvents: 'none' }} />
        <button
          className={`vrMicBtn${phase === 'recording' ? ' vrMicBtnRec' : ''}${isRecorded ? ' vrMicBtnDone' : ''}`}
          onPointerDown={handlePressStart} onPointerUp={handlePressEnd}
          onPointerLeave={handlePressEnd}  onPointerCancel={handlePressEnd}
          style={{ touchAction: 'none' }} aria-label="Записать голос"
        >
          <svg width="26" height="34" viewBox="0 0 26 34" fill="none">
            <rect x="7" y="1" width="12" height="18" rx="6" stroke="white" strokeWidth="2.2" fill="none"/>
            <path d="M2 17C2 23.627 7 29 13 29C19 29 24 23.627 24 17" stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
            <line x1="13" y1="29" x2="13" y2="33" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
            <line x1="7" y1="33" x2="19" y2="33" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
      <div className="vrActions" style={{ visibility: isRecorded ? 'visible' : 'hidden' }}>
        <button className="vrSendBtn" onClick={() => {
          sentRef.current = true
          onSend({ url: recUrlRef.current, dur: recDurRef.current, waveData: waveDataRef.current })
        }}>Отправить</button>
        <button className="vrDeleteBtn" onClick={handleDelete}>Перезаписать</button>
      </div>
      <div className="vrHint">
        {phase === 'recording' ? 'отпустите для остановки' : phase === 'idle' ? 'удерживайте для записи' : ''}
      </div>
    </div>
  )
}
