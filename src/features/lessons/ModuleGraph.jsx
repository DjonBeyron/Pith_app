import { useState, useEffect, useRef, useCallback } from 'react'

export default function ModuleGraph({ lessons, onPlay, onEdit, onDelete, onRename }) {
  const [hovered,  setHovered]  = useState(null)
  const [tapped,   setTapped]   = useState(null)
  const [renaming, setRenaming] = useState(null)
  const [draft,    setDraft]    = useState('')
  const [arcs,     setArcs]     = useState([])

  const containerRef = useRef(null)
  const startRef     = useRef(null)
  const finalRef     = useRef(null)
  const lessonRefs   = useRef([])

  const drawLines = useCallback(() => {
    const cont = containerRef.current
    if (!cont || !startRef.current || !finalRef.current) return
    const cr = cont.getBoundingClientRect()
    const cw = cr.width

    // Corner-anchored positions: left side attaches to top-left, right to bottom-right
    const pos = (el, side, isLesson = false) => {
      const r = el.getBoundingClientRect()
      const x = r.left - cr.left
      const y = r.top  - cr.top
      if (side === 'left')  return { x,            y: isLesson ? y + 12              : y + r.height / 2 }
      return                       { x: x + r.width, y: isLesson ? y + r.height - 12 : y + r.height / 2 }
    }

    const pTop    = pos(startRef.current, 'left')
    const pBottom = pos(finalRef.current, 'right')

    // Max safe horizontal excursion (5px gap from container edge)
    const spacePerSide      = (cw - 170) / 2
    const maxSafeExcursion  = Math.max(15, spacePerSide - 5)

    // Pass 1: find max dy to compute a single global scale for the whole bundle
    let maxDyL = 0, maxDyR = 0
    const data = []
    lessonRefs.current.forEach(el => {
      if (!el) return
      const pL = pos(el, 'left',  true)
      const pR = pos(el, 'right', true)
      const dyL = Math.abs(pL.y - pTop.y)
      const dyR = Math.abs(pBottom.y - pR.y)
      maxDyL = Math.max(maxDyL, dyL)
      maxDyR = Math.max(maxDyR, dyR)
      data.push({ pL, pR, dyL, dyR })
    })

    const globalScaleL = Math.min(1, maxSafeExcursion / (40 + maxDyL * 0.28))
    const globalScaleR = Math.min(1, maxSafeExcursion / (40 + maxDyR * 0.28))

    // Pass 2: draw with uniform global scale — bundle shape preserved
    const newArcs = []
    data.forEach(({ pL, pR, dyL, dyR }) => {
      const exL  = (40 + dyL * 0.28) * globalScaleL
      const lC1x = pTop.x - exL
      const lC1y = pTop.y + 5 + dyL * 0.05
      const lC2x = pL.x   - exL * 0.75
      const lC2y = pL.y   - 5 - dyL * 0.1

      const exR  = (40 + dyR * 0.28) * globalScaleR
      const rC1x = pR.x      + exR * 0.75
      const rC1y = pR.y      + 5 + dyR * 0.1
      const rC2x = pBottom.x + exR
      const rC2y = pBottom.y - 5 - dyR * 0.05

      newArcs.push(`M ${pTop.x} ${pTop.y} C ${lC1x} ${lC1y} ${lC2x} ${lC2y} ${pL.x} ${pL.y}`)
      newArcs.push(`M ${pR.x} ${pR.y} C ${rC1x} ${rC1y} ${rC2x} ${rC2y} ${pBottom.x} ${pBottom.y}`)
    })
    setArcs(newArcs)
  }, [])

  useEffect(() => {
    const id = requestAnimationFrame(drawLines)
    return () => cancelAnimationFrame(id)
  }, [lessons, drawLines])

  useEffect(() => {
    const ro = new ResizeObserver(() => requestAnimationFrame(drawLines))
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [drawLines])

  if (!lessons.length) return null
  const n      = lessons.length
  const start  = lessons[0]
  const final_ = lessons[n - 1]
  const middle = lessons.slice(1, n - 1)
  lessonRefs.current = []

  function startRename(e, id, title) { e.stopPropagation(); setRenaming(id); setDraft(title) }
  function commitRename() { if (renaming && draft.trim()) onRename(renaming, draft.trim()); setRenaming(null) }
  function handleClick(id) {
    if (renaming === id) return
    if (window.matchMedia('(hover: none)').matches) setTapped(p => p === id ? null : id)
    else onPlay(id)
  }

  const Btns = ({ l, kind }) => {
    const show = hovered === l.id || tapped === l.id
    return (
      <div className={`mgNodeBtns${show ? ' mgNodeBtns--vis' : ''}`}
        onClick={e => e.stopPropagation()}>
        <button className="mgBtn mgBtnPlay" onClick={() => { onPlay(l.id); setTapped(null) }}>▶</button>
        <button className="mgBtn" onClick={() => { onEdit(l.id); setTapped(null) }}>⚙</button>
        <button className="mgBtn" onClick={e => { startRename(e, l.id, l.title); setTapped(null) }}>✎</button>
        {kind === 'lesson' && (
          <button className="mgBtn mgBtnDel" onClick={() => { onDelete(l.id); setTapped(null) }}>✕</button>
        )}
      </div>
    )
  }

  const RenameInput = () => (
    <input className="mgRenameInput" autoFocus value={draft}
      onChange={e => setDraft(e.target.value)} onBlur={commitRename}
      onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null) }}
      onClick={e => e.stopPropagation()} />
  )

  return (
    <div className="moduleGraphScroll" onClick={() => setTapped(null)}>
      <div ref={containerRef} className="moduleGraphInner">

        <div ref={startRef} className="mgNode mgNode--start"
          onMouseEnter={() => setHovered(start.id)} onMouseLeave={() => setHovered(null)}
          onClick={e => { e.stopPropagation(); handleClick(start.id) }}>
          <div className="mgHexFill">
            {renaming === start.id ? <RenameInput /> : <><span className="mgNodeTitle">{start.title}</span><Btns l={start} kind="start" /></>}
          </div>
        </div>

        <div className="mgLessonsGroup">
          {middle.map((l, i) => (
            <div key={l.id} ref={el => { lessonRefs.current[i] = el }}
              className="mgNode mgNode--lesson"
              onMouseEnter={() => setHovered(l.id)} onMouseLeave={() => setHovered(null)}
              onClick={e => { e.stopPropagation(); handleClick(l.id) }}>
              {renaming === l.id ? <RenameInput /> : <><span className="mgNodeTitle">{l.title}</span><Btns l={l} kind="lesson" /></>}
            </div>
          ))}
        </div>

        <div ref={finalRef} className="mgNode mgNode--final"
          onMouseEnter={() => setHovered(final_.id)} onMouseLeave={() => setHovered(null)}
          onClick={e => { e.stopPropagation(); handleClick(final_.id) }}>
          <div className="mgHexFill">
            {renaming === final_.id ? <RenameInput /> : <><span className="mgNodeTitle">{final_.title}</span><Btns l={final_} kind="final" /></>}
          </div>
        </div>

        <svg className="moduleGraphSvg">
          {arcs.map((d, i) => (
            <path key={i} d={d} stroke="#c0c5d4" strokeWidth="1.3" fill="none" opacity="0.65"
              strokeLinecap="round" />
          ))}
        </svg>

      </div>
    </div>
  )
}
