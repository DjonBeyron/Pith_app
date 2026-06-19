import { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react'
import PlayerBubble from '../../PlayerBubble.jsx'
import PlayerTypingText from '../../PlayerTypingText.jsx'
import { analyzeWaveform, fmtAudioTime, probeAudioDuration, WAVEFORM_FPS } from '../../../../shared/lib/audioUtils.js'
import { pLog } from '../../../../shared/lib/debug.js'

const WAVE_H_BASE = [7,11,16,22,14,19,24,17,10,20,13,22,18,11,25,21,15,9,18,24,16,12,21,14,19,10,17,23,15,9,13,19,21,14,17,24,11,18,22,15,10,19,13,25,16,9,20,23,12,17]
const BAR_W = 2, BAR_GAP = 2
const ACCENT = '#b6fe3b'
const WHISPER_ADVANCE = 0.08

function PlayTriangle() {
  return <svg width="9" height="9" viewBox="0 0 10 10"><polygon points="1,0 10,5 1,10" fill="#0e1013" /></svg>
}
function PauseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <rect x="1" y="0" width="3" height="10" fill="#0e1013" rx="1" />
      <rect x="6" y="0" width="3" height="10" fill="#0e1013" rx="1" />
    </svg>
  )
}

export default function AudioModule({ node, file, onDone }) {
  const [objectUrl,       setObjectUrl]       = useState(null)
  const [isPlaying,       setIsPlaying]       = useState(false)
  const [isFading,        setIsFading]        = useState(false)
  const [waveData,        setWaveData]        = useState(null)
  const [duration,        setDuration]        = useState(null)
  const [barCount,        setBarCount]        = useState(WAVE_H_BASE.length)
  const [textStarted,     setTextStarted]     = useState(false)
  const [revealedCharIdx, setRevealedCharIdx] = useState(-1)

  const audioRef        = useRef(null)
  const rafRef          = useRef(null)
  const timeRef         = useRef(null)
  const waveRowRef      = useRef(null)
  const barElsRef       = useRef([])
  const barSmoothRef    = useRef(new Array(WAVE_H_BASE.length).fill(0))
  const prevBarCountRef = useRef(WAVE_H_BASE.length)

  const text           = node.typeData?.audio?.text         ?? ''
  const highlights     = node.typeData?.audio?.highlights   ?? []
  const wordTimings    = node.typeData?.audio?.wordTimings  ?? null
  const storedWaveform = node.typeData?.audio?.waveformData ?? null
  const storedDuration = node.typeData?.audio?.duration     ?? null

  const charTimings = useMemo(() => {
    if (!wordTimings?.length || !text) return []
    const userWords = text.trim().split(/\s+/).filter(Boolean)
    const lastT = wordTimings[wordTimings.length - 1]?.t ?? 0
    const out = []
    userWords.forEach((word, wi) => {
      const wt = wordTimings[wi]
      const t = wt?.t ?? lastT + (wi - wordTimings.length + 1) * 0.3
      const nextT = wordTimings[wi + 1]?.t
      const wordDur = nextT != null ? Math.max(0.05, nextT - t) : 0.4
      const wordStart = Math.max(0, t - WHISPER_ADVANCE)
      word.split('').forEach((_, ci) => out.push(wordStart + (ci / word.length) * wordDur))
      if (wi < userWords.length - 1) out.push(wordStart + wordDur)
    })
    return out
  }, [wordTimings, text])

  const waveH = useMemo(() =>
    Array.from({ length: barCount }, (_, i) =>
      WAVE_H_BASE[Math.floor(i / barCount * WAVE_H_BASE.length)]
    ), [barCount])

  useEffect(() => {
    if (!file?.localFile) { setObjectUrl(null); return }
    const url = URL.createObjectURL(file.localFile)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file?.localFile])

  const src = file?.r2Url ?? objectUrl

  useEffect(() => {
    pLog('AudioModule mount/src change — r2Url=', file?.r2Url ?? 'null', 'objectUrl=', objectUrl ?? 'null', 'src=', src ?? 'NULL')
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0 }
    setIsPlaying(false)
    setTextStarted(false)
    setRevealedCharIdx(-1)
    barSmoothRef.current.fill(0)
    setWaveData(storedWaveform?.length ? storedWaveform : null)
    setDuration(storedDuration || null)
    if (!src) { pLog('AudioModule: src is null, skipping load'); return }
    let cancelled = false
    if (!storedWaveform?.length) {
      analyzeWaveform(src).then(wd => { if (!cancelled) setWaveData(wd) }).catch(() => {})
    }
    if (!storedDuration) {
      probeAudioDuration(src).then(d => { if (!cancelled && d && isFinite(d)) setDuration(d) }).catch(() => {})
    }
    return () => { cancelled = true }
  }, [src, storedWaveform, storedDuration])

  // Adaptive bar count — only update when width actually changes to avoid
  // ResizeObserver false-fires (layout changes from text mount / className) resetting state
  useEffect(() => {
    const el = waveRowRef.current
    if (!el) return
    const update = () => {
      const count = Math.max(20, Math.floor(el.offsetWidth / (BAR_W + BAR_GAP)))
      if (count === prevBarCountRef.current) return  // same width → skip reset entirely
      // Width genuinely changed: carry over smooth values proportionally
      const prev = prevBarCountRef.current
      barSmoothRef.current = Array.from({ length: count },
        (_, i) => barSmoothRef.current[Math.floor(i / count * prev)] || 0
      )
      prevBarCountRef.current = count
      barElsRef.current = []
      setBarCount(count)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  function applyFirstFrame(wd) {
    if (!wd?.length) return
    const n = barElsRef.current.length
    const center = (n - 1) / 2
    barElsRef.current.forEach((bar, i) => {
      if (!bar) return
      const offset = Math.round((i - center) * 0.2)
      const idx    = Math.max(0, Math.min(wd.length - 1, offset))
      const amp    = Math.pow(wd[idx] / 255, 0.55)
      barSmoothRef.current[i] = amp
      bar.style.transform = `scaleY(${Math.max(0.1, amp * 1.8)})`
    })
  }

  // Show first frame before first play so there's no visual jump on start
  useLayoutEffect(() => { applyFirstFrame(waveData) }, [waveData, barCount]) // eslint-disable-line

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (audioRef.current) audioRef.current.pause()
  }, [])

  function stopRAF() {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
  }

  function toggle() {
    const audio = audioRef.current
    pLog('AudioModule toggle — audio=', !!audio, 'src=', src ?? 'NULL', 'paused=', audio?.paused ?? 'n/a')
    if (!audio || !src) { pLog('AudioModule toggle: early return (no audio or no src)'); return }

    if (!audio.paused) {
      audio.pause()
      stopRAF()
      setIsPlaying(false)
      return
    }

    const isReplay = audio.ended
    if (isReplay) audio.currentTime = 0

    const d             = duration || audio.duration || 0
    const capturedWave  = waveData
    const capturedChars = charTimings

    setTextStarted(true)
    setRevealedCharIdx(-1)
    // On replay: reset to first frame so EMA starts clean
    // On resume: keep current EMA values — no jump
    if (isReplay) applyFirstFrame(capturedWave)
    barElsRef.current.forEach(bar => {
      if (!bar) return
      bar.style.transition = ''  // remove any lingering fade transition
      bar.style.background = ''
    })

    function tick() {
      const ct        = audio.currentTime
      const total     = d || audio.duration || 1
      const progress  = total > 0 ? ct / total : 0
      const bars      = barElsRef.current
      const greenUpTo = progress * bars.length
      const center    = (bars.length - 1) / 2
      const fi        = capturedWave?.length ? Math.floor(ct * WAVEFORM_FPS) : -1

      bars.forEach((bar, i) => {
        if (!bar) return
        bar.style.background = i < greenUpTo ? ACCENT : ''
        if (fi >= 0) {
          const offset = Math.round((i - center) * 0.2)
          const idx    = Math.max(0, Math.min(capturedWave.length - 1, fi + offset))
          const target = Math.pow(capturedWave[idx] / 255, 0.55)
          const alpha  = target > barSmoothRef.current[i] ? 0.75 : 0.28
          barSmoothRef.current[i] = barSmoothRef.current[i] * (1 - alpha) + target * alpha
          bar.style.transform = `scaleY(${Math.max(0.1, barSmoothRef.current[i] * 1.8)})`
        }
      })

      if (capturedChars.length) {
        let idx = -1
        for (let i = 0; i < capturedChars.length; i++) {
          if (ct >= capturedChars[i]) idx = i; else break
        }
        setRevealedCharIdx(idx)
      }

      if (timeRef.current) timeRef.current.textContent = fmtAudioTime(Math.max(0, total - ct))
      rafRef.current = requestAnimationFrame(tick)
    }

    function onEnded() {
      stopRAF()
      setIsPlaying(false)
      if (capturedChars.length) setRevealedCharIdx(capturedChars.length)
      barElsRef.current.forEach(bar => {
        if (!bar) return
        bar.style.transition = 'background 0.55s ease'
        bar.style.background = ''
      })
      setTimeout(() => {
        barElsRef.current.forEach(bar => { if (bar) bar.style.transition = '' })
      }, 650)
      if (timeRef.current) timeRef.current.textContent = fmtAudioTime(d)
      onDone?.()
    }

    audio.addEventListener('ended', onEnded, { once: true })
    pLog('AudioModule: calling audio.play(), readyState=', audio.readyState, 'networkState=', audio.networkState)
    audio.play().then(() => {
      pLog('AudioModule: play() resolved OK')
      setIsPlaying(true)
      rafRef.current = requestAnimationFrame(tick)
    }).catch(err => {
      pLog('AudioModule: play() ERROR —', err.name, err.message)
      console.warn('[AudioModule] play failed:', err.message)
      audio.removeEventListener('ended', onEnded)
      setIsPlaying(false)
    })
  }

  const bubbleClass = [
    'playerMsgBubble', 'playerMsgBubble--audio',
    isFading ? 'playerMsgBubbleFading' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className="playerMsgRow">
      <PlayerBubble className={bubbleClass}>
        {src && <audio ref={audioRef} src={src} preload="auto" />}
        <div className="playerAudio">
          <div className="playerAudioRow">
            <button
              className="playerAudioBtn"
              onClick={toggle}
              disabled={!src}
              aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}
            >
              {isPlaying ? <PauseIcon /> : <PlayTriangle />}
            </button>
            <div className="playerAudioWaveCol">
              <div ref={waveRowRef} className="playerAudioWaveRow">
                {waveH.map((h, i) => (
                  <div
                    key={i}
                    ref={el => { barElsRef.current[i] = el }}
                    className={[
                      'playerAudioBar',
                      isPlaying && waveData ? 'playerAudioBarLive' : isPlaying ? 'playerAudioBarPlaying' : '',
                    ].filter(Boolean).join(' ')}
                    style={{ '--bar-h': h + 'px', '--delay': `${i * 0.07}s` }}
                  />
                ))}
              </div>
              <span ref={timeRef} className="playerAudioDur">{fmtAudioTime(duration)}</span>
            </div>
          </div>

          {text && textStarted && (
            <div className="playerAudioTextSection">
              <PlayerTypingText
                text={text}
                highlights={highlights}
                revealedCharIdx={charTimings.length ? revealedCharIdx : undefined}
                onTypingChange={active => { if (active) setIsFading(true) }}
              />
            </div>
          )}
        </div>
      </PlayerBubble>
    </div>
  )
}
