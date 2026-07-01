import { useState, useCallback, useEffect, useRef } from 'react'
import { pLog, dbg } from '../../shared/lib/debug.js'
import CanvasBoard from './CanvasBoard.jsx'
import LessonFilesPanel from './LessonFilesPanel.jsx'
import LessonPlayer from '../player/LessonPlayer.jsx'
import { useLessonFiles } from './useLessonFiles.js'
import { useTeacherSettings } from './useTeacherSettings.js'
import { loadScript, saveLesson } from '../../shared/lib/lessonsApi.js'

export default function CanvasPage({ lessonId, onBack }) {
  const [showPanel,   setShowPanel]   = useState(false)
  const [showPlayer,  setShowPlayer]  = useState(false)
  const [title,       setTitle]       = useState('')
  const [loading,     setLoading]     = useState(!!lessonId)
  const [isSaving,    setIsSaving]    = useState(false)
  const [serverNodes, setServerNodes] = useState(null)
  const [panelNodes,  setPanelNodes]  = useState([])
  const [lessonXp,    setLessonXp]    = useState(0)
  const nodesRef = useRef([])

  const { files, syncing, hasUnsynced, pickFile, removeFile, syncToServer, fetchMissingFiles } =
    useLessonFiles(lessonId)

  const {
    teacherName, setTeacherName,
    teacherLogoUrl,
    teacherLogoCrop, setTeacherLogoCrop,
    videoAutoSound, setVideoAutoSound,
    hasUnsyncedLogo,
    handleLogoPick,
    applyServerData,
    uploadLogoIfPending,
    prepareForSave,
  } = useTeacherSettings(lessonId)

  const handleNodesChange = useCallback(n => {
    nodesRef.current = n
    setPanelNodes(n)
    const regular = n.map(nd => nd.typeData?.[nd.type]?.file_id).filter(Boolean)
    const pcPhotos = n
      .filter(nd => nd.type === 'photo_choice')
      .flatMap(nd => (nd.typeData?.photo_choice?.photos ?? []).map(ph => ph.fileId).filter(Boolean))
    const ids = [...new Set([...regular, ...pcPhotos])]
    if (ids.length) fetchMissingFiles(ids)
  }, [fetchMissingFiles])

  useEffect(() => {
    if (!lessonId) return
    loadScript(lessonId)
      .then(data => {
        const nodes = data?.script?.nodes ?? []
        dbg('[CANVAS] loaded lesson', lessonId, nodes.length, 'nodes, title:', data?.title)
        if (nodes.length) dbg('[CANVAS] node types:', nodes.map(n => n.type).join(', '))
        setTitle(data?.title ?? '')
        setLessonXp(data?.script?.lessonXp ?? 0)
        applyServerData(data?.script)
        if (nodes.length) setServerNodes(nodes)
      })
      .catch(e => dbg('[CANVAS ERROR] loadScript', e?.message))
      .finally(() => setLoading(false))
  // applyServerData is stable (defined outside render), safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId])

  async function handleSave() {
    setIsSaving(true)
    try {
      const teacherData = await prepareForSave()
      // Inject r2Url into each node's typeData so the player can use it without Supabase lookup
      const nodesForSave = nodesRef.current.map(node => {
        // photo_choice: inject r2Url into each photo object
        if (node.type === 'photo_choice') {
          const photos = (node.typeData?.photo_choice?.photos ?? []).map(ph => {
            if (!ph.fileId) return ph
            const f = files.find(fl => fl.id === ph.fileId)
            return f?.r2Url ? { ...ph, photoUrl: f.r2Url } : ph
          })
          return { ...node, typeData: { ...node.typeData, photo_choice: { ...node.typeData.photo_choice, photos } } }
        }
        const fileId = node.typeData?.[node.type]?.file_id
        if (!fileId) return node
        const f = files.find(fl => fl.id === fileId)
        if (!f?.r2Url) return node
        return { ...node, typeData: { ...node.typeData, [node.type]: { ...node.typeData[node.type], r2Url: f.r2Url } } }
      })
      const scriptToSave = { nodes: nodesForSave, lessonXp, ...teacherData }
      dbg('[CANVAS] saving', nodesForSave.length, 'nodes to lesson', lessonId)
      await saveLesson(lessonId, { title, script: scriptToSave })
      dbg('[CANVAS] save complete')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="canvasPage">
      <div className="canvasPageHeader">
        <div className="canvasSettingsBtnWrap">
          <button className="canvasSettingsBtn" onClick={() => setShowPanel(s => !s)}>⚙</button>
          {(hasUnsynced || hasUnsyncedLogo) && <span className="canvasSettingsBadge" />}
        </div>
        <input
          className="canvasPageTitle"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Название урока"
        />
        <button className="canvasPageBack" onClick={onBack}>← Назад</button>
        <button className="canvasPagePlay" onClick={() => setShowPlayer(true)}>▶</button>
        <button className="canvasPageSave" onClick={handleSave} disabled={isSaving || loading}>
          {isSaving ? 'Сохраняю…' : 'Сохранить'}
        </button>
        <div className="canvasXpField">
          <input
            className="canvasXpInput"
            type="number"
            min="0"
            step="10"
            value={lessonXp}
            onChange={e => setLessonXp(Math.max(0, parseInt(e.target.value) || 0))}
            onClick={e => e.stopPropagation()}
          />
          <span className="canvasXpLabel">XP</span>
        </div>
      </div>

      {showPlayer && (
        <LessonPlayer
          nodes={panelNodes}
          files={files}
          lessonTitle={title}
          lessonXp={lessonXp}
          teacherName={teacherName}
          teacherLogo={teacherLogoUrl}
          teacherLogoCrop={teacherLogoCrop}
          videoAutoSound={videoAutoSound}
          onClose={() => setShowPlayer(false)}
          onSummaryClose={onBack}
        />
      )}

      {showPanel && (
        <LessonFilesPanel
          files={files}
          nodes={panelNodes}
          syncing={syncing}
          hasUnsyncedLogo={hasUnsyncedLogo}
          onSync={() => { syncToServer(); uploadLogoIfPending() }}
          onRemove={removeFile}
          onClose={() => setShowPanel(false)}
          teacherName={teacherName}
          onNameChange={setTeacherName}
          teacherLogoUrl={teacherLogoUrl}
          onLogoPick={handleLogoPick}
          teacherLogoCrop={teacherLogoCrop}
          onCropChange={setTeacherLogoCrop}
          videoAutoSound={videoAutoSound}
          onVideoAutoSoundChange={setVideoAutoSound}
        />
      )}

      {!loading && (
        <CanvasBoard
          lessonId={lessonId}
          lessonFiles={files}
          onPickLessonFile={pickFile}
          onNodesChange={handleNodesChange}
          initialNodes={serverNodes}
        />
      )}
    </div>
  )
}
