import { useState, useEffect, useMemo, useRef } from 'react'
import PlayerTopBar from './PlayerTopBar.jsx'
import PlayerFeed from './PlayerFeed.jsx'
import PlayerFeedNodes from './PlayerFeedNodes.jsx'
import PlayerAdminPanel from './admin/PlayerAdminPanel.jsx'
import NodeEditPencil from './admin/NodeEditPencil.jsx'
import { usePlayerAdminEdit } from './admin/usePlayerAdminEdit.js'
import { usePlayerStepState, buildStep } from './admin/usePlayerStepControl.js'
import { PlayerFrozenContext } from './playerFrozen.js'
import { useMediaPause, pauseAllMedia } from './useMediaPause.js'
import PlayerPanels from './PlayerPanels.jsx'
import PinMessageBanner    from './panels/PinMessageBanner.jsx'
import { mainLineIndex, lessonProgress } from '../../shared/lib/lessonProgress.js'
import { useGraphPlayer }  from './useGraphPlayer.js'
import { usePlayerPanelNodes } from './usePlayerPanelNodes.js'
import { usePlayerPreload } from './usePlayerPreload.js'
import { usePlayerFiles } from './usePlayerFiles.js'
import { useAnswerStats } from './useAnswerStats.js'
import { useAdmin } from '../../app/AdminContext.jsx'
import { downloadDebugLog } from './downloadDebugLog.js'
import PlayerOverlays from './PlayerOverlays.jsx'
import HintBar from './HintBar.jsx'
import { useFinalHints } from './useFinalHints.js'
import { useLessonFinish } from './useLessonFinish.js'
import { usePlayerAnswers } from './usePlayerAnswers.js'
import { buildXpMap } from './lessonXp.js'

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

  // Конец урока: начисление XP/звёзд/билета, запись анализа — useLessonFinish.js
  const { finishSummary } = useLessonFinish({
    edit, starsEligible, lessonId, wrongRef, finalTicket, getHintCount, getEvents, earnedXpRef,
    setBaseXp, setEarnedXp, setStarsRes, setShowSummary, setTicketRes,
  })

  const graph = useGraphPlayer(nodes, {
    startNodeId,
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
  const { visibleNodes, pendingNode, onNodeDone } = graph

  // Карта главной линии считается один раз на урок, доля — на каждый показ
  const mainIndex = useMemo(() => mainLineIndex(nodes), [nodes])
  const progress  = lessonProgress(mainIndex, visibleNodes)

  function handleXpEarned(amount, rect) {
    setEarnedXp(prev => { earnedXpRef.current = prev + amount; return prev + amount })
    setXpEvents(prev => [...prev, { id: Date.now() + Math.random(), amount, rect }])
  }

  function dismissXpEvent(id) {
    setXpEvents(prev => prev.filter(e => e.id !== id))
  }

  const { blobMap, addMsgTs, debugItems } = usePlayerPreload(nodes, files, visibleNodes, { initialBlobMap })

  // Момент открытия урока: инициализация в эффекте (Date.now в рендере
  // запрещён react-hooks/purity); все потребители читают ref после маунта
  const openTimeRef      = useRef(0)
  useEffect(() => { if (!openTimeRef.current) openTimeRef.current = Date.now() }, [])
  const prevVisibleRef   = useRef([])
  const nodeAppearLogRef = useRef([])

  useEffect(() => {
    const prevIds = new Set(prevVisibleRef.current.map(n => n.id))
    const newNodes = visibleNodes.filter(n => !prevIds.has(n.id))
    if (newNodes.length) {
      const t = `+${((Date.now() - openTimeRef.current) / 1000).toFixed(1)}`
      newNodes.forEach(n => {
        addMsgTs(n.seq, t)
        const fileId = n.typeData?.[n.type]?.file_id ?? null
        const entry  = fileId ? blobMap[fileId] : null
        nodeAppearLogRef.current.push({
          seq: n.seq, type: n.type, appearTs: t,
          blobReady:   !!entry?.blobUrl,
          blobEvicted: !!entry?.evicted,
          blobError:   !!entry?.error,
          hadBlob:     !!entry,
        })
      })
    }
    prevVisibleRef.current = visibleNodes
  }, [visibleNodes]) // eslint-disable-line react-hooks/exhaustive-deps

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
    pendingPhotoXp, setPendingPhotoXp,
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
      if (xp > 0) setPendingPhotoXp(prev => ({ ...prev, [nodeId]: xp }))
    }
    onNodeDone(nodeId, result, variantId)
  }

  function handlePhotoXpFired(nodeId, rect) {
    const xp = pendingPhotoXp[nodeId]
    if (!xp) return
    setPendingPhotoXp(prev => { const n = { ...prev }; delete n[nodeId]; return n })
    handleXpEarned(xp, rect)
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
            xpMap={xpMap}
            pendingPhotoXp={pendingPhotoXp}
            bottomOffset={panels.offset}
            videoAutoSound={videoAutoSound}
            isAdmin={isAdmin}
            onNodeDone={onNodeDone}
            onTrReveal={registerHint}
            onPhotoXpFired={handlePhotoXpFired}
            adminEdit={adminEdit}
          />
          {visibleNodes.length === 0 && (
            <p className="playerEmpty">Нод нет — добавь ноды в редакторе</p>
          )}
        </PlayerFeed>
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
