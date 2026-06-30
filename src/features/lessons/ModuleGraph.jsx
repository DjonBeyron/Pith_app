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
    const cr  = cont.getBoundingClientRect()
    const cw  = cr.width

    const pos = (el, side) => {
      const r = el.getBoundingClientRect()
      const x = r.left - cr.left
      const y = r.top  - cr.top
      return side === 'left'
        ? { x, y: y + r.height / 2 }
        : { x: x + r.width, y: y + r.height / 2 }
    }

    const pTop    = pos(startRef.current, 'left')
    const pBottom = pos(finalRef.current, 'right')

    const newArcs = []
    lessonRefs.current.forEach(el => {
      if (!el) return
      const pL  = pos(el, 'left')
      const pR  = pos(el, 'right')
      const dyL = Math.abs(pL.y - pTop.y)
      const dyR = Math.abs(pBottom.y - pR.y)
      const hfL = Math.min(1, pL.x / 90)
      const hfR = Math.min(1, (cw - pR.x) / 90)

      const lC1x = pTop.x - (74 + dyL * 0.32) * hfL
      const lC1y = pTop.y + 3 + dyL * 0.03
      const lC2x = pL.x   - (3.4 + dyL * 0.36) * hfL
      const lC2y = pL.y   - 1.1 - dyL * 0.22

      const rC1x = pR.x     + (3.4 + dyR * 0.36) * hfR
      const rC1y = pR.y     + 1.1 + dyR * 0.22
      const rC2x = pBottom.x + (74 + dyR * 0.32) * hfR
      const rC2y = pBottom.y - 3 - dyR * 0.03

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
