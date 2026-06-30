import { useState, useEffect, useRef, useCallback } from 'react'

export default function ModuleGraph({ lessons, onPlay, onEdit, onDelete, onRename, onTogglePublished }) {
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

    const mid = (el, side) => {
      const r = el.getBoundingClientRect()
      const x = r.left - cr.left
      const y = r.top  - cr.top
      return side === 'left'
        ? { x, y: y + r.height / 2 }
        : { x: x + r.width, y: y + r.height / 2 }
    }

    const pTop    = mid(startRef.current, 'left')
    const pBottom = mid(finalRef.current, 'right')

    // Adaptive offset: never exceeds available space on each side
    const cw = cr.width
    const leftSpace  = Math.min(pTop.x,    ...lessonRefs.current.filter(Boolean).map(el => mid(el,'left').x))
    const rightSpace = cw - Math.max(pBottom.x, ...lessonRefs.current.filter(Boolean).map(el => mid(el,'right').x))
    const offL = Math.max(10, Math.min(40, leftSpace  - 6))
    const offR = Math.max(10, Math.min(40, rightSpace - 6))

    const orthPath = (x1, y1, x2, y2, isLeft) => {
      const off = isLeft ? offL : offR
      const r = Math.min(15, Math.abs(y2 - y1) / 2)
      const d = y2 > y1 ? 1 : -1
      if (isLeft) {
        const mx = Math.min(x1, x2) - off
        return `M ${x1} ${y1} L ${mx+r} ${y1} Q ${mx} ${y1} ${mx} ${y1+r*d} L ${mx} ${y2-r*d} Q ${mx} ${y2} ${mx+r} ${y2} L ${x2} ${y2}`
      } else {
        const mx = Math.max(x1, x2) + off
        return `M ${x1} ${y1} L ${mx-r} ${y1} Q ${mx} ${y1} ${mx} ${y1+r*d} L ${mx} ${y2-r*d} Q ${mx} ${y2} ${mx-r} ${y2} L ${x2} ${y2}`
      }
    }

    const newArcs = []
    lessonRefs.current.forEach(el => {
      if (!el) return
      const pL = mid(el, 'left')
      const pR = mid(el, 'right')
      newArcs.push({ d: orthPath(pTop.x, pTop.y, pL.x, pL.y, true),  arrow: true })
      newArcs.push({ d: orthPath(pR.x, pR.y, pBottom.x, pBottom.y, false), arrow: true })
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
        <button className="mgBtn" onClick={() => { onPlay(l.id); setTapped(null) }}>▶</button>
        <button className="mgBtn" onClick={() => { onEdit(l.id); setTapped(null) }}>⚙</button>
        <button className="mgBtn" onClick={e => { startRename(e, l.id, l.title); setTapped(null) }}>✎</button>
        <button className={`mgBtn mgBtnEye${l.published ? ' mgBtnEyeOn' : ''}`}
          title={l.published ? 'Скрыть' : 'Показать'}
          onClick={() => { onTogglePublished(l.id, l.published); setTapped(null) }}>
          {l.published ? '👁' : '🚫'}
        </button>
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
          <defs>
            <marker id="mgArrow" viewBox="0 0 10 10" refX="8" refY="5"
              markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 2 2 L 8 5 L 2 8" fill="none" stroke="#c0c5d4"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          </defs>
          {arcs.map((arc, i) => (
            <path key={i} d={arc.d} stroke="#c0c5d4" strokeWidth="1.5" fill="none"
              opacity="0.7" strokeLinecap="round" markerEnd="url(#mgArrow)" />
          ))}
        </svg>

      </div>
    </div>
  )
}
