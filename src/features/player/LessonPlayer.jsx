import { useState, useEffect, useMemo, useRef } from 'react'
import PlayerTopBar from './PlayerTopBar.jsx'
import PlayerFeed from './PlayerFeed.jsx'
import PlayerFeedNodes from './PlayerFeedNodes.jsx'
import WaitingDots from './waiting/WaitingDots.jsx'
import PlayerAdminPanel from './admin/PlayerAdminPanel.jsx'
import NodeEditPencil from './admin/NodeEditPencil.jsx'
import { usePlayerAdminEdit } from './admin/usePlayerAdminEdit.js'
import { usePlayerStepState, buildStep } from './admin/usePlayerStepControl.js'
import { PlayerFrozenContext } from './playerFrozen.js'
import { useMediaPause, pauseAllMedia } from './useMediaPause.js'
import { useSoloMedia } from './useSoloMedia.js'
import PlayerPanels from './PlayerPanels.jsx'
import PinMessageBanner    from './panels/PinMessageBanner.jsx'
import { mainLineIndex, lessonProgress } from '../../shared/lib/lessonProgress.js'
import { useGraphPlayer }  from './useGraphPlayer.js'
import { usePlayerPanelNodes } from './usePlayerPanelNodes.js'
import { usePlayerPreload } from './usePlayerPreload.js'
import { useNodeAppearLog } from './useNodeAppearLog.js'
import { usePlayerFiles } from './usePlayerFiles.js'
import { useAnswerStats } from './useAnswerStats.js'
import { useAdmin } from '../../app/AdminContext.jsx'
import { downloadDebugLog } from './downloadDebugLog.js'
import PlayerOverlays from './PlayerOverlays.jsx'
import HintBar from './HintBar.jsx'
import { useFinalHints } from './useFinalHints.js'
import { useLessonFinish } from './useLessonFinish.js'
import { useLessonResume } from './useLessonResume.js'
import ResumeLessonPopup from './ResumeLessonPopup.jsx'
import { useLessonNav } from '../../app/LessonNavContext.jsx'
import { usePlayerAnswers } from './usePlayerAnswers.js'
import { buildXpMap } from './lessonXp.js'
import { resolveXpOrigin } from './xpAnchor.js'

