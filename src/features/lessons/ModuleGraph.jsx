import { useState, useEffect, useRef, useCallback } from 'react'
import { useAdmin } from '../../app/AdminContext.jsx'
import XpFlight, { FLIGHT_DELAY_MS } from './XpFlight.jsx'
import ChainLines from './ChainLines.jsx'
import MgFinalNode, { LockIcon } from './MgFinalNode.jsx'
import MgStartNode from './MgStartNode.jsx'
import { useChainScroll } from './useChainScroll.js'

// Пауза «явного превращения» старта: столько он виден непройденным (серым)
// после выхода из диагностики/попапа, потом плавно зеленеет.
// Меньше FLIGHT_DELAY_MS/2 (попап-кейс): озеленение стартует до полёта кружков.
const START_REVEAL_MS = 500

const PRIORITY = {
  high:   { label: 'Высокий приоритет', icon: '📈', desc: 'Наиболее важен для вас' },
  medium: { label: 'Средний приоритет', icon: '≡',  desc: 'Полезен для развития' },
  low:    { label: 'Низкий приоритет',  icon: '↓',  desc: 'Можно изучить позже' },
}

export default function ModuleGraph({
  lessons,
  completedIds = new Set(),
  justCompleted = null,
  priorities = null, // Map<lessonId, 'high'|'medium'|'low'> из анализа знаний; null у урока = без полоски
  animHold = false,  // true (попап-легенда открыт) — пульс/полёт XP/озеленение линий ждут закрытия
  animShort = false, // true (попап только что закрыт) — офсет анимации вдвое короче
  onFlightDone,
  onPlay, onEdit, onDelete, onRename, onTogglePublished, onResetLesson,
}) {
  const { isAdmin } = useAdmin()
  const [hovered,  setHovered]  = useState(null)
  const [tapped,   setTapped]   = useState(null)
  const [renaming, setRenaming] = useState(null)
  const [draft,    setDraft]    = useState('')
  const [arcs,     setArcs]     = useState([])
  // Полёт XP из только что пройденного урока к ключу-бегунку финала.
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
      // Точка на выходе из урока — как у левых линий на входе.
      const fullD  = orthPath(pR.x, pR.y, pBottom.x, pBottom.y, false)
      const nextEl = lessonRefs.current[i + 1]
      const fillD  = nextEl ? rightPartial(pR.x, pR.y, mid(nextEl, 'right').y) : fullD
      newArcs.push({
        d: fullD, side: 'right', arrow: true, fillD, lessonIndex: i,
        dots: [{ x: pR.x, y: pR.y }],
      })
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

  // Сборка полёта XP: маршрут по нарисованным линиям + цель (ключ-бегунок бара).
  // animHold: пока открыт попап-легенда, полёт не стартует — эффект перезапустится
  // после закрытия (animHold в deps) и анимация пойдёт с начала.
  useEffect(() => {
    if (!justCompleted || flight || !arcs.length || animHold) return
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
    // Пауза перед полётом: сначала пульс «урок пройден», потом кружки.
    // После попапа-легенды пользователь уже подождал — офсет вдвое короче.
    const t = setTimeout(() => {
      setDelivered(0)
      setFlight({ paths: flightPaths, amount: justCompleted.xp })
    }, animShort ? FLIGHT_DELAY_MS / 2 : FLIGHT_DELAY_MS)
    return () => clearTimeout(t)
  }, [justCompleted, arcs, animHold]) // eslint-disable-line react-hooks/exhaustive-deps

  // Явное превращение старта: пока false — старт (и его линии/точки) в исходном
  // сером виде; через START_REVEAL_MS после снятия паузы попапа стартует
  // озеленение (CSS-transition), пульс и прорисовка линий.
  const [startReveal, setStartReveal] = useState(false)
  const startJustId = !!justCompleted && lessons[0] && justCompleted.id === lessons[0].id
  useEffect(() => {
    if (!startJustId || animHold) {
      const t = setTimeout(() => setStartReveal(false), 0)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setStartReveal(true), START_REVEAL_MS)
    return () => clearTimeout(t)
  }, [startJustId, animHold])

  // Вспышка финала в такт касанию кружочка (снять класс → кадр → надеть заново,
  // чтобы CSS-анимация перезапускалась на каждом прилёте).
  const flashFinal = useCallback(() => {
    setFinalFlash(false)
    requestAnimationFrame(() => setFinalFlash(true))
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFinalFlash(false), 300)
  }, [])

  // Скролл после урока: урок к верху экрана + плавный проезд к финалу (useChainScroll).
  const scrollToFinal = useChainScroll({
    justCompleted, lessons, scrollRef, startRef, finalRef, lessonRefs,
  })

  // Актуальное положение ключа-бегунка прогресс-бара — кружочки доводятся точно в него.
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
  // Только что пройденный старт показывается НЕпройденным, пока попап открыт
  // И ещё START_REVEAL_MS после — потом классы --done вешаются и озеленение
  // проигрывается плавно (transition в CSS)
  const startHold      = startJustId && animHold
  const startDoneShown = startDone && (!startJustId || startReveal)
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
    // Обычный пользователь запускает урок тапом/кликом по карточке (handleClick) —
    // кнопок у него нет вовсе, в том числе ▶.
    if (!isAdmin) return null
    const show = hovered === l.id || tapped === l.id
    return (
      <div className={`mgNodeBtns${show ? ' mgNodeBtns--vis' : ''}`}
        onClick={e => e.stopPropagation()}>
        <button className="mgBtn" onClick={() => { onPlay(l.id); setTapped(null) }}>▶</button>
        <button className="mgBtn" onClick={() => { onEdit(l.id); setTapped(null) }}>⚙</button>
        <button className="mgBtn" onClick={e => { startRename(e, l.id, l.title); setTapped(null) }}>✎</button>
        <button className="mgBtn" title="Сбросить прохождение этого урока (XP отнимется, анализ сохранится)"
          onClick={() => { onResetLesson?.(l.id); setTapped(null) }}>⟲</button>
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

  // animHold (попап-легенда открыт): граф спрятан (--held) — попап появляется на
  // ровном тёмном фоне без «моргания» перехода плеер→схема; после закрытия проявляется
  return (
    <div ref={scrollRef} className={`moduleGraphScroll${animHold ? ' moduleGraphScroll--held' : ''}`}
      onClick={() => setTapped(null)}>
      <div ref={containerRef} className="moduleGraphInner">

        {/* ── START ── */}
        <MgStartNode
          lesson={start}
          done={startDoneShown}
          pulse={startJustId && !animHold && startReveal}
          renaming={renaming === start.id}
          renameInput={<RenameInput />}
          btns={<Btns l={start} kind="start" />}
          nodeRef={startRef}
          onHover={setHovered}
          onClick={handleClick}
          onPlay={onPlay}
        />

        {/* ── LESSONS ── */}
        <div className="mgLessonsGroup">
          {middle.map((l, i) => {
            const done   = completedIds.has(l.id)
            // До диагностики уроки «под замком»: замок вместо номера, без блеска
            const locked = !startDoneShown
            const pKey  = priorities?.get(l.id) ?? null
            const pInfo = pKey ? PRIORITY[pKey] : null
            return (
              <div
                key={l.id}
                ref={el => { lessonRefs.current[i] = el }}
                className={`mgNode mgNode--lesson${pKey ? ` mgLesson--${pKey}` : ''}${done ? ' mgNode--lesson--done' : ''}${locked ? ' mgNode--locked' : ''}${justCompleted?.id === l.id && !animHold ? ' mgNode--justDone' : ''}`}
                onMouseEnter={() => setHovered(l.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={e => { e.stopPropagation(); handleClick(l.id) }}
              >
                {/* Мелкий порядковый номер — в левом верхнем углу карточки */}
                <div className="mgLessonIdx">{i + 1}</div>
                {/* Кружок — только статус: замок (до диагностики), серый ▶
                    (не пройден) или зелёная галочка (пройден) */}
                <div className={`mgLessonNum${done ? ' mgLessonNum--done' : ''}`}>
                  {locked
                    ? <LockIcon size={14} />
                    : done
                    ? '✓'
                    : (
                      <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor">
                        <path d="M8 5 L19 12 L8 19 Z" />
                      </svg>
                    )}
                </div>
                <div className="mgLessonBody">
                  <div className="mgLessonTop">
                    <span className="mgNodeTitle">
                      {renaming === l.id ? <RenameInput /> : l.title}
                    </span>
                    {/* при переименовании бейдж прячется — не наезжает на поле ввода */}
                    {l.lessonXp > 0 && renaming !== l.id && (
                      <span className="mgLessonXp">+{l.lessonXp} XP</span>
                    )}
                  </div>
                  <span className="mgLessonSub">Пройдите и получите</span>
                  {pInfo && (
                    <div className={`mgLessonPriority mgLessonPriority--${pKey}`}>
                      <span className="mgLessonPriorityIcon">{pInfo.icon}</span>
                      <div className="mgLessonPriorityText">
                        <span className="mgLessonPriorityLabel">{pInfo.label}</span>
                        <span className="mgLessonPriorityDesc">{pInfo.desc}</span>
                      </div>
                    </div>
                  )}
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
          shine={startDoneShown && !finalOpen}
          onPlay={onPlay}
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
          startDone={startDone}
          startJustDone={startJustId && !animHold && startReveal}
          startHold={startHold || (startJustId && !startReveal)}
          lineDelayMs={animShort ? FLIGHT_DELAY_MS / 2 : FLIGHT_DELAY_MS}
        />

        {flight && (
          <XpFlight
            paths={flight.paths}
            getTarget={getKnobPoint}
            amount={flight.amount}
            onLaunch={scrollToFinal}
            onArrive={val => setDelivered(d => d + val)}
            onTouch={flashFinal}
            onDone={() => { setFlight(null); onFlightDone?.() }}
          />
        )}

      </div>
    </div>
  )
}
