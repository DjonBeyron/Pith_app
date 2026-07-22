import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import TableGrid from '../../../../shared/ui/TableGrid.jsx'
import { WAVEFORM_FPS } from '../../../../shared/lib/audioUtils.js'

const HUD_OFFSETS    = [-1, 0, 1]
const HUD_ALPHA_UP   = [0.60, 0.75, 0.50]
const HUD_ALPHA_DOWN = [0.15, 0.28, 0.18]

export default function TableDictatorPanel({ node, file, onDone, onHeightChange }) {
  const tData        = node.typeData?.table ?? {}
  const table        = tData.table         ?? null
  const timeline     = tData.timeline      ?? null
  const waveformData = tData.waveformData  ?? null
  const blobUrl      = file?.blobUrl ?? file?.r2Url ?? null

  const [show,        setShow]       = useState(false)
  const [playing,     setPlaying]    = useState(false)
  const [hudVisible,  setHudVisible] = useState(false)
  const [highlighted, setHighlighted]= useState(new Set())
  const [panelH,      setPanelH]     = useState(0)

  const audioRef      = useRef(null)
  const rafRef        = useRef(null)
  const panelRef      = useRef(null)
  const autoPlayFired = useRef(false)
  const slideDownRef  = useRef(null)
  const barElsRef     = useRef([])
  const barSmoothRef  = useRef([0, 0, 0])

  // Замер высоты панели сразу на маунте (HUD — position:absolute, не влияет на высоту)
  useLayoutEffect(() => {
    const h = panelRef.current?.offsetHeight ?? 0
    setPanelH(h)
    onHeightChange?.(h)
  }, []) // eslint-disable-line

  // Slide-up
  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true))
    return () => cancelAnimationFrame(id)
  }, [])

  slideDownRef.current = slideDown

  // Главный таймер: HUD появляется через 400 мс (таблица уже выехала),
  // аудио — через 800 мс. Cleanup сбрасывает флаг (StrictMode).
  useEffect(() => {
    if (!blobUrl || autoPlayFired.current) return
    autoPlayFired.current = true
    const hudId   = setTimeout(() => setHudVisible(true), 400)
    const audioId = setTimeout(() => audioRef.current?.play().catch(() => {}), 800)
    return () => {
      clearTimeout(hudId)
      clearTimeout(audioId)
      autoPlayFired.current = false
    }
  }, [blobUrl])

  // Фолбэк: если через 3 с аудио не стартовало — закрыть панель
  useEffect(() => {
    const id = setTimeout(() => { if (!autoPlayFired.current) slideDownRef.current?.() }, 3000)
    return () => clearTimeout(id)
  }, []) // eslint-disable-line

  // RAF: подсветка ячеек + спектр HUD
  useEffect(() => {
    if (!playing) { cancelAnimationFrame(rafRef.current); return }
    const tick = () => {
      const t = audioRef.current?.currentTime ?? 0

      const active = new Set()
      for (const layer of timeline?.layers ?? []) {
        if (layer.clips?.some(c => t >= c.start && t < c.end)) active.add(layer.cellId)
      }
      setHighlighted(prev => {
        if (active.size !== prev.size || [...active].some(id => !prev.has(id))) return active
        return prev
      })

      if (waveformData?.length) {
        const fi = Math.floor(t * WAVEFORM_FPS)
        barElsRef.current.forEach((bar, i) => {
          if (!bar) return
          const idx    = Math.max(0, Math.min(waveformData.length - 1, fi + HUD_OFFSETS[i]))
          const target = Math.pow(waveformData[idx] / 255, 0.55)
          const alpha  = target > barSmoothRef.current[i] ? HUD_ALPHA_UP[i] : HUD_ALPHA_DOWN[i]
          barSmoothRef.current[i] = barSmoothRef.current[i] * (1 - alpha) + target * alpha
          bar.style.transform = `scaleY(${Math.max(0.12, barSmoothRef.current[i] * 1.8)})`
        })
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    barSmoothRef.current = [0, 0, 0]
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, timeline, waveformData])

  function slideDown() {
    setShow(false)
    setHighlighted(new Set())
    onHeightChange?.(0)
    setTimeout(() => onDone?.(), 420)
  }

  function handleEnded() {
    setHudVisible(false)   // scale-out сразу после конца аудио
    setPlaying(false)
    setTimeout(slideDown, 500)
  }

  if (!table) return null

  const hudClass = [
    'tdHud',
    !waveformData && 'tdHudPulse',
    hudVisible    && 'tdHudVisible',
  ].filter(Boolean).join(' ')

  return (
    <>
      <div
        className="tdSpacer"
        style={{
          height: show ? panelH : 0,
          transition: show
            ? 'height 0.38s cubic-bezier(0.22, 1, 0.36, 1)'
            : 'height 0.28s cubic-bezier(0.4, 0, 1, 1)',
        }}
      />
      <div ref={panelRef} className={`tdPanel${show ? ' tdPanelVisible' : ''}`}>
        <div className="tdPanelInner">
          {/* tdGridBox — position:relative; HUD плавает выше через bottom: calc(100%+8px) */}
          <div className="tdGridBox">
            <TableGrid
              columns={table.columns}
              rows={table.rows}
              cells={table.cells}
              rowCount={table.rowCount}
              highlightedIds={highlighted}
            />
            <div className={hudClass}>
              {[0, 1, 2].map(i => (
                <div key={i} ref={el => { barElsRef.current[i] = el }} className="tdHudBar" />
              ))}
            </div>
          </div>
          {blobUrl && (
            <audio
              ref={audioRef}
              src={blobUrl}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={handleEnded}
            />
          )}
        </div>
      </div>
    </>
  )
}
