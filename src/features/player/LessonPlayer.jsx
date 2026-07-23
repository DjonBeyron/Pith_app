import { useState, useEffect, useMemo, useRef } from 'react'
import { APP_VERSION } from '../../shared/lib/version.js'
import PlayerTopBar from './PlayerTopBar.jsx'
import PlayerFeed from './PlayerFeed.jsx'
import PlayerMessage from './PlayerMessage.jsx'
import ChooseWordPanel      from './panels/choose-word/ChooseWordPanel.jsx'
import PhraseAssemblyPanel from './panels/phrase-assembly/PhraseAssemblyPanel.jsx'
import PinMessageBanner    from './panels/PinMessageBanner.jsx'
import PhotoChoicePanel    from './panels/photo-choice/PhotoChoicePanel.jsx'
import RegistrationPanel   from './panels/registration/RegistrationPanel.jsx'
import TableDictatorPanel  from './panels/table-dictator/TableDictatorPanel.jsx'
import TableManualPanel    from './panels/table-manual/TableManualPanel.jsx'
import { useGraphPlayer }  from './useGraphPlayer.js'
import { useRegistrationSkip } from './useRegistrationSkip.js'
import { usePlayerPreload } from './usePlayerPreload.js'
import { useAnswerStats, wordOptionEvent } from './useAnswerStats.js'
import { getFilesByIds } from '../../shared/lib/filesApi.js'
import { downloadDebugLog } from './downloadDebugLog.js'
import XpFloat from './XpFloat.jsx'
import LessonSummary from './LessonSummary.jsx'
import HintBar from './HintBar.jsx'
import { useFinalHints, HINT_LIMIT } from './useFinalHints.js'
import { awardModuleTicket } from '../../shared/api/ticketApi.js'
import { starsFromErrors, setLocalStars } from '../../shared/lib/lessonStars.js'
import { saveLessonStars } from '../../shared/api/starsApi.js'
import { addLocalXp, getLocalXp } from '../../shared/lib/localProfile.js'
import { completeLesson, getProfile } from '../../shared/api/profileApi.js'
import { refreshProfile } from '../../shared/api/profileCache.js'
import { saveAnswerEvents } from '../../shared/lib/skillStatsStore.js'
import { sendSelfTrigger } from '../../shared/api/pushApi.js'
import { getCurrentLevel } from '../../shared/lib/xpLevels.js'

// Returns a Map<nodeId, xpAmount> for nodes with reward enabled.
// If lessonXp=0 or no reward nodes, returns empty map.
function buildXpMap(nodes, lessonXp) {
  if (!lessonXp) return new Map()
  const REWARD_TYPES = ['word_choice', 'phrase_assembly', 'photo_choice']
  const rewardNodes = nodes.filter(n =>
    REWARD_TYPES.includes(n.type) && n.typeData?.[n.type]?.reward !== false
  )
  if (!rewardNodes.length) return new Map()
  const base      = Math.floor(lessonXp / rewardNodes.length)
  const remainder = lessonXp % rewardNodes.length
  return new Map(rewardNodes.map((n, i) => [n.id, base + (i < remainder ? 1 : 0)]))
}

