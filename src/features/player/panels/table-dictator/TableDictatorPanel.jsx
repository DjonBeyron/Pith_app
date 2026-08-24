import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import { pLog } from '../../../../shared/lib/debug.js'
import { useTableDictatorRaf } from './useTableDictatorRaf.js'
import { useTableDictatorAutostart } from './useTableDictatorAutostart.js'
import TableDictatorView from './TableDictatorView.jsx'
import { logDictatorConfig, logFileResolution, logAudioError } from './dictatorDebug.js'
import { evaluateDictator } from './dictatorCheck.js'
import { schedulePostAudioCheck } from './dictatorPostAudio.js'
import { computeRevealedCellIds, buildFlashDurations } from '../../../../shared/lib/tableDictatorTiming.js'
import { deriveAnswerTokens } from '../../../../shared/lib/tableCellMatch.js'


function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function TableDictatorPanel({ node, file, onDone, onHeightChange, onSendToChat }) {
  const tData        = node.typeData?.table ?? {}
  const table        = tData.table         ?? null
  const timeline     = tData.timeline      ?? null
  const waveformData = tData.waveformData  ?? null
  const answer       = (tData.answer       ?? '').trim()
  const distractors  = tData.distractors   ?? []
  const cells        = table?.cells        ?? []
  // Локальный файл (урок ещё не синхронизирован — обычное дело при прогоне из
  // канваса) играется прямо из File: без этого аудио таблицы не монтировалось
  // вовсе, и таймлайн стоял на месте — так же, как это давно умеет AudioModule
  const [objectUrl, setObjectUrl] = useState(null)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!file?.localFile) { setObjectUrl(null); return }
    const url = URL.createObjectURL(file.localFile)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file?.localFile])

  const blobUrl = objectUrl ?? file?.blobUrl ?? file?.r2Url ?? tData.r2Url ?? null

  // checkAt = начало клипа проверки (запуск проверки), checkOut = конец клипа (обратная анимация).
  // Клип может стоять ПОСЛЕ конца аудио — тогда события планируются таймерами в handleEnded.
  const checkLayer = useMemo(() => timeline?.layers?.find(l => l.isCheck && l.clips?.length > 0) ?? null, [timeline])
  const checkAt  = checkLayer ? checkLayer.clips[0].start : (timeline?.checkAt ?? null)
  const checkOut = checkLayer ? checkLayer.clips[0].end : null
  const checkDelay = tData.checkDelay ?? 1500

  const tokens = useMemo(() => deriveAnswerTokens(answer, cells), [answer, cells])
  const extraFromAnswer = useMemo(
    () => tokens.filter(t => t.type === 'extra').map(t => t.value),
    [tokens],
  )
  const hasExtras = extraFromAnswer.length > 0

  // Только текст — весь RAF/timeline-код ниже (useTableDictatorRaf,
  // dictatorPostAudio.js, dictatorCheck.js) сопоставляет chips по строкам;
  // id варианта (для особого перехода, nodeVariants.js) резолвится отдельно
  // в check() по distractors.find(d => d.text === ...), не меняя эту форму
  const [shuffledExtras] = useState(() => shuffle([...extraFromAnswer, ...distractors.map(d => d.text)]))
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
  const hasPlayedRef      = useRef(false)
  const slideDownRef      = useRef(null)
  const checkRef          = useRef(null)
  const closeRef          = useRef(null)
  const closeTriggerRef   = useRef(null)    // 'table_correct'/'table_wrong' — итог проверки
  const closeVariantRef   = useRef(null)    // id варианта (особый переход distractor'а), если сработал
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
  // Какие клипы очистки уже сработали — каждый срабатывает один раз за прогон
  const clearedRef           = useRef(new Set())
  const timers               = useRef([])
  // Старт/финиш прогона для режима без озвучки — те же функции, что дергает <audio>
  const endedRef             = useRef(null)
  const startedRef           = useRef(null)

  const extrasAssembledKeys = useMemo(
    () => new Set(extrasAssembled.map(t => t.key)),
    [extrasAssembled],
  )
  // true если в таймлайне есть word-слои — они управляют зелёным выделением чипов по времени
  const hasExtraLayers = useMemo(
    () => !!timeline?.layers?.some(l => l.word),
    [timeline],
  )

  // Сколько мигает выбор: ровно столько, сколько светится слой — и у ячеек
  // таблицы, и у слов вне её (tableDictatorTiming.buildFlashDurations)
  const flashDur = useMemo(
    () => buildFlashDurations(timeline?.layers, shuffledExtras),
    [timeline, shuffledExtras],
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

  // useLayoutEffect (не присваивание прямо в теле рендера) — «всегда
  // свежий» коллбэк для таймеров/RAF без чтения ref во время рендера;
  // без зависимостей — синхронно после КАЖДОГО рендера, как и раньше
  useLayoutEffect(() => {
    slideDownRef.current = slideDown
    checkRef.current     = check
    closeRef.current     = closeModule
    endedRef.current     = handleEnded
    startedRef.current   = startRun
  })

  // Полный лог состояний для отладки (захватывается кнопкой «Скачать лог»)
  useEffect(() => { pLog(`[td-state] playing=${playing} phase=${phase} chips=${chipsVisible} result=${result} asm=${assembled.length} ext=${extrasAssembled.length} activeExt=${activeExtraKeys.size} checkAt=${checkAt} hasExtraL=${hasExtraLayers}`) }, [playing, phase, chipsVisible, result, assembled, extrasAssembled, activeExtraKeys]) // eslint-disable-line

  // Как прогон стартует без тапа (автозапуск/подстраховка часами без звука) — useTableDictatorAutostart.js
  const { runWithClock } = useTableDictatorAutostart({
    audioSrc, timeline, tData, audioRef, hasPlayedRef, endedRef, startedRef, slideDownRef, setHudVisible,
  })

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
    audioRef, rafRef, prevActiveRef, prevExtraRef, addedCellsRef, assembledRef, clearedRef,
    barElsRef, barSmoothRef, rfxPhaseRef, rfxChipsRef, rfxAssembRef, rfxCheckRef, rfxCloseRef, timers,
    extraFromAnswer, shuffledExtras, checkRef, closeRef,
    setAssembled, setExtrasAssembled, setHighlighted, setUsedCells, setActiveExtraKeys, setPhase, setChipsVisible,
    setRevealedIds,
  })

  // Старт прогона: одно и то же для аудио (onPlay) и для часов без озвучки
  function startRun() {
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
    clearedRef.current    = new Set()
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
    closeVariantRef.current   = null
    setHighlighted(new Set()); setUsedCells(new Set())
    setActiveExtraKeys(new Set())
    setRevealedIds(computeRevealedCellIds(timeline?.layers, 0))
  }

  function slideDown(trigger, variantId) {
    pLog(`[td-auto] slideDown trigger=${trigger}`)
    // Галочка «отправить таблицу в чат»: таблица уходит сообщением следом за
    // разбором — с небольшой паузой, чтобы не наехать на уезжающую панель
    if (onSendToChat) timers.current.push(setTimeout(onSendToChat, 600))
    setShow(false)
    setHudVisible(false)   // панель уезжает вниз — спектр сразу схлопывается (scale к 0), не ждёт onEnded
    setHighlighted(new Set())
    onHeightChange?.(0)
    const id = setTimeout(() => onDone?.(trigger ?? 'table_correct', variantId), 420)
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
        timeline, cells, shuffledExtras, extraFromAnswer, checkAt, checkOut, audioRef, timers,
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
    // Особый переход конкретного слова-ловушки (nodeVariants.js) — если в
    // собранном ответе есть распознанный distractor
    closeVariantRef.current = isCorrect
      ? null
      : distractors.find(d => extrasAssembled.some(t => t.value === d.text))?.id ?? null
    setResult(isCorrect ? 'correct' : 'wrong')
    // Легаси (нет out-point у слоя проверки) — закрываем по задержке
    if (checkOut == null) timers.current.push(setTimeout(() => closeModule(), checkDelay))
  }

  // Обратная анимация (out-point слоя проверки): модуль уезжает вниз за экран.
  function closeModule() {
    if (closedRef.current) return
    closedRef.current = true
    pLog(`[td-auto] CLOSE (обратная анимация) trigger=${closeTriggerRef.current}`)
    slideDown(closeTriggerRef.current ?? 'table_correct', closeVariantRef.current)
  }

  if (!table) return null

  return (
    <TableDictatorView
      show={show} panelH={panelH} panelRef={panelRef} barElsRef={barElsRef}
      waveformData={waveformData} hudVisible={hudVisible}
      assembled={assembled} extrasAssembled={extrasAssembled} result={result}
      audioSrc={audioSrc} phase={phase} table={table}
      highlighted={highlighted} usedCells={usedCells} revealedIds={revealedIds}
      flashDur={flashDur} chipsVisible={chipsVisible}
      shuffledExtras={shuffledExtras} chipStyles={chipStyles}
      extrasAssembledKeys={extrasAssembledKeys} activeExtraKeys={activeExtraKeys} hasExtraLayers={hasExtraLayers}
      audioRef={audioRef}
      onPlay={startRun}
      onPause={() => setPlaying(false)}
      onEnded={handleEnded}
      onError={(e) => {
        logAudioError(e.currentTarget.error, e.currentTarget.currentSrc || audioSrc)
        // Файл не открылся — прогон продолжаем по часам, без звука
        runWithClock()
      }}
    />
  )
}
