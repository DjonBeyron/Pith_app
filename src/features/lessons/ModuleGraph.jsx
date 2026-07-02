import { useState, useEffect, useRef, useCallback } from 'react'
import { useAdmin } from '../../app/AdminContext.jsx'

const PRIORITY = {
  high:   { label: 'Высокий приоритет', icon: '📈', desc: 'Рекомендуется для развития' },
  medium: { label: 'Средний приоритет', icon: '≡',  desc: 'Полезен для общего развития' },
  low:    { label: 'Низкий приоритет',  icon: '↓',  desc: 'Можно изучить позже' },
}

export default function ModuleGraph({
  lessons,
  completedIds = new Set(),
  onPlay, onEdit, onDelete, onRename, onTogglePublished,
}) {
  const { isAdmin } = useAdmin()
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
  const n       = lessons.length
  const start   = lessons[0]
  const final_  = lessons[n - 1]
  const middle  = lessons.slice(1, n - 1)
  lessonRefs.current = []

  const startDone  = completedIds.has(start.id)
  // Порог открытия финала — сумма XP всех уроков модуля (старт + обычные).
  // Прогресс — XP только за пройденные уроки этого модуля.
  const nonFinal   = lessons.slice(0, n - 1)
  const xpUnlock   = nonFinal.reduce((s, l) => s + (l.lessonXp ?? 0), 0)
  const earnedXp   = nonFinal.reduce((s, l) => s + (completedIds.has(l.id) ? (l.lessonXp ?? 0) : 0), 0)
  const allDone    = nonFinal.every(l => completedIds.has(l.id))
  const finalOpen  = xpUnlock > 0 ? earnedXp >= xpUnlock : allDone
  const xpPct      = xpUnlock > 0 ? Math.min(100, Math.round(earnedXp / xpUnlock * 100)) : (allDone ? 100 : 0)

  function startRename(e, id, title) { e.stopPropagation(); setRenaming(id); setDraft(title) }
  function commitRename() { if (renaming && draft.trim()) onRename(renaming, draft.trim()); setRenaming(null) }
  function handleClick(id) {
    if (renaming === id) return
    // У не-админа нет управляющих кнопок — клик по блоку сразу запускает урок.
    if (!isAdmin) { onPlay(id); return }
    if (window.matchMedia('(hover: none)').matches) setTapped(p => p === id ? null : id)
    else onPlay(id)
  }

  const Btns = ({ l, kind }) => {
    const show = hovered === l.id || tapped === l.id
    return (
      <div className={`mgNodeBtns${show ? ' mgNodeBtns--vis' : ''}`}
        onClick={e => e.stopPropagation()}>
        <button className="mgBtn" onClick={() => { onPlay(l.id); setTapped(null) }}>▶</button>
        {/* Управляющие кнопки — только админу. Запуск (▶) доступен всем. */}
        {isAdmin && (
          <>
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
          </>
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

        {/* ── START ── */}
        <div
          ref={startRef}
          className={`mgNode mgNode--start${startDone ? ' mgNode--start--done' : ' mgNode--start--inactive'}`}
          onMouseEnter={() => setHovered(start.id)}
          onMouseLeave={() => setHovered(null)}
          onClick={e => { e.stopPropagation(); handleClick(start.id) }}
        >
          <div className="mgHexFill mgHexFill--start">
            {renaming === start.id ? <RenameInput /> : (
              <>
                <span className="mgStartIcon">⭐</span>
                <span className="mgNodeTitle">{start.title}</span>
                {startDone
                  ? <span className="mgStartBadge">✓ {start.title} пройдено</span>
                  : <button className="mgStartBtn" onClick={e => { e.stopPropagation(); onPlay(start.id) }}>Начать</button>
                }
                <Btns l={start} kind="start" />
              </>
            )}
          </div>
        </div>

        {/* ── LESSONS ── */}
        <div className="mgLessonsGroup">
          {middle.map((l, i) => {
            const done  = completedIds.has(l.id)
            const pKey  = l.priority ?? 'medium'
            const pInfo = PRIORITY[pKey] ?? PRIORITY.medium
            return (
              <div
                key={l.id}
                ref={el => { lessonRefs.current[i] = el }}
                className={`mgNode mgNode--lesson${done ? ' mgNode--lesson--done' : ''}`}
                onMouseEnter={() => setHovered(l.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={e => { e.stopPropagation(); handleClick(l.id) }}
              >
                <div className={`mgLessonNum${done ? ' mgLessonNum--done' : ''}`}>
                  {done ? '✓' : i + 1}
                </div>
                <div className="mgLessonBody">
                  <div className="mgLessonTop">
                    <span className="mgNodeTitle">
                      {renaming === l.id ? <RenameInput /> : l.title}
                    </span>
                    {l.lessonXp > 0 && (
                      <span className="mgLessonXp">+{l.lessonXp} XP</span>
                    )}
                  </div>
                  <span className="mgLessonSub">Пройдите и получите</span>
                  <div className={`mgLessonPriority mgLessonPriority--${pKey}`}>
                    <span className="mgLessonPriorityIcon">{pInfo.icon}</span>
                    <div className="mgLessonPriorityText">
                      <span className="mgLessonPriorityLabel">{pInfo.label}</span>
                      <span className="mgLessonPriorityDesc">{pInfo.desc}</span>
                    </div>
                  </div>
                </div>
                <Btns l={l} kind="lesson" />
              </div>
            )
          })}
        </div>

        {/* ── FINAL ── */}
        <div
          ref={finalRef}
          className={`mgNode mgNode--final${finalOpen ? ' mgNode--final--open' : ''}`}
          onMouseEnter={() => setHovered(final_.id)}
          onMouseLeave={() => setHovered(null)}
          onClick={e => { e.stopPropagation(); handleClick(final_.id) }}
        >
          <div className="mgHexFill mgHexFill--final">
            {renaming === final_.id ? <RenameInput /> : (
              <>
                <span className="mgFinalIcon">{finalOpen ? '🔓' : '🔒'}</span>
                <span className="mgNodeTitle">{final_.title}</span>
                <span className="mgFinalDesc">
                  {finalOpen ? 'Финальный урок открыт!' : 'Завершите все уроки чтобы открыть'}
                </span>
                {xpUnlock > 0 && (
                  <div className="mgFinalXpWrap">
                    <div className="mgFinalXpBar">
                      <div className="mgFinalXpBarFill" style={{ width: xpPct + '%' }} />
                    </div>
                    <span className="mgFinalXpLabel">
                      <span className="mgFinalXpStar">⭐</span>
                      {earnedXp} / {xpUnlock} XP
                    </span>
                  </div>
                )}
                <Btns l={final_} kind="final" />
              </>
            )}
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
