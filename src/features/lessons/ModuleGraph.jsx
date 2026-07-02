import { useState, useEffect, useRef, useCallback } from 'react'
import { useAdmin } from '../../app/AdminContext.jsx'
import XpFlight from './XpFlight.jsx'
import ChainLines from './ChainLines.jsx'
import MgFinalNode from './MgFinalNode.jsx'

// Контур старта — тот же path, что в clip-path (lessons.css). Рисуется SVG-штрихом
// поверх нода: даёт ровную обводку, чего не добиться масштабированием заливки.
const START_PATH = 'M 25.82 32.12 L 64.18 12.88 A 50 50 0 0 1 115.82 12.88 L 154.18 32.12 A 50 50 0 0 1 180 73.86 L 180 106.14 A 50 50 0 0 1 154.18 147.88 L 115.82 167.12 A 50 50 0 0 1 64.18 167.12 L 25.82 147.88 A 50 50 0 0 1 0 106.14 L 0 73.86 A 50 50 0 0 1 25.82 32.12 Z'

const PRIORITY = {
  high:   { label: 'Высокий приоритет', icon: '📈', desc: 'Рекомендуется для развития' },
  medium: { label: 'Средний приоритет', icon: '≡',  desc: 'Полезен для общего развития' },
  low:    { label: 'Низкий приоритет',  icon: '↓',  desc: 'Можно изучить позже' },
}

