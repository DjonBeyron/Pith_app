import { useState, useEffect, useRef, useCallback } from 'react'
import { useAdmin } from '../../app/AdminContext.jsx'
import XpFlight, { FLIGHT_DELAY_MS } from './XpFlight.jsx'
import ChainLines from './ChainLines.jsx'
import MgFinalNode, { LockIcon } from './MgFinalNode.jsx'
import MgStartNode from './MgStartNode.jsx'
import MgStars from './MgStars.jsx'
import { useChainScroll } from './useChainScroll.js'
import { useChainArcs } from './useChainArcs.js'
import { MgBtns, MgRenameInput } from './MgControls.jsx'

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
  stars = null,      // Map<lessonId, 1..3> — звёзды пройденных обычных уроков (лучший результат)
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

  // Геометрия линий (пути для ChainLines и маршруты полёта XP) — useChainArcs.js
  const arcs = useChainArcs({ containerRef, startRef, finalRef, lessonRefs, lessons })

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

  // «Затишье» блеска: во время скролла и полёта XP анимация блика на паузе и
  // погашена — перерисовки блика не конкурируют со скроллом/кружками (лагало).
  const [calm, setCalm] = useState(false)
  const calmTimer = useRef(null)
  const handleScroll = useCallback(() => {
    setCalm(true) // повторные true React схлопывает без ререндера
    clearTimeout(calmTimer.current)
    calmTimer.current = setTimeout(() => setCalm(false), 180)
  }, [])
  useEffect(() => {
    // Фолбэк-скроллер — окно (см. useChainScroll): слушаем и его
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      clearTimeout(calmTimer.current)
    }
  }, [handleScroll])

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
  // Сброс ref-коллекции карточек перед рендером: сами ref'ы пишутся в
  // ref-коллбэках при коммите — это сбор ссылок, а не чтение в рендере
  // eslint-disable-next-line react-hooks/refs
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

  // Элементы (не компоненты!) — сами MgBtns/MgRenameInput вынесены в
  // MgControls.jsx (react-hooks/static-components)
  const renameInputEl = (
    <MgRenameInput draft={draft} onDraft={setDraft}
      onCommit={commitRename} onCancel={() => setRenaming(null)} />
  )
  const btnsFor = (l, kind) => (
    <MgBtns l={l} kind={kind} isAdmin={isAdmin}
      show={hovered === l.id || tapped === l.id}
      onPlay={onPlay} onEdit={onEdit} onRenameStart={startRename}
      onResetLesson={onResetLesson} onTogglePublished={onTogglePublished}
      onDelete={onDelete} clearTap={() => setTapped(null)} />
  )

  // animHold (попап-легенда открыт): граф спрятан (--held) — попап появляется на
  // ровном тёмном фоне без «моргания» перехода плеер→схема; после закрытия проявляется
  return (
    <div ref={scrollRef}
      className={`moduleGraphScroll${animHold ? ' moduleGraphScroll--held' : ''}${calm || justCompleted ? ' moduleGraphScroll--calm' : ''}`}
      onScroll={handleScroll}
      onClick={() => setTapped(null)}>
      <div ref={containerRef} className="moduleGraphInner">

        {/* ── START ── */}
        <MgStartNode
          lesson={start}
          done={startDoneShown}
          pulse={startJustId && !animHold && startReveal}
          renaming={renaming === start.id}
          renameInput={renameInputEl}
          btns={btnsFor(start, 'start')}
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
            // Звёзды показываются только на пройденном уроке; 0/нет записи
            // (пройден до появления фичи) — остаётся обычная подпись
            const st = done ? (stars?.get(l.id) ?? 0) : 0
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
                      {renaming === l.id ? renameInputEl : l.title}
                    </span>
                    {/* при переименовании бейдж прячется — не наезжает на поле ввода */}
                    {l.lessonXp > 0 && renaming !== l.id && (
                      <span className="mgLessonXp">+{l.lessonXp} XP</span>
                    )}
                  </div>
                  {st > 0
                    ? <MgStars value={st} />
                    : <span className="mgLessonSub">Пройдите и получите</span>}
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
                {btnsFor(l, 'lesson')}
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
          renameInput={renameInputEl}
          btns={btnsFor(final_, 'final')}
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