export default function LessonPlayer({
  nodes = [], files: propFiles = [], lessonTitle = '',
  teacherName, teacherLogo, teacherLogoCrop,
  videoAutoSound = false,
  initialBlobMap = null,
  lessonXp = 0,
  lessonId = null,
  recordStats = true, // false (пересдача «без записи») — события анализа не пишутся
  onFinishStats = null, // супергонка: ({ errors, timeMs }) в момент финиша урока
  finalTicket = null, // Финал модуля: { moduleId } — подсказки + золотой билет
  starsEligible = false, // обычный урок модуля (не Старт/Финал): звёзды по ошибкам
  onClose,
  onSummaryClose,
}) {
  const [files, setFiles] = useState(propFiles)
  const earnedXpRef = useRef(0)
  // Золотой билет за Финал: счётчик подсказок (раскрытий перевода) и итог
  const { count: hintCount, registerHint, getCount: getHintCount } = useFinalHints(!!finalTicket)
  const [ticketRes, setTicketRes] = useState(null)
  // Звёзды обычного урока: свой счётчик неверных ответов — независим от
  // recordStats (пересдача «без записи» не должна дарить 3★ из-за пустых событий)
  const wrongRef = useRef(0)
  const [starsRes, setStarsRes] = useState(null)
  const { panelShown, record, getEvents } = useAnswerStats({ sourceLessonId: lessonId, enabled: recordStats })
  const { visibleNodes, pendingNode, onNodeDone } = useGraphPlayer(nodes, {
    onFinish: () => {
      if (onFinishStats) {
        // Супергонка: отдаём счёт ошибок/времени и сразу выходим — XP и
        // события анализа отложены до итогов гонки (completeLesson не зовём),
        // обычный экран итогов не показывается (его заменяет RaceSummary)
        onFinishStats({
          errors: getEvents().filter(e => e.type === 'wrong').length,
          // Date.now в коллбэке финиша, а не в рендере — ложное срабатывание
          // eslint-disable-next-line react-hooks/purity
          timeMs: Date.now() - openTimeRef.current,
        })
        setTimeout(() => (onSummaryClose ?? onClose)?.(), 800)
        return
      }
      finishSummary()
    },
  })

  function finishSummary() {
    setTimeout(async () => {
      // Звёзды обычного урока: считаются и гостю, и залогиненному; локальный
      // стор обновляется сразу (схема модуля покажет без похода на сервер)
      let stars = null
      if (starsEligible && lessonId) {
        stars = { earned: starsFromErrors(wrongRef.current), best: 0 }
        setLocalStars(lessonId, stars.earned)
      }
      const profile = await getProfile()
      if (profile) {
        // Залогинен: XP начисляет сервер по своей копии урока, один раз за урок.
        // Без lessonId (предпросмотр в редакторе) начисления нет.
        setBaseXp(profile.xp)
        const awarded = lessonId ? await completeLesson(lessonId) : 0
        // События анализа — после completeLesson: он создаёт строку lesson_results
        await saveAnswerEvents(getEvents(), { sourceLessonId: lessonId, isLoggedIn: true })
        // Финал модуля: выдача золотого билета (после completeLesson — сервер
        // проверяет lesson_results). Итог показывается в LessonSummary.
        if (finalTicket?.moduleId) {
          const hints = getHintCount()
          const t = await awardModuleTicket(finalTicket.moduleId, hints)
          if (t) setTicketRes({ ...t, hints })
        }
        // Звёзды на сервер — после completeLesson (он создаёт строку
        // lesson_results); сервер вернёт лучший результат (только вверх)
        if (stars) stars.best = await saveLessonStars(lessonId, stars.earned)
        setEarnedXp(awarded)
        refreshProfile() // фоном обновляем кэш — вкладка «Профиль» откроется уже со свежим XP
        // Пересечение уровня — системное пуш-поздравление самому себе
        // (шаблон level_up в админке; без подписки функция просто ничего не шлёт)
        if (awarded > 0) {
          const lvl = getCurrentLevel(profile.xp + awarded).level
          if (lvl > getCurrentLevel(profile.xp).level) sendSelfTrigger('level_up', { level: lvl })
        }
      } else {
        // Гость: локальный XP как демо (на сервер не влияет).
        const earned = earnedXpRef.current
        setBaseXp(getLocalXp())
        if (earned > 0) addLocalXp(earned)
        saveAnswerEvents(getEvents(), { sourceLessonId: lessonId, isLoggedIn: false })
        setEarnedXp(earned)
      }
      if (stars) setStarsRes(stars)
      setShowSummary(true)
    }, 2000)
  }

  const xpMap     = useMemo(() => buildXpMap(nodes, lessonXp), [nodes, lessonXp])  
  const [earnedXp,  setEarnedXp]  = useState(0)
  const [baseXp,    setBaseXp]    = useState(0)
  const [xpEvents,  setXpEvents]  = useState([])   // [{id, amount, rect}] — triggers float anim
  const [showSummary, setShowSummary] = useState(false)

  function handleXpEarned(amount, rect) {
    setEarnedXp(prev => { earnedXpRef.current = prev + amount; return prev + amount })
    setXpEvents(prev => [...prev, { id: Date.now() + Math.random(), amount, rect }])
  }

  function dismissXpEvent(id) {
    setXpEvents(prev => prev.filter(e => e.id !== id))
  }

  useEffect(() => {
    const singleIds = nodes.map(n => n.typeData?.[n.type]?.file_id).filter(Boolean)
    const photoIds  = nodes
      .filter(n => n.type === 'photo_choice')
      .flatMap(n => (n.typeData?.photo_choice?.photos ?? []).map(p => p.fileId).filter(Boolean))
    const allIds = [...new Set([...singleIds, ...photoIds])]
    const missing = allIds.filter(id => !propFiles.some(f => f.id === id))
    // Ничего не докачивать: files уже = propFiles из useState-инициализатора
    if (!missing.length) return
    getFilesByIds(missing)
      .then(fetched => setFiles([...propFiles, ...fetched]))
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
  const [photoChoiceStates, setPhotoChoiceStates] = useState({})
  const [wordChoiceStates, setWordChoiceStates]   = useState({})
  const [phraseStates, setPhraseStates]           = useState({})
  const [regStates, setRegStates]                 = useState({})

  // XP pending for photo_choice: fires when the correct photo bubble mounts in chat
  const [pendingPhotoXp, setPendingPhotoXp] = useState({})

  function handlePhotoPick(nodeId, idx, isCorrect) {
    const result = isCorrect ? 'photo_correct' : 'photo_wrong'
    if (!isCorrect) wrongRef.current += 1
    const pcNode = nodes.find(n => n.id === nodeId)
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
    onNodeDone(nodeId, result)
  }

  function handlePhotoXpFired(nodeId, rect) {
    const xp = pendingPhotoXp[nodeId]
    if (!xp) return
    setPendingPhotoXp(prev => { const n = { ...prev }; delete n[nodeId]; return n })
    handleXpEarned(xp, rect)
  }

  function handleWordAnswer(nodeId, text, result) {
    setWordChoiceStates(prev => ({ ...prev, [nodeId]: { text, result } }))
  }

  function handlePhraseAnswer(nodeId, text, result) {
    setPhraseStates(prev => {
      const arr = prev[nodeId] ?? []
      if (result === 'wrong' && arr.some(b => b.result === 'wrong')) return prev
      return { ...prev, [nodeId]: [...arr, { text, result }] }
    })
  }

  function handleRegAnswer(nodeId, text, result) {
    setRegStates(prev => ({ ...prev, [nodeId]: [...(prev[nodeId] ?? []), { text, result }] }))
  }

  const [pinVisible, setPinVisible]           = useState(true)
  const [wcPanelHeight, setWcPanelHeight]     = useState(0)
  const [paPanelHeight, setPaPanelHeight]     = useState(0)
  const [pcPanelHeight, setPcPanelHeight]     = useState(0)
  const [regPanelHeight, setRegPanelHeight]   = useState(0)
  const [tablePanelHeight, setTablePanelHeight] = useState(0)

  const lastOf   = (type) => [...visibleNodes].reverse().find(n => n.type === type) ?? null
  const wcNode   = lastOf('word_choice')
  const paNode   = lastOf('phrase_assembly')
  const pmNode   = lastOf('pin_message')
  const pcNode   = lastOf('photo_choice')
  const regNode  = lastOf('registration')
  const tableNode = lastOf('table')

  // Залогинен → рег-нода скипается (сразу reg_submit), панель не рендерится
  const showRegPanel = useRegistrationSkip(regNode, onNodeDone)

  // Таймер ответа стартует с появления панели (SKILL_ANALYSIS.md §4)
  useEffect(() => {
    [wcNode, paNode, pcNode].forEach(n => { if (n) panelShown(n.id) })
  }, [wcNode?.id, paNode?.id, pcNode?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <>
      <div className="lessonPlayer">
        <PlayerTopBar
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
        <PlayerFeed>
          {(() => {
            // Pending node rendered with the same key in the feed so React preserves the
            // DOM element (and its decoded video frame) when it transitions to active.
            const feedNodes = [
              ...visibleNodes,
              ...(pendingNode && !visibleNodes.some(v => v.id === pendingNode.id)
                ? [pendingNode] : []),
            ]
            return feedNodes.map(node => {
              const isPending = pendingNode?.id === node.id && !visibleNodes.some(v => v.id === node.id)
              const fileId = node.typeData?.[node.type]?.file_id ?? null
              const file   = filesWithBlobs.find(f => f.id === fileId) ?? null
              return (
                <div
                  key={node.id}
                  data-pending={isPending ? 'true' : undefined}
                  style={isPending ? {
                    position: 'fixed', bottom: '-100vh', left: 0, width: '100%',
                    pointerEvents: 'none', visibility: 'hidden',
                  } : undefined}
                >
                  <PlayerMessage
                    node={node}
                    file={file}
                    lessonFiles={filesWithBlobs}
                    lessonNodes={nodes}
                    teacherName={teacherName}
                    photoChoiceState={photoChoiceStates[node.id] ?? null}
                    wordChoiceState={wordChoiceStates[node.id] ?? null}
                    allWordChoiceStates={wordChoiceStates}
                    allPhotoChoiceStates={photoChoiceStates}
                    allPhraseStates={phraseStates}
                    phraseState={phraseStates[node.id] ?? null}
                    regState={regStates[node.id] ?? null}
                    bottomOffset={wcPanelHeight || paPanelHeight || pcPanelHeight || regPanelHeight || tablePanelHeight}
                    videoAutoSound={videoAutoSound}
                    onDone={isPending ? () => {} : () => onNodeDone(node.id)}
                    onTrReveal={() => registerHint(node.id)}
                    rewardXp={xpMap.get(node.id) ?? 0}
                    photoXpPending={pendingPhotoXp[node.id] ?? 0}
                    /* коллбэк дергается по событию XP-анимации, не в рендере */
                    /* eslint-disable-next-line react-hooks/refs */
                    onPhotoXpFired={(rect) => handlePhotoXpFired(node.id, rect)}
                  />
                </div>
              )
            })
          })()}
          {visibleNodes.length === 0 && (
            <p className="playerEmpty">Нод нет — добавь ноды в редакторе</p>
          )}
        </PlayerFeed>
        {wcNode && (
          <ChooseWordPanel
            key={wcNode.id} /* вторая нода того же типа подряд = свежая панель */
            node={wcNode}
            xpAmount={xpMap.get(wcNode.id) ?? 0}
            onDone={(result) => { setWcPanelHeight(0); onNodeDone(wcNode.id, result) }}
            onAnswered={(text, result) => handleWordAnswer(wcNode.id, text, result)}
            onPicked={(opt) => {
              const ev = wordOptionEvent(wcNode, opt)
              if (ev.type === 'wrong') wrongRef.current += 1
              record({ nodeId: wcNode.id, ...ev })
            }}
            onXpEarned={handleXpEarned}
            onHeightChange={setWcPanelHeight}
          />
        )}
        {paNode && (
          <PhraseAssemblyPanel
            key={paNode.id}
            node={paNode}
            xpAmount={xpMap.get(paNode.id) ?? 0}
            onDone={(result) => { setPaPanelHeight(0); onNodeDone(paNode.id, result) }}
            onAnswered={(text, result) => handlePhraseAnswer(paNode.id, text, result)}
            onChecked={(result, text) => {
              if (result === 'wrong') wrongRef.current += 1
              record({
                nodeId: paNode.id,
                lessonId: paNode.typeData?.phrase_assembly?.statLessonId ?? null,
                type: result,
                option: text,
              })
            }}
            onXpEarned={handleXpEarned}
            onHeightChange={setPaPanelHeight}
          />
        )}
        {pcNode && !photoChoiceStates[pcNode.id] && (
          <PhotoChoicePanel
            key={pcNode.id}
            node={pcNode}
            lessonFiles={filesWithBlobs}
            onPick={(idx, isCorrect) => handlePhotoPick(pcNode.id, idx, isCorrect)}
            onHeightChange={setPcPanelHeight}
          />
        )}
        {regNode && showRegPanel && (
          <RegistrationPanel
            key={regNode.id}
            node={regNode}
            onDone={(trigger, data) => { setRegPanelHeight(0); onNodeDone(regNode.id, trigger, data) }}
            onAnswered={(text, result) => handleRegAnswer(regNode.id, text, result)}
            onHeightChange={setRegPanelHeight}
          />
        )}
        {tableNode && tableNode.typeData?.table?.table && (
          tableNode.typeData.table.mode === 'manual' ? (
            <TableManualPanel
              key={tableNode.id}
              node={tableNode}
              onDone={trigger => { setTablePanelHeight(0); onNodeDone(tableNode.id, trigger) }}
              onAnswered={() => {}}
              onHeightChange={setTablePanelHeight}
            />
          ) : (
            <TableDictatorPanel
              key={tableNode.id}
              node={tableNode}
              file={filesWithBlobs.find(f => f.id === tableNode.typeData?.table?.file_id) ?? null}
              onDone={trigger => { setTablePanelHeight(0); onNodeDone(tableNode.id, trigger) }}
              onHeightChange={setTablePanelHeight}
            />
          )
        )}
      </div>

      <XpFloat events={xpEvents} onDismiss={dismissXpEvent} />

      {showSummary && (
        <LessonSummary
          earnedXp={earnedXp}
          baseXp={baseXp}
          ticket={ticketRes}
          hintLimit={HINT_LIMIT}
          stars={starsRes}
          onClose={onSummaryClose ?? onClose}
        />
      )}

      {/* Версия для отслеживания деплоя */}
      <div style={{
        position: 'fixed', top: 4, left: '50%', transform: 'translateX(-50%)',
        fontSize: 9, color: 'rgba(255,255,255,0.2)', pointerEvents: 'none',
        zIndex: 9999, userSelect: 'none', whiteSpace: 'nowrap',
      }}>{APP_VERSION}: {(() => { const d = new Date(__BUILD_TIME__); return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}.${String(d.getMinutes()).padStart(2,'0')}` })()}</div>

    </>
  )
}
