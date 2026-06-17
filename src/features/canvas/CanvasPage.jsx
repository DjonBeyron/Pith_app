import { useState, useCallback, useEffect, useRef } from 'react'
import CanvasBoard from './CanvasBoard.jsx'
import LessonFilesPanel from './LessonFilesPanel.jsx'
import { useLessonFiles } from './useLessonFiles.js'
import { loadScript, saveLesson } from '../../shared/lib/lessonsApi.js'

export default function CanvasPage({ lessonId, onBack }) {
  const [showPanel,   setShowPanel]   = useState(false)
  const [title,       setTitle]       = useState('')
  const [loading,     setLoading]     = useState(!!lessonId)
  const [isSaving,    setIsSaving]    = useState(false)
  const [serverNodes, setServerNodes] = useState(null)
  const [panelNodes,  setPanelNodes]  = useState([])
  const nodesRef = useRef([])

  const { files, syncing, hasUnsynced, pickFile, removeFile, syncToServer } =
    useLessonFiles(lessonId)

  const handleNodesChange = useCallback(n => {
    nodesRef.current = n
    setPanelNodes(n)
  }, [])

  useEffect(() => {
    if (!lessonId) return
    loadScript(lessonId)
      .then(data => {
        setTitle(data?.title ?? '')
        if (data?.script?.nodes?.length) setServerNodes(data.script.nodes)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [lessonId])

  async function handleSave() {
    setIsSaving(true)
    try {
      await saveLesson(lessonId, { title, script: { nodes: nodesRef.current } })
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
        <button className="canvasPageSave" onClick={handleSave} disabled={isSaving || loading}>
          {isSaving ? 'Сохраняю…' : 'Сохранить'}
        </button>
      </div>

      {showPanel && (
        <LessonFilesPanel
          files={files}
          nodes={panelNodes}
          syncing={syncing}
          onSync={syncToServer}
          onRemove={removeFile}
          onClose={() => setShowPanel(false)}
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