export default function LessonPlayer({
  nodes = [], files: propFiles = [], lessonTitle = '',
  teacherName, teacherLogo, teacherLogoCrop,
  videoAutoSound = false,
  initialBlobMap = null,
  lessonXp = 0,
  lessonId = null,
  startNodeId = null, // админский прогон с середины: «играть с этой ноды»
  recordStats = true, // false (пересдача «без записи») — события анализа не пишутся
  onFinishStats = null, // супергонка: ({ errors, timeMs }) в момент финиша урока
  finalTicket = null, // Финал модуля: { moduleId } — подсказки + золотой билет
  starsEligible = false, // обычный урок модуля (не Старт/Финал): звёзды по ошибкам
  // Правка урока прямо из плеера — только когда его запустил админ из канваса
  // (CanvasPage передаёт { onUpdateNode, onPickLessonFile, moduleLessons }).
  // В ленте, уроках и гонке проп не передаётся — режима нет вовсе
  edit = null,
  onClose,
  onSummaryClose,
}) {
  // Файлы урока: проп + догруженное с сервера. В режиме правки из канваса
  // список живой — админ может подложить медиа прямо во время прохождения
  const files = usePlayerFiles(nodes, propFiles, !!edit)
  const earnedXpRef = useRef(0)
  // Контейнер плеера — по нему пауза находит всё звучащее (useMediaPause)
  const playerRef = useRef(null)
  // Золотой билет за Финал: счётчик подсказок (раскрытий перевода) и итог
  const { count: hintCount, registerHint, getCount: getHintCount } = useFinalHints(!!finalTicket)
  const [ticketRes, setTicketRes] = useState(null)
  // Звёзды обычного урока: свой счётчик неверных ответов — независим от
  // recordStats (пересдача «без записи» не должна дарить 3★ из-за пустых событий)
  const wrongRef = useRef(0)
  const [starsRes, setStarsRes] = useState(null)
  const { panelShown, record, getEvents } = useAnswerStats({ sourceLessonId: lessonId, enabled: recordStats })
  // Админ проходит сценарий до загрузки медиа: ноды без файла не стопорят
  // цепочку, а отыгрывают заглушку (см. useMissingMediaFallback.js)
  const { isAdmin } = useAdmin()
  // Пошаговое управление (пауза/вперёд/назад) — работает только в режиме
  // правки из канваса, но состояние живёт всегда: пауза по умолчанию снята
  const stepState = usePlayerStepState()

  const xpMap     = useMemo(() => buildXpMap(nodes, lessonXp), [nodes, lessonXp])
  const [earnedXp,  setEarnedXp]  = useState(0)
  const [baseXp,    setBaseXp]    = useState(0)
  const [xpEvents,  setXpEvents]  = useState([])   // [{id, amount, rect}] — triggers float anim
  const [showSummary, setShowSummary] = useState(false)

  // Чекпойнт «Продолжить урок» — работает для любого входа, не только новой
  // ноды-ссылки (useLessonResume.js). Пока идёт проверка сохранённого места
  // или ждём выбор в попапе — граф не запускаем (nodes ниже подменяются на [])
  const resumeState = useLessonResume(lessonId, edit)
  const holdForResume = resumeState.checking || !!resumeState.resumeOffer
  const graphNodes = holdForResume ? [] : nodes

  // Переход по ноде lesson_ref (карточка-ссылка в чате) — пауза этого урока
  // и открытие целевого поверх всего (LessonNavOverlay.jsx)
  const { openRef } = useLessonNav()
  const handleOpenLessonRef = target => openRef(target, lessonId)

  // Конец урока: начисление XP/звёзд/билета, запись анализа — useLessonFinish.js
  const { finishSummary } = useLessonFinish({
    edit, starsEligible, lessonId, wrongRef, finalTicket, getHintCount, getEvents, earnedXpRef,
    setBaseXp, setEarnedXp, setStarsRes, setShowSummary, setTicketRes,
    clearProgress: resumeState.clear,
  })

  // Карта главной линии считается один раз на урок — нужна и для полоски
  // прогресса в шапке, и для процента, который уходит в чекпойнт
  const mainIndex = useMemo(() => mainLineIndex(nodes), [nodes])

  const graph = useGraphPlayer(graphNodes, {
    startNodeId: resumeState.startNodeId ?? startNodeId,
    onCheckpoint: nodeId => resumeState.checkpoint(nodeId, Math.round(lessonProgress(mainIndex, [{ id: nodeId }]) * 100)),
    paused: stepState.paused,
    onFinish: () => {
      if (onFinishStats) {
        // Супергонка: отдаём счёт ошибок/времени и сразу выходим — XP и
        // события анализа отложены до итогов гонки (completeLesson не зовём),
        // обычный экран итогов не показывается (его заменяет RaceSummary)
        onFinishStats({
          errors: getEvents().filter(e => e.type === 'wrong').length,
          // Date.now в коллбэке финиша, а не в рендере — не ложное срабатывание purity-проверки
          timeMs: Date.now() - openTimeRef.current,
        })
        setTimeout(() => (onSummaryClose ?? onClose)?.(), 800)
        return
      }
      finishSummary()
    },
  })
  const { visibleNodes, pendingNode, isWaiting, onNodeDone } = graph
  const progress = lessonProgress(mainIndex, visibleNodes)

  // Откуда полетит «+N XP», решает xpAnchor.js: от пузыря с ответом, если он
  // появится в переписке, иначе от последнего места тапа (его панели пометили
  // через rememberTap). Начисление при этом не ждёт ничего — счётчик в шапке
  // растёт сразу, откладывается только полёт.
  function handleXpEarned(amount, nodeId = null) {
    setEarnedXp(prev => { earnedXpRef.current = prev + amount; return prev + amount })
    resolveXpOrigin(nodeId, origin =>
      setXpEvents(prev => [...prev, { id: Date.now() + Math.random(), amount, rect: origin }]))
  }

  function dismissXpEvent(id) {
    setXpEvents(prev => prev.filter(e => e.id !== id))
  }

  const { blobMap, addMsgTs, debugItems } = usePlayerPreload(nodes, files, visibleNodes, { initialBlobMap })

  // Момент открытия урока: инициализация в эффекте (Date.now в рендере
  // запрещён react-hooks/purity); все потребители читают ref после маунта
  const openTimeRef      = useRef(0)
  useEffect(() => { if (!openTimeRef.current) openTimeRef.current = Date.now() }, [])
  // Журнал появления нод + готовности их медиа — useNodeAppearLog.js
  const nodeAppearLogRef = useNodeAppearLog(visibleNodes, blobMap, addMsgTs, openTimeRef)

  const downloadCombinedLog = () => downloadDebugLog({
    nodeAppearLog: nodeAppearLogRef.current, debugItems, events: getEvents(),
  })

  const filesWithBlobs = useMemo(
    () => files.map(f => {
      const entry = blobMap[f.id]
      if (!entry) return f
      return { ...f, blobUrl: entry.blobUrl, posterUrl: entry.posterUrl ?? null }
    }),
    [files, blobMap]
  )

  // ── Panels ───────────────────────────────────────────────────────────────
  const answers = usePlayerAnswers()
  const {
    photoChoiceStates, setPhotoChoiceStates,
    wordChoiceStates, handleWordAnswer, handleWordPick,
    phraseStates, handlePhraseAnswer,
    regStates, handleRegAnswer,
  } = answers

  function handlePhotoPick(nodeId, idx, isCorrect) {
    const result = isCorrect ? 'photo_correct' : 'photo_wrong'
    if (!isCorrect) wrongRef.current += 1
    const pcNode = nodes.find(n => n.id === nodeId)
    // Особый переход этого конкретного фото (nodeVariants.js), если задан —
    // проверяется раньше общего верно/неверно (useGraphPlayer.onNodeDone)
    const variantId = pcNode?.typeData?.photo_choice?.photos?.[idx]?.id ?? null
    record({
      nodeId,
      lessonId: pcNode?.typeData?.photo_choice?.statLessonId ?? null,
      type: isCorrect ? 'correct' : 'wrong',
      option: `фото #${idx + 1}`,
    })
    setPhotoChoiceStates(prev => ({ ...prev, [nodeId]: { selected: idx, result: isCorrect ? 'correct' : 'wrong' } }))
    if (isCorrect) {
      const xp = xpMap.get(nodeId) ?? 0
      // Плитка галереи, по которой ткнули, уже помечена панелью (rememberTap):
      // галерея сейчас закроется, но замер сделан. Пузырь с фото всё равно
      // появится, и цифра стартует от него — плитка тут запасной вариант
      if (xp > 0) handleXpEarned(xp, nodeId)
    }
    onNodeDone(nodeId, result, variantId)
  }

  const [pinVisible, setPinVisible] = useState(true)
  // Нижние панели ответа: их ноды, высоты и что скипнуть залогиненному
  const panels = usePlayerPanelNodes(visibleNodes, { onNodeDone, panelShown })
  const pmNode = panels.node.pin

  // Правка урока из плеера (только запуск из канваса админом)
  const adminEdit = usePlayerAdminEdit(edit, nodes, visibleNodes)
  // «Мгновенные» ноды зовут onDone в эффекте маунта, но монтируются они в
  // pending-фазе с onDone-заглушкой (DOM сохраняется по key при активации,
  // эффект не перезапускается) — их onNodeDone терялся, и ПОСЛЕДНЕЕ такое
  // сообщение не завершало урок (итоги с XP не показывались). Дублируем
  // onNodeDone при появлении ноды среди видимых; повторные вызовы безопасны
  // (дедуп триггеров и финиша в useGraphPlayer).
  const instantDoneRef = useRef(new Set())
  useEffect(() => {
    visibleNodes.forEach(n => {
      if (!['text', 'pin_message', 'system', 'photo'].includes(n.type)) return
      if (instantDoneRef.current.has(n.id)) return
      instantDoneRef.current.add(n.id)
      onNodeDone(n.id)
    })
  }, [visibleNodes]) // eslint-disable-line react-hooks/exhaustive-deps

  // Шаг назад откатывает и то, что живёт в рефах: отметку «мгновенная нода
  // отыграла» и начисленный за ноду XP
  function rollbackNode(nodeId, wasWrong) {
    instantDoneRef.current.delete(nodeId)
    const xp = xpMap.get(nodeId) ?? 0
    if (xp > 0) earnedXpRef.current = Math.max(0, earnedXpRef.current - xp)
    if (wasWrong) wrongRef.current = Math.max(0, wrongRef.current - 1)
  }
  const { forgetPaused } = useMediaPause(playerRef, stepState.frozen, stepState.paused)
  // В переписке звучит что-то одно: новый звук глушит предыдущий
  useSoloMedia(playerRef)
  // Действия шага собираются в момент нажатия, а не в рендере: они читают
  // рефы (XP, отметки отыгранных нод), а рендеру это знать незачем
  const stepCtx = () => ({
    state: stepState, graph, answers,
    onRollbackNode: rollbackNode, onPhotoPick: handlePhotoPick,
    onCountWrong: () => { wrongRef.current += 1 },
    // Пропуская сообщение, глушим его звук — иначе голос предыдущей ноды
    // накладывается на следующую, а «продолжить» потом воскресило бы её
    onSkipMedia: () => { pauseAllMedia(playerRef.current); forgetPaused() },
    // Откат за финиш урока: экран итогов убираем, дальше идём шагами
    onHideSummary: () => setShowSummary(false),
  })
  const step = buildStep({ state: stepState, graph, ctx: stepCtx })

  // Мобильный дебаг-тулбар (src/features/debugTools) читает тот же самый
  // step, что и десктопная PlayerAdminPanel — просто через мост, а не через
  // проп, ей ведь и на телефоне некуда отрисоваться. Только dev-сборка.
  useEffect(() => {
    if (import.meta.env.DEV) import('../debugTools/debugPlayerStep.js').then(m => m.registerPlayerStep(step))
  }) // без deps: step — новый объект на каждый рендер, актуальные функции нужны сразу
  useEffect(() => {
    return () => {
      if (import.meta.env.DEV) import('../debugTools/debugPlayerStep.js').then(m => m.registerPlayerStep(null))
    }
  }, [])

  return (
    /* На десктопе playerStage/playerPhone превращают плеер в «телефон» по
       центру экрана (styles/player/layout.css). playerPhone с transform —
       containing block для всех fixed внутри: панели, оверлеи, итоги урока
       сами ложатся в рамку. На мобильном обе обёртки display:contents. */
    <PlayerFrozenContext.Provider value={stepState.frozen}>
    <div className="playerStage">
     <div className="playerPhone">
      <div className="lessonPlayer" ref={playerRef}>
        <PlayerTopBar
          progress={progress}
          title={lessonTitle}
          onClose={onClose}
          teacherName={teacherName}
          teacherLogo={teacherLogo}
          teacherLogoCrop={teacherLogoCrop}
          onDownloadLog={downloadCombinedLog}
        />
        {finalTicket && <HintBar count={hintCount} />}
        {pmNode && pinVisible && (
          <PinMessageBanner
            content={pmNode.typeData?.pin_message?.content ?? ''}
            highlights={pmNode.typeData?.pin_message?.highlights ?? []}
            onUnpin={() => setPinVisible(false)}
          />
        )}
        <PlayerFeed panelOpen={panels.offset > 0}>
          <PlayerFeedNodes
            visibleNodes={visibleNodes}
            pendingNode={pendingNode}
            nodes={nodes}
            filesWithBlobs={filesWithBlobs}
            teacherName={teacherName}
            states={{ photoChoiceStates, wordChoiceStates, phraseStates, regStates, tableSent: answers.tableSent, tableArriving: answers.tableArriving }}
            bottomOffset={panels.offset}
            videoAutoSound={videoAutoSound}
            isAdmin={isAdmin}
            onNodeDone={onNodeDone}
            onTrReveal={registerHint}
            onOpenLessonRef={handleOpenLessonRef}
            adminEdit={adminEdit}
          />
          {!holdForResume && visibleNodes.length === 0 && (
            <p className="playerEmpty">Нод нет — добавь ноды в редакторе</p>
          )}
        </PlayerFeed>
        {/* Индикатор «печатает» живёт СНАРУЖИ ленты, хотя рисуется у её нижнего
            края. Причина — растушёвка низа чата (.lessonPlayer::after): она
            перекрывает всё, что внутри ленты, а индикатор должен остаться над
            ней. Изнутри подняться он не может: лента перевёрнута через
            transform и потому образует свой слой целиком. Место в ленте под
            него по-прежнему резервирует --wait-slot — здесь только отрисовка */}
        <WaitingDots visible={isWaiting} />
        <PlayerPanels
          wcNode={panels.node.wc} paNode={panels.node.pa} pcNode={panels.node.pc}
          regNode={panels.node.reg} tableNode={panels.node.table}
          showRegPanel={panels.showRegPanel}
          epoch={step.epoch}
          photoChoiceStates={photoChoiceStates}
          filesWithBlobs={filesWithBlobs}
          xpMap={xpMap}
          onNodeDone={onNodeDone}
          record={record}
          wrongRef={wrongRef}
          handleWordAnswer={handleWordAnswer}
          handleWordPick={handleWordPick}
          handlePhraseAnswer={handlePhraseAnswer}
          handleRegAnswer={handleRegAnswer}
          handlePhotoPick={handlePhotoPick}
          onTableToChat={answers.markTableSent}
          onTableLanded={answers.markTableLanded}
          handleXpEarned={handleXpEarned}
          setWcPanelHeight={panels.setHeight('wc')}
          setPaPanelHeight={panels.setHeight('pa')}
          setPcPanelHeight={panels.setHeight('pc')}
          setRegPanelHeight={panels.setHeight('reg')}
          setTablePanelHeight={panels.setHeight('table')}
        />
        {adminEdit.enabled && panels.editNode && (
          <NodeEditPencil
            variant="panel"
            bottom={panels.offset}
            onClick={() => adminEdit.open(panels.editNode.id)}
            active={adminEdit.editId === panels.editNode.id}
          />
        )}
      </div>

      <PlayerOverlays
        xpEvents={xpEvents}
        onDismissXp={dismissXpEvent}
        showSummary={showSummary}
        earnedXp={earnedXp}
        baseXp={baseXp}
        ticket={ticketRes}
        stars={starsRes}
        onSummaryClose={onSummaryClose ?? onClose}
      />

      {resumeState.resumeOffer && (
        <ResumeLessonPopup
          pct={resumeState.resumeOffer.pct}
          onResume={resumeState.resume}
          onRestart={resumeState.restart}
        />
      )}

     </div>

     {adminEdit.enabled && (
       <PlayerAdminPanel
         node={adminEdit.editNode}
         nodes={nodes}
         currentId={adminEdit.currentId}
         onPick={adminEdit.open}
         onClose={adminEdit.close}
         onUpdate={edit.onUpdateNode}
         lessonFiles={files}
         onPickLessonFile={edit.onPickLessonFile}
         moduleLessons={edit.moduleLessons ?? []}
         step={step}
         onExitToNode={edit.onExitToNode}
       />
     )}
    </div>
    </PlayerFrozenContext.Provider>
  )
}
