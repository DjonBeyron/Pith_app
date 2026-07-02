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
import { useGraphPlayer }  from './useGraphPlayer.js'
import { usePlayerPreload } from './usePlayerPreload.js'
import { getFilesByIds } from '../../shared/lib/filesApi.js'
import { getPlayerLines } from '../../shared/lib/debug.js'
import XpFloat from './XpFloat.jsx'
import LessonSummary from './LessonSummary.jsx'
import { addLocalXp, getLocalXp } from '../../shared/lib/localProfile.js'
import { completeLesson, getProfile } from '../../shared/api/profileApi.js'
import { refreshProfile } from '../../shared/api/profileCache.js'

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
  onClose,
  onSummaryClose,
}) {
  const [files, setFiles] = useState(propFiles)
  const earnedXpRef = useRef(0)
  const { visibleNodes, pendingNode, onNodeDone } = useGraphPlayer(nodes, {
    onFinish: () => setTimeout(async () => {
      const profile = await getProfile()
      if (profile) {
        // Залогинен: XP начисляет сервер по своей копии урока, один раз за урок.
        // Без lessonId (предпросмотр в редакторе) начисления нет.
        setBaseXp(profile.xp)
        const awarded = lessonId ? await completeLesson(lessonId) : 0
        setEarnedXp(awarded)
        refreshProfile() // фоном обновляем кэш — вкладка «Профиль» откроется уже со свежим XP
      } else {
        // Гость: локальный XP как демо (на сервер не влияет).
        const earned = earnedXpRef.current
        setBaseXp(getLocalXp())
        if (earned > 0) addLocalXp(earned)
        setEarnedXp(earned)
      }
      setShowSummary(true)
    }, 2000),
  })

  const xpMap     = useMemo(() => buildXpMap(nodes, lessonXp), [nodes, lessonXp]) // eslint-disable-line
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
    if (!missing.length) { setFiles(propFiles); return }
    getFilesByIds(missing)
      .then(fetched => setFiles([...propFiles, ...fetched]))
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { blobMap, addMsgTs, debugItems } = usePlayerPreload(nodes, files, visibleNodes, { initialBlobMap })

  const openTimeRef      = useRef(Date.now())
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

  function downloadCombinedLog() {
    const ts = new Date().toISOString()
    const lines = [
      `=== Pithy Player Debug Log ===`,
      `ts: ${ts}`,
      `ua: ${navigator.userAgent}`,
      `device: memory=${navigator.deviceMemory ?? 'n/a'} cpu=${navigator.hardwareConcurrency ?? 'n/a'} conn=${navigator.connection?.effectiveType ?? 'n/a'}`,
      ``,
      `--- Player log (pLog) ---`,
      ...getPlayerLines(),
      ``,
      `--- Node timeline ---`,
      ...nodeAppearLogRef.current.map(n =>
        `seq=${n.seq} type=${n.type} at=${n.appearTs} blobReady=${n.blobReady} evicted=${n.blobEvicted} error=${n.blobError}`
      ),
      ``,
      `--- Downloads ---`,
      ...debugItems.map(d =>
        `#${d.seq} ${d.type} ${d.status} http=${d.httpStatus ?? '-'} ${d.sizeKb ?? '-'}KB start=${d.startTs} ready=${d.readyTs} msg=${d.msgTs ?? '-'} ${d.error ?? ''}`
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `pithy-debug-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(a.href)
  }

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

  const [pinVisible, setPinVisible]       = useState(true)
  const [wcPanelHeight, setWcPanelHeight] = useState(0)
  const [paPanelHeight, setPaPanelHeight] = useState(0)
  const [pcPanelHeight, setPcPanelHeight] = useState(0)
  const [regPanelHeight, setRegPanelHeight] = useState(0)

  const lastOf = (type) => [...visibleNodes].reverse().find(n => n.type === type) ?? null
  const wcNode  = lastOf('word_choice')
  const paNode  = lastOf('phrase_assembly')
  const pmNode  = lastOf('pin_message')
  const pcNode  = lastOf('photo_choice')
  const regNode = lastOf('registration')

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
        {pmNode && pinVisible && (
          <PinMessageBanner
            content={pmNode.typeData?.pin_message?.content ?? ''}
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
                    bottomOffset={wcPanelHeight || paPanelHeight || pcPanelHeight || regPanelHeight}
                    videoAutoSound={videoAutoSound}
                    onDone={isPending ? () => {} : () => onNodeDone(node.id)}
                    rewardXp={xpMap.get(node.id) ?? 0}
                    photoXpPending={pendingPhotoXp[node.id] ?? 0}
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
            node={wcNode}
            xpAmount={xpMap.get(wcNode.id) ?? 0}
            onDone={(result) => { setWcPanelHeight(0); onNodeDone(wcNode.id, result) }}
            onAnswered={(text, result) => handleWordAnswer(wcNode.id, text, result)}
            onXpEarned={handleXpEarned}
            onHeightChange={setWcPanelHeight}
          />
        )}
        {paNode && (
          <PhraseAssemblyPanel
            node={paNode}
            xpAmount={xpMap.get(paNode.id) ?? 0}
            onDone={(result) => { setPaPanelHeight(0); onNodeDone(paNode.id, result) }}
            onAnswered={(text, result) => handlePhraseAnswer(paNode.id, text, result)}
            onXpEarned={handleXpEarned}
            onHeightChange={setPaPanelHeight}
          />
        )}
        {pcNode && !photoChoiceStates[pcNode.id] && (
          <PhotoChoicePanel
            node={pcNode}
            lessonFiles={filesWithBlobs}
            onPick={(idx, isCorrect) => handlePhotoPick(pcNode.id, idx, isCorrect)}
            onHeightChange={setPcPanelHeight}
          />
        )}
        {regNode && (
          <RegistrationPanel
            node={regNode}
            onDone={(trigger, data) => { setRegPanelHeight(0); onNodeDone(regNode.id, trigger, data) }}
            onAnswered={(text, result) => handleRegAnswer(regNode.id, text, result)}
            onHeightChange={setRegPanelHeight}
          />
        )}
      </div>

      <XpFloat events={xpEvents} onDismiss={dismissXpEvent} />

      {showSummary && (
        <LessonSummary
          earnedXp={earnedXp}
          baseXp={baseXp}
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