export default function ModuleGraph({
  lessons,
  completedIds = new Set(),
  justCompleted = null,
  onFlightDone,
  onPlay, onEdit, onDelete, onRename, onTogglePublished,
}) {
  const { isAdmin } = useAdmin()
  const [hovered,  setHovered]  = useState(null)
  const [tapped,   setTapped]   = useState(null)
  const [renaming, setRenaming] = useState(null)
  const [draft,    setDraft]    = useState('')
  const [arcs,     setArcs]     = useState([])
  // Полёт XP из только что пройденного урока к звёздочке финала.
  const [flight,     setFlight]     = useState(null)
  const [delivered,  setDelivered]  = useState(0)
  const [finalFlash, setFinalFlash] = useState(false)
  const flashTimer = useRef(null)

  const scrollRef    = useRef(null)
  const containerRef = useRef(null)
  const startRef     = useRef(null)
  const finalRef     = useRef(null)
  const knobRef      = useRef(null)
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

    // Частичный правый путь: от урока до развилки следующего урока на общем стволе.
    const rightPartial = (x1, y1, stopY) => {
      const mx = Math.max(x1, pBottom.x) + offR
      const r = Math.min(15, Math.abs(pBottom.y - y1) / 2)
      const dir = pBottom.y > y1 ? 1 : -1
      return `M ${x1} ${y1} L ${mx - r} ${y1} Q ${mx} ${y1} ${mx} ${y1 + r * dir} L ${mx} ${stopY}`
    }

    const newArcs = []
    lessonRefs.current.forEach((el, i) => {
      if (!el) return
      const pL = mid(el, 'left')
      const pR = mid(el, 'right')
      // Слева (старт → урок): зелёная линия с точками на концах, без стрелки.
      newArcs.push({
        d: orthPath(pTop.x, pTop.y, pL.x, pL.y, true),
        side: 'left',
        dots: [{ x: pTop.x, y: pTop.y }, { x: pL.x, y: pL.y }],
      })
      // Справа (урок → финал): серая линия со стрелкой + зелёное заполнение
      // до развилки следующего урока (у последнего — до самого финала).
      const fullD  = orthPath(pR.x, pR.y, pBottom.x, pBottom.y, false)
      const nextEl = lessonRefs.current[i + 1]
      const fillD  = nextEl ? rightPartial(pR.x, pR.y, mid(nextEl, 'right').y) : fullD
      newArcs.push({ d: fullD, side: 'right', arrow: true, fillD, lessonIndex: i })
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

  // Сборка полёта XP: маршрут по нарисованным линиям + цель (звёздочка бара).
  useEffect(() => {
    if (!justCompleted || flight || !arcs.length) return
    const idx = lessons.findIndex(l => l.id === justCompleted.id)
    if (idx === -1 || idx === lessons.length - 1 || justCompleted.xp <= 0) {
      onFlightDone?.()
      return
    }
    const rights = arcs.filter(a => a.side === 'right')
    let flightPaths
    if (idx === 0) {
      // Старт: сначала по левой линии к первому уроку, потом по его правой к финалу.
      const left = arcs.find(a => a.side === 'left')
      flightPaths = [left?.d, rights[0]?.d].filter(Boolean)
    } else {
      flightPaths = rights[idx - 1] ? [rights[idx - 1].d] : []
    }
    if (!flightPaths.length) { onFlightDone?.(); return }
    const raf = requestAnimationFrame(() => {
      setDelivered(0)
      setFlight({ paths: flightPaths, amount: justCompleted.xp })
    })
    return () => cancelAnimationFrame(raf)
  }, [justCompleted, arcs]) // eslint-disable-line react-hooks/exhaustive-deps

  // Вспышка финала в такт касанию кружочка (снять класс → кадр → надеть заново,
  // чтобы CSS-анимация перезапускалась на каждом прилёте).
  const flashFinal = useCallback(() => {
    setFinalFlash(false)
    requestAnimationFrame(() => setFinalFlash(true))
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFinalFlash(false), 300)
  }, [])

  // Возврат из урока: подскроллить так, чтобы пройденный урок оказался сверху.
  useEffect(() => {
    if (!justCompleted) return
    const raf = requestAnimationFrame(() => {
      const idx = lessons.findIndex(l => l.id === justCompleted.id)
      const el = idx === 0 ? startRef.current
        : idx === lessons.length - 1 ? finalRef.current
        : lessonRefs.current[idx - 1]
      if (!el || !scrollRef.current || !containerRef.current) return
      const top = el.getBoundingClientRect().top - containerRef.current.getBoundingClientRect().top
      scrollRef.current.scrollTo({ top: Math.max(0, top - 12), behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(raf)
  }, [justCompleted]) // eslint-disable-line react-hooks/exhaustive-deps

  // Актуальное положение звёздочки прогресс-бара — кружочки доводятся точно в неё.
  const getKnobPoint = useCallback(() => {
    if (!knobRef.current || !containerRef.current) return null
    const kr = knobRef.current.getBoundingClientRect()
    const cr = containerRef.current.getBoundingClientRect()
    return { x: kr.left + kr.width / 2 - cr.left, y: kr.top + kr.height / 2 - cr.top }
  }, [])

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
  // Пока XP «летит», недоставленная часть не показана — бар растёт по мере прилёта.
  const inFlight   = justCompleted ? Math.max(0, justCompleted.xp - delivered) : 0
  const earnedShow = Math.max(0, earnedXp - inFlight)
  const finalOpen  = xpUnlock > 0 ? earnedShow >= xpUnlock : allDone
  const xpPct      = xpUnlock > 0 ? Math.min(100, Math.round(earnedShow / xpUnlock * 100)) : (allDone ? 100 : 0)

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
    <div ref={scrollRef} className="moduleGraphScroll" onClick={() => setTapped(null)}>
      <div ref={containerRef} className="moduleGraphInner">

        {/* ── START ── */}
        <div className={`mgGlow ${startDone ? 'mgGlow--start--done' : 'mgGlow--start'}${justCompleted?.id === start.id ? ' mgGlow--justDone' : ''}`}>
          <span className="mgIconBadge mgIconBadge--start">★</span>
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
                  <span className="mgNodeTitle">{start.title}</span>
                  {startDone
                    ? <span className="mgStartBadge">✓ Диагностика пройдена</span>
                    : <span className="mgStartSub">Диагностика</span>
                  }
                  <button
                    className={`mgStartBtn${startDone ? ' mgStartBtn--again' : ''}`}
                    onClick={e => { e.stopPropagation(); onPlay(start.id) }}
                  >
                    {startDone ? 'Пройти снова' : 'Начать'}
                  </button>
                  <Btns l={start} kind="start" />
                </>
              )}
            </div>
          </div>
          <svg className="mgNodeOutline" viewBox="0 0 180 180">
            <defs>
              {/* Обводка как в референсе: яркая сверху, к низу сходит в ноль */}
              <linearGradient id="mgOutlineStart" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0"    stopColor="currentColor" stopOpacity="0.95" />
                <stop offset="0.55" stopColor="currentColor" stopOpacity="0.35" />
                <stop offset="1"    stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={START_PATH} stroke="url(#mgOutlineStart)" />
          </svg>
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
                className={`mgNode mgNode--lesson mgLesson--${pKey}${done ? ' mgNode--lesson--done' : ''}${justCompleted?.id === l.id ? ' mgNode--justDone' : ''}`}
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
        <MgFinalNode
          lesson={final_}
          finalOpen={finalOpen}
          finalFlash={finalFlash}
          xpUnlock={xpUnlock}
          earnedShow={earnedShow}
          xpPct={xpPct}
          renaming={renaming === final_.id}
          renameInput={<RenameInput />}
          btns={<Btns l={final_} kind="final" />}
          nodeRef={finalRef}
          knobRef={knobRef}
          onHover={setHovered}
          onClick={handleClick}
        />

        <ChainLines
          arcs={arcs}
          middle={middle}
          completedIds={completedIds}
          justCompletedId={justCompleted?.id ?? null}
        />

        {flight && (
          <XpFlight
            paths={flight.paths}
            getTarget={getKnobPoint}
            amount={flight.amount}
            onArrive={val => { setDelivered(d => d + val); flashFinal() }}
            onDone={() => { setFlight(null); onFlightDone?.() }}
          />
        )}

      </div>
    </div>
  )
}
