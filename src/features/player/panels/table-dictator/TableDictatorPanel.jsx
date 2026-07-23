import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import TableGrid from '../../../../shared/ui/TableGrid.jsx'
import { pLog } from '../../../../shared/lib/debug.js'
import { useTableDictatorRaf } from './useTableDictatorRaf.js'
import { logDictatorConfig, logFileResolution, logAudioPlayRejected, logAudioError } from './dictatorDebug.js'
import { evaluateDictator } from './dictatorCheck.js'
import { schedulePostAudioCheck } from './dictatorPostAudio.js'
import { computeRevealedCellIds } from '../../../../shared/lib/tableDictatorTiming.js'

function deriveTokens(answer, cells) {
  const words = (answer ?? '').trim().split(/\s+/).filter(Boolean)
  const usedIds = new Set()
  return words.map(word => {
    const cell = cells.find(
      c => c.value?.trim().toLowerCase() === word.toLowerCase() && !usedIds.has(c.id),
    )
    if (cell) { usedIds.add(cell.id); return { type: 'cell' } }
    return { type: 'extra', value: word }
  })
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function TableDictatorPanel({ node, file, onDone, onHeightChange }) {
  const tData        = node.typeData?.table ?? {}
  const table        = tData.table         ?? null
  const timeline     = tData.timeline      ?? null
  const waveformData = tData.waveformData  ?? null
  const answer       = (tData.answer       ?? '').trim()
  const distractors  = tData.distractors   ?? []
  const cells        = table?.cells        ?? []
  const blobUrl      = file?.blobUrl ?? file?.r2Url ?? null

  // checkAt = начало клипа проверки (запуск проверки), checkOut = конец клипа (обратная анимация).
  // Клип может стоять ПОСЛЕ конца аудио — тогда события планируются таймерами в handleEnded.
  const checkLayer = useMemo(() => timeline?.layers?.find(l => l.isCheck && l.clips?.length > 0) ?? null, [timeline])
  const checkAt  = checkLayer ? checkLayer.clips[0].start : (timeline?.checkAt ?? null)
  const checkOut = checkLayer ? checkLayer.clips[0].end : null
  const checkDelay = tData.checkDelay ?? 1500

  const tokens = useMemo(() => deriveTokens(answer, cells), [answer, cells])
  const extraFromAnswer = useMemo(
    () => tokens.filter(t => t.type === 'extra').map(t => t.value),
    [tokens],
  )
  const hasExtras = extraFromAnswer.length > 0

  const [shuffledExtras] = useState(() => shuffle([...extraFromAnswer, ...distractors]))
  // Стабильные объекты стилей — новый объект каждый рендер перезапускает CSS-анимацию
  const chipStyles = useMemo(
    () => shuffledExtras.map((_, i) => ({ animationDelay: `${i * 50}ms` })),
    [shuffledExtras],
  )

  const [show,            setShow]            = useState(false)
  const [phase,           setPhase]           = useState(null)
  const [chipsVisible,    setChipsVisible]    = useState(false)
  const [playing,         setPlaying]         = useState(false)
  const [hudVisible,      setHudVisible]      = useState(false)
  const [highlighted,     setHighlighted]     = useState(new Set())
  const [usedCells,       setUsedCells]       = useState(new Set())
  const [revealedIds,     setRevealedIds]     = useState(() => computeRevealedCellIds(timeline?.layers, 0))
  const [assembled,       setAssembled]       = useState([])
  const [extrasAssembled, setExtrasAssembled] = useState([])
  const [activeExtraKeys, setActiveExtraKeys] = useState(new Set())
  const [result,          setResult]          = useState(null)
  const [panelH,          setPanelH]          = useState(0)

  const audioRef          = useRef(null)
  const rafRef            = useRef(null)
  const panelRef          = useRef(null)
  const autoPlayFired     = useRef(false)
  const hasPlayedRef      = useRef(false)
  const slideDownRef      = useRef(null)
  const checkRef          = useRef(null)
  const closeRef          = useRef(null)
  const closeTriggerRef   = useRef(null)    // 'table_correct'/'table_wrong' — итог проверки
  // Рефы для RAF-управляемого сценария (checkAt-режим)
  const rfxPhaseRef       = useRef(false)   // таблица уехала
  const rfxChipsRef       = useRef(false)   // чипы появились
  const rfxAssembRef      = useRef(false)   // слова собраны
  const rfxCheckRef       = useRef(false)   // проверка запущена (in-point)
  const rfxCloseRef       = useRef(false)   // закрытие запущено (out-point)
  const closedRef         = useRef(false)   // модуль уже закрывается (защита от дабл-slideDown)
  const barElsRef         = useRef([])
  const barSmoothRef      = useRef([0, 0, 0])
  const addedCellsRef        = useRef(new Set())
  const assembledRef         = useRef([])
  const prevActiveRef        = useRef(new Set())
  const prevExtraRef         = useRef(new Set())
  const timers               = useRef([])

  const extrasAssembledKeys = useMemo(
    () => new Set(extrasAssembled.map(t => t.key)),
    [extrasAssembled],
  )
  // true если в таймлайне есть word-слои — они управляют зелёным выделением чипов по времени
  const hasExtraLayers = useMemo(
    () => !!timeline?.layers?.some(l => l.word),
    [timeline],
  )

  // Дебаг разрешения файла: почему аудио не проигрывается — см. dictatorDebug.js:logFileResolution
  useEffect(() => { logFileResolution(tData.file_id, file, blobUrl) }, [file, blobUrl]) // eslint-disable-line

  // <audio src> фиксируем на первое непустое значение (обычно r2Url — блоб ещё не готов) и
  // больше не меняем: смена src посреди игры рвёт play() (AbortError), никто не перезапускает.
  const [audioSrc, setAudioSrc] = useState(null)
  useEffect(() => { if (audioSrc == null && blobUrl) setAudioSrc(blobUrl) }, [blobUrl]) // eslint-disable-line

  useLayoutEffect(() => {
    const h = panelRef.current?.offsetHeight ?? 0
    pLog(`[td-h] init высота=${h}px`)
    setPanelH(h); onHeightChange?.(h)
  }, []) // eslint-disable-line

  // Перемеряем высоту панели когда появляются слова (бокс растёт)
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const h = panelRef.current?.offsetHeight ?? 0
      // Скачок высоты = «дёргание» интерфейса. Логируем каждое изменение с причиной.
      if (h !== panelH) {
        pLog(`[td-h] высота ${panelH}px → ${h}px (Δ${h - panelH}) asm=${assembled.length} ext=${extrasAssembled.length} chips=${chipsVisible}`)
        setPanelH(h); onHeightChange?.(h)
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [assembled, extrasAssembled, chipsVisible]) // eslint-disable-line

  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  slideDownRef.current = slideDown
  checkRef.current     = check
  closeRef.current     = closeModule

  // Полный лог состояний для отладки (захватывается кнопкой «Скачать лог»)
  useEffect(() => { pLog(`[td-state] playing=${playing} phase=${phase} chips=${chipsVisible} result=${result} asm=${assembled.length} ext=${extrasAssembled.length} activeExt=${activeExtraKeys.size} checkAt=${checkAt} hasExtraL=${hasExtraLayers}`) }, [playing, phase, chipsVisible, result, assembled, extrasAssembled, activeExtraKeys]) // eslint-disable-line

  useEffect(() => {
    if (!audioSrc || autoPlayFired.current) return
    autoPlayFired.current = true
    const hudId   = setTimeout(() => setHudVisible(true), 400)
    const audioId = setTimeout(() => audioRef.current?.play().catch(e => logAudioPlayRejected(e, audioSrc)), 800)
    return () => {
      clearTimeout(hudId); clearTimeout(audioId)
      if (!hasPlayedRef.current) autoPlayFired.current = false
    }
  }, [audioSrc])

  useEffect(() => {
    const id = setTimeout(() => { if (!autoPlayFired.current) slideDownRef.current?.() }, 3000)
    return () => clearTimeout(id)
  }, []) // eslint-disable-line

  // Авто-сборка + авто-проверка для режима «совсем без таймлайна у слов» (легаси).
  // Если у слов ЕСТЬ свои word-слои (hasExtraLayers) — RAF уже собирает их поштучно
  // по своему времени; это было пропущено раньше при checkAt==null и приводило к
  // двойной сборке (эта функция разом переписывала extrasAssembled поверх RAF) —
  // именно это и «дёргало» интерфейс на последнем слове.
  useEffect(() => {
    if (!chipsVisible) return
    if (checkAt != null) return  // RAF управляет сборкой (checkAt-режим)
    if (hasExtraLayers) return   // RAF уже собирает слова поштучно по их word-слоям

    // Ждём окончания анимации чипов, потом собираем слова
    const staggerEnd = shuffledExtras.length * 50 + 350
    pLog(`[td-auto] chipsVisible: staggerEnd=${staggerEnd}ms assembledNow=[${assembledRef.current.join('|')}]`)
    const assembleId = setTimeout(() => {
      pLog(`[td-auto] auto-assemble: assembledRef=[${assembledRef.current.join('|')}] extraFromAnswer=[${extraFromAnswer.join('|')}]`)
      const usedIdx    = new Set()
      const toAssemble = extraFromAnswer.map(word => {
        const idx = shuffledExtras.findIndex((w, i) => w === word && !usedIdx.has(i))
        if (idx === -1) {
          pLog(`[td-auto] WARN: "${word}" не найдено в shuffledExtras=[${shuffledExtras.join('|')}]`)
          return null
        }
        usedIdx.add(idx)
        return { value: word, key: `extra-${idx}` }
      }).filter(Boolean)
      pLog(`[td-auto] toAssemble=[${toAssemble.map(t => t.value).join('|')}]`)
      if (toAssemble.length > 0) setExtrasAssembled(toAssemble)
      const id = setTimeout(() => {
        pLog(`[td-auto] auto-check fired +${checkDelay}ms`)
        checkRef.current?.()
      }, checkDelay)
      timers.current.push(id)
    }, staggerEnd)

    timers.current.push(assembleId)
  }, [chipsVisible]) // eslint-disable-line

  useTableDictatorRaf({
    playing, timeline, waveformData, cells, checkAt, checkOut, hasExtraLayers,
    audioRef, rafRef, prevActiveRef, prevExtraRef, addedCellsRef, assembledRef,
    barElsRef, barSmoothRef, rfxPhaseRef, rfxChipsRef, rfxAssembRef, rfxCheckRef, rfxCloseRef, timers,
    extraFromAnswer, shuffledExtras, checkRef, closeRef,
    setAssembled, setExtrasAssembled, setHighlighted, setUsedCells, setActiveExtraKeys, setPhase, setChipsVisible,
    setRevealedIds,
  })

  function slideDown(trigger) {
    pLog(`[td-auto] slideDown trigger=${trigger}`)
    setShow(false)
    setHudVisible(false)   // панель уезжает вниз — спектр сразу схлопывается (scale к 0), не ждёт onEnded
    setHighlighted(new Set())
    onHeightChange?.(0)
    const id = setTimeout(() => onDone?.(trigger ?? 'table_correct'), 420)
    timers.current.push(id)
  }

  function handleEnded() {
    cancelAnimationFrame(rafRef.current)   // сразу глушим RAF — иначе успеет перезаписать highlight
    setHudVisible(false)
    setPlaying(false)
    prevActiveRef.current = new Set()
    prevExtraRef.current  = new Set()
    setHighlighted(new Set())
    setActiveExtraKeys(new Set())
    const assembled_now = assembledRef.current.join(' ').trim()
    pLog(`[td-auto] ended assembled="${assembled_now}" hasExtras=${hasExtras} checkAt=${checkAt}`)

    // checkAt-режим: клипы (слова/ячейки/проверка) могут стоять ПОСЛЕ конца аудио —
    // дособираем их и планируем проверку (in) + закрытие (out) таймерами от конца аудио.
    if (checkAt != null) {
      schedulePostAudioCheck({
        timeline, cells, shuffledExtras, checkAt, checkOut, audioRef, timers,
        rfxChipsRef, rfxCheckRef, rfxCloseRef, addedCellsRef, assembledRef,
        setPhase, setChipsVisible, setAssembled, setExtrasAssembled,
        setHighlighted, setUsedCells, setActiveExtraKeys, setRevealedIds, checkRef, closeRef,
      })
      return
    }

    if (hasExtras) {
      setPhase('extras')
      pLog(`[td-auto] → phase:extras`)
      const id = setTimeout(() => {
        setChipsVisible(true)
        pLog(`[td-auto] chips visible`)
      }, 450)
      timers.current.push(id)
    } else {
      const trigger = (!answer || assembled_now.toLowerCase() === answer.toLowerCase())
        ? 'table_correct' : 'table_wrong'
      pLog(`[td-auto] no extras → trigger=${trigger}`)
      const id = setTimeout(() => slideDown(trigger), 500)
      timers.current.push(id)
    }
  }

  // Проверка (in-point слоя): только показать результат (зелёный/красный).
  // Закрытие модуля запускает out-point слоя (closeModule) — либо задержка для легаси.
  function check() {
    if (assembled.length === 0 && extrasAssembled.length === 0) {
      pLog(`[td-auto] check SKIPPED — state empty (double-play reset?)`)
      return
    }
    const { isCorrect } = evaluateDictator({ tokens, assembled, extrasAssembled, answer })
    const trigger = isCorrect ? 'table_correct' : 'table_wrong'
    closeTriggerRef.current = trigger
    setResult(isCorrect ? 'correct' : 'wrong')
    // Легаси (нет out-point у слоя проверки) — закрываем по задержке
    if (checkOut == null) timers.current.push(setTimeout(() => closeModule(), checkDelay))
  }

  // Обратная анимация (out-point слоя проверки): модуль уезжает вниз за экран.
  function closeModule() {
    if (closedRef.current) return
    closedRef.current = true
    pLog(`[td-auto] CLOSE (обратная анимация) trigger=${closeTriggerRef.current}`)
    slideDown(closeTriggerRef.current ?? 'table_correct')
  }

  if (!table) return null

  const hudClass = ['tdHud', !waveformData && 'tdHudPulse', hudVisible && 'tdHudVisible']
    .filter(Boolean).join(' ')

  const boxCls = [
    'tdAssemblyBox',
    (assembled.length > 0 || extrasAssembled.length > 0) ? 'tdAssemblyBoxFilled' : '',
    result === 'correct' ? 'tdAssemblyBoxOk'  : '',
    result === 'wrong'   ? 'tdAssemblyBoxErr' : '',
  ].filter(Boolean).join(' ')

  return (
    <>
      <div className="tdSpacer" style={{
        height: show ? panelH : 0,
        transition: show
          ? 'height 0.38s cubic-bezier(0.22, 1, 0.36, 1)'
          : 'height 0.28s cubic-bezier(0.4, 0, 1, 1)',
      }} />
      <div ref={panelRef} className={`tdPanel${show ? ' tdPanelVisible' : ''}`}>
        <div className="tdPanelInner">

          {/* HUD-спектр — САМЫЙ ВЕРХ: над боксом сборки и над таблицей */}
          <div className={hudClass}>
            {[0, 1, 2].map(i => (
              <div key={i} ref={el => { barElsRef.current[i] = el }} className="tdHudBar" />
            ))}
          </div>

          <div className={boxCls}>
            {assembled.length === 0 && extrasAssembled.length === 0
              ? <span className="tdAssemblyPlaceholder">Слушай диктора…</span>
              : <>
                  {assembled.map((w, i) => <span key={`c${i}`} className="tdAssemblyWord">{w}</span>)}
                  {extrasAssembled.map(t => <span key={t.key} className="tdAssemblyWord">{t.value}</span>)}
                </>
            }
          </div>

          <div className="tdStage">
            <div className={`tdTableSection${phase === 'extras' ? ' tdTableSectionSlid' : ''}`}>
              <div className="tdGridBox">
                <TableGrid
                  columns={table.columns}
                  rows={table.rows}
                  cells={table.cells}
                  rowCount={table.rowCount}
                  highlightedIds={highlighted}
                  dimmedIds={usedCells}
                  revealedIds={revealedIds}
                />
              </div>
            </div>

            {chipsVisible && (
              <div className="tdExtrasSection">
                {shuffledExtras.map((word, i) => {
                  const key   = `extra-${i}`
                  const inBox = extrasAssembledKeys.has(key)
                  // В timeline-режиме (checkAt) зелёный держится до OFF слоя (его длины),
                  // а не гаснет сразу при падении в бокс — так же, как подсветка ячеек в таблице.
                  // В авто-режиме (без таймлайна) зелёной фазы нет вообще — сразу done.
                  const green = hasExtraLayers && activeExtraKeys.has(key)
                  const done  = inBox && !green                        // уже в боксе и отсветил → 40%
                  return (
                    <button
                      key={i}
                      style={chipStyles[i]}
                      className={`tdExtraChip${green ? ' tdExtraChipUsed' : ''}${done ? ' tdExtraChipDone' : ''}`}
                    >{word}</button>
                  )
                })}
              </div>
            )}
          </div>

          {audioSrc && (
            <audio
              ref={audioRef}
              src={audioSrc}
              onPlay={() => {
                hasPlayedRef.current = true
                pLog(`[td-auto] onPlay answer="${answer}" cells=${cells.length} extras=${extraFromAnswer.length}`)
                logDictatorConfig({
                  answer, cells, timeline, checkAt, checkDelay, duration: tData.duration,
                  tokens, extraFromAnswer, distractors, shuffledExtras, hasExtraLayers,
                })
                setPlaying(true)
                setAssembled([])
                setExtrasAssembled([])
                setResult(null)
                setPhase(null)
                setChipsVisible(false)
                addedCellsRef.current = new Set()
                assembledRef.current  = []
                prevActiveRef.current = new Set()
                prevExtraRef.current  = new Set()
                rfxPhaseRef.current       = false
                rfxChipsRef.current       = false
                rfxAssembRef.current      = false
                rfxCheckRef.current       = false
                rfxCloseRef.current       = false
                closedRef.current         = false
                closeTriggerRef.current   = null
                setHighlighted(new Set()); setUsedCells(new Set())
                setActiveExtraKeys(new Set())
                setRevealedIds(computeRevealedCellIds(timeline?.layers, 0))
              }}
              onPause={() => setPlaying(false)}
              onEnded={handleEnded}
              onError={(e) => logAudioError(e.currentTarget.error, e.currentTarget.currentSrc || audioSrc)}
            />
          )}
        </div>
      </div>
    </>
  )
}
