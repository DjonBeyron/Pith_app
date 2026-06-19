import { useState, useCallback, useEffect, useRef } from 'react'
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
  const nodesRef = useRef([])

  const { files, syncing, hasUnsynced, pickFile, removeFile, syncToServer, fetchMissingFiles } =
    useLessonFiles(lessonId)

  const {
    teacherName, setTeacherName,
    teacherLogoUrl,
    teacherLogoCrop, setTeacherLogoCrop,
    handleLogoPick,
    applyServerData,
    prepareForSave,
  } = useTeacherSettings(lessonId)

  const handleNodesChange = useCallback(n => {
    nodesRef.current = n
    setPanelNodes(n)
    // Fetch from Supabase any file IDs referenced by nodes but missing from local storage
    const ids = [...new Set(n.map(nd => nd.typeData?.[nd.type]?.file_id).filter(Boolean))]
    if (ids.length) fetchMissingFiles(ids)
  }, [fetchMissingFiles])

  useEffect(() => {
    if (!lessonId) return
    loadScript(lessonId)
      .then(data => {
        setTitle(data?.title ?? '')
        applyServerData(data?.script)
        if (data?.script?.nodes?.length) setServerNodes(data.script.nodes)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  // applyServerData is stable (defined outside render), safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId])

  async function handleSave() {
    setIsSaving(true)
    try {
      const teacherData = await prepareForSave()
      await saveLesson(lessonId, {
        title,
        script: { nodes: nodesRef.current, ...teacherData },
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="canvasPage">
      <div className="canvasPageHeader">
        <div className="canvasSettingsBtnWrap">
          <button className="canvasSettingsBtn" onClick={() => setShowPanel(s => !s)}>⚙</button>
          {hasUnsynced && <span className="canvasSettingsBadge" />}
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
      </div>

      {showPlayer && (
        <LessonPlayer
          nodes={panelNodes}
          files={files}
          lessonTitle={title}
          teacherName={teacherName}
          teacherLogo={teacherLogoUrl}
          teacherLogoCrop={teacherLogoCrop}
          onClose={() => setShowPlayer(false)}
        />
      )}

      {showPanel && (
        <LessonFilesPanel
          files={files}
          nodes={panelNodes}
          syncing={syncing}
          onSync={syncToServer}
          onRemove={removeFile}
          onClose={() => setShowPanel(false)}
          teacherName={teacherName}
          onNameChange={setTeacherName}
          teacherLogoUrl={teacherLogoUrl}
          onLogoPick={handleLogoPick}
          teacherLogoCrop={teacherLogoCrop}
          onCropChange={setTeacherLogoCrop}
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
