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
import { useSignalMessages } from './useSignalMessages.js'
import { usePlayerPanelNodes } from './usePlayerPanelNodes.js'
import { usePlayerPreload } from './usePlayerPreload.js'
import { useLessonWordAudio } from './word-audio/useLessonWordAudio.js'
import { useNodeAppearLog } from './useNodeAppearLog.js'
import { usePlayerFiles, withBlobs } from './usePlayerFiles.js'
import { useInstantNodesDone } from './useInstantNodesDone.js'
import { pickPhoto } from './photoPick.js'
import { useDebugStepBridge } from './admin/useDebugStepBridge.js'
import { useAnswerStats } from './useAnswerStats.js'
import { useAdmin } from '../../app/AdminContext.jsx'
import { downloadDebugLog, copyDebugLog } from './downloadDebugLog.js'
import PlayerOverlays from './PlayerOverlays.jsx'
import HintBar from './HintBar.jsx'
import { useFinalHints } from './useFinalHints.js'
import { useLessonFinish } from './useLessonFinish.js'
import { useLessonTracking } from './useLessonTracking.js'
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
  startNodeId = null, // админский прогон с середины ИЛИ «Продолжить» из LessonLaunchCard.jsx
  historyIds = null, // история чата выше startNodeId — из LessonLaunchCard.jsx (см. ниже)
  resumedXp = 0, // XP, заработанный до закрытия — из LessonLaunchCard.jsx («Продолжить»)
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
  const earnedXpRef = useRef(resumedXp)
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
  const [earnedXp,  setEarnedXp]  = useState(resumedXp)
  const [baseXp,    setBaseXp]    = useState(0)
  const [xpEvents,  setXpEvents]  = useState([])   // [{id, amount, rect}] — triggers float anim
  const [showSummary, setShowSummary] = useState(false)

  // Чекпойнт «Продолжить урок» — резервный путь для входов МИМО карточки
  // запуска (LessonLaunchCard.jsx уже решает это сама и передаёт startNodeId)
  const resumeState = useLessonResume(lessonId, edit, xp => { earnedXpRef.current = xp; setEarnedXp(xp) }, !!startNodeId)
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
    historyIds: resumeState.historyIds ?? historyIds,
    onCheckpoint: (nodeId, vIds) => resumeState.checkpoint(nodeId, Math.round(lessonProgress(mainIndex, [{ id: nodeId }]) * 100), earnedXpRef.current, vIds),
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
  const { visibleNodes, pendingNode, isWaiting, onNodeDone, requestMoreHistory, hasMoreHistory } = graph
  const progress = lessonProgress(mainIndex, visibleNodes)
  useLessonTracking({ lessonId, enabled: !edit, progress, finished: showSummary, resumed: !!startNodeId })
  const signalMessages = useSignalMessages() // сигналы ошибок — вне графа урока (useSignalMessages.js)

  // Откуда полетит «+N XP», решает xpAnchor.js: от пузыря с ответом, если он
  // появится в переписке, иначе от последнего места тапа (его панели пометили
  // через rememberTap). Начисление при этом не ждёт ничего — счётчик в шапке
  // растёт сразу, откладывается только полёт. opts.expectBubble — см. xpAnchor.js
  function handleXpEarned(amount, nodeId = null, opts = undefined) {
    setEarnedXp(prev => { earnedXpRef.current = prev + amount; return prev + amount })
    resolveXpOrigin(nodeId, origin =>
      setXpEvents(prev => [...prev, { id: Date.now() + Math.random(), amount, rect: origin }]), opts)
  }

  function dismissXpEvent(id) {
    setXpEvents(prev => prev.filter(e => e.id !== id))
  }

  const { blobMap, addMsgTs, debugItems, warmupPct } = usePlayerPreload(nodes, files, visibleNodes, { initialBlobMap })
  useLessonWordAudio(nodes, warmupPct) // озвучка слов при тапе — после прогрева первых нод

  // Момент открытия урока: инициализация в эффекте (Date.now в рендере
  // запрещён react-hooks/purity); все потребители читают ref после маунта
  const openTimeRef      = useRef(0)
  useEffect(() => { if (!openTimeRef.current) openTimeRef.current = Date.now() }, [])
  // Журнал появления нод + готовности их медиа — useNodeAppearLog.js
  const nodeAppearLogRef = useNodeAppearLog(visibleNodes, blobMap, addMsgTs, openTimeRef)

  const combinedLogData = () => ({ nodeAppearLog: nodeAppearLogRef.current, debugItems, events: getEvents() })
  const downloadCombinedLog = () => downloadDebugLog(combinedLogData())
  const copyCombinedLog     = () => copyDebugLog(combinedLogData())

  const filesWithBlobs = useMemo(() => withBlobs(files, blobMap), [files, blobMap])

  // ── Panels ───────────────────────────────────────────────────────────────
  const answers = usePlayerAnswers()
  const {
    photoChoiceStates, setPhotoChoiceStates,
    wordChoiceStates, handleWordAnswer, handleWordPick, handleWordReveal,
    phraseStates, handlePhraseAnswer, revealPhraseAnswers,
    regStates, handleRegAnswer,
  } = answers

  // Ответ «выбери фото» — photoPick.js
  const handlePhotoPick = (nodeId, idx, isCorrect) => pickPhoto(
    { nodes, wrongRef, record, setPhotoChoiceStates, xpMap, handleXpEarned, onNodeDone }, nodeId, idx, isCorrect)

  const [pinVisible, setPinVisible] = useState(true)
  // Нижние панели ответа: их ноды, высоты и что скипнуть залогиненному
  const panels = usePlayerPanelNodes(visibleNodes, { onNodeDone, panelShown })
  const pmNode = panels.node.pin

  // Правка урока из плеера (только запуск из канваса админом)
  const adminEdit = usePlayerAdminEdit(edit, nodes, visibleNodes)
  // «Мгновенные» ноды (текст, фото, закреп, системное) — useInstantNodesDone.js
  const instantDoneRef = useInstantNodesDone(visibleNodes, onNodeDone)

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

  // Тот же step — мобильному дебаг-тулбару (только dev) — useDebugStepBridge.js
  useDebugStepBridge(step)

  // Общие пропсы ленты PlayerFeedNodes.jsx (обычные ноды + сигнальные сообщения вперемешку)
  const feedShared = { nodes, filesWithBlobs, teacherName, bottomOffset: panels.offset, videoAutoSound, isAdmin, onTrReveal: registerHint, onOpenLessonRef: handleOpenLessonRef }

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
          onCopyLog={copyCombinedLog}
        />
        {finalTicket && <HintBar count={hintCount} />}
        {pmNode && pinVisible && (
          <PinMessageBanner
            content={pmNode.typeData?.pin_message?.content ?? ''}
            highlights={pmNode.typeData?.pin_message?.highlights ?? []}
            onUnpin={() => setPinVisible(false)}
            manualPanelOpen={panels.manualPanelOpen}
          />
        )}
        <PlayerFeed panelOpen={panels.offset > 0}>
          <PlayerFeedNodes
            visibleNodes={visibleNodes}
            pendingNode={pendingNode}
            hasMoreHistory={hasMoreHistory}
            onLoadMoreHistory={requestMoreHistory}
            {...feedShared}
            states={{ photoChoiceStates, wordChoiceStates, phraseStates, regStates, tableSent: answers.tableSent, tableArriving: answers.tableArriving }}
            onNodeDone={onNodeDone}
            signalItems={signalMessages.items}
            onMessageDone={signalMessages.onMessageDone}
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
          wcNode={panels.node.wc} paNode={panels.node.pa} fbNode={panels.node.fb} pcNode={panels.node.pc}
          regNode={panels.node.reg} tableNode={panels.node.table}
          nodes={nodes}
          showRegPanel={panels.showRegPanel}
          epoch={step.epoch}
          photoChoiceStates={photoChoiceStates}
          filesWithBlobs={filesWithBlobs}
          xpMap={xpMap}
          onNodeDone={onNodeDone}
          // exerciseNodeId — id ноды упражнения (не ноды-сигнала) — сигнал
          // встаёт ПЕРЕД её слотом, см. fireForExercise/useSignalMessages.js
          onSignalFired={(node, release, exerciseNodeId) =>
            signalMessages.fireForExercise(node, release, exerciseNodeId, visibleNodes)}
          hasSignalFired={signalMessages.hasFired}
          record={record}
          wrongRef={wrongRef}
          handleWordAnswer={handleWordAnswer} handleWordPick={handleWordPick} handleWordReveal={handleWordReveal}
          handlePhraseAnswer={handlePhraseAnswer} revealPhraseAnswers={revealPhraseAnswers}
          handleRegAnswer={handleRegAnswer}
          handlePhotoPick={handlePhotoPick}
          onTableToChat={answers.markTableSent}
          onTableLanded={answers.markTableLanded}
          handleXpEarned={handleXpEarned}
          setWcPanelHeight={panels.setHeight('wc')}
          setPaPanelHeight={panels.setHeight('pa')}
          setFbPanelHeight={panels.setHeight('fb')}
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
