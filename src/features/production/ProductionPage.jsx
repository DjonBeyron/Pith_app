import { useState, useEffect, useCallback, useRef } from 'react'
import { loadScript, saveLesson } from '../../shared/lib/lessonsApi.js'
import { useLessonFiles } from '../canvas/useLessonFiles.js'
import { dbg } from '../../shared/lib/debug.js'
import BackButton from '../../shared/ui/BackButton.jsx'
import ProductionList from './ProductionList.jsx'

// Полноэкранный линейный редактор сценария урока («продакшен»): та же модель
// данных (lessons.script.nodes[]), что и canvas-редактор, — просто другой вид
// для быстрого набора большой цепочки сообщений подряд. См. PROJECT.md.
export default function ProductionPage({ lessonId, moduleLessons = [], onBack, onOpenCanvas }) {
  const linkableLessons = moduleLessons.filter(l => l.id !== lessonId)
  const [title,   setTitle]   = useState('')
  const [loading, setLoading] = useState(!!lessonId)
  const [isSaving, setIsSaving] = useState(false)
  const [nodes, setNodes] = useState([])
  // Всё, что лежит в script кроме nodes (lessonXp, настройки учителя...) —
  // сохраняем как есть, чтобы «Сохранить» из списка их не стёрло
  const scriptExtraRef = useRef({})

  const { files, pickFile, fetchMissingFiles } = useLessonFiles(lessonId)

  const handleNodesChange = useCallback(n => {
    setNodes(n)
    const ids = n.map(nd => nd.typeData?.[nd.type]?.file_id).filter(Boolean)
    if (ids.length) fetchMissingFiles(ids)
  }, [fetchMissingFiles])

  useEffect(() => {
    if (!lessonId) return
    loadScript(lessonId)
      .then(data => {
        const { nodes: loadedNodes, ...extra } = data?.script ?? {}
        scriptExtraRef.current = extra
        setTitle(data?.title ?? '')
        handleNodesChange(loadedNodes ?? [])
      })
      .catch(e => dbg('[PRODUCTION ERROR] loadScript', e?.message))
      .finally(() => setLoading(false))
  // handleNodesChange меняется только при смене fetchMissingFiles (стабилен по lessonId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId])

  async function handleSave() {
    setIsSaving(true)
    try {
      await saveLesson(lessonId, { title, script: { ...scriptExtraRef.current, nodes } })
    } finally {
      setIsSaving(false)
    }
  }

  // Переход в canvas («Граф») — сохраняем перед переключением, как по кнопке
  // «Сохранить»: иначе canvas открыл бы прошлую версию урока с сервера, а
  // правки, сделанные в списке, остались бы только здесь
  async function switchToCanvas() {
    await handleSave()
    onOpenCanvas(lessonId)
  }

  return (
    <div className="productionPage">
      <div className="productionPageHeader">
        <BackButton onClick={onBack} />
        <input
          className="productionPageTitle"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Название урока"
        />
        <button className="productionPageSave" onClick={handleSave} disabled={isSaving || loading}>
          {isSaving ? 'Сохраняю…' : 'Сохранить'}
        </button>
        <button className="productionPageGraphBtn" onClick={switchToCanvas} disabled={isSaving || loading}>
          Граф
        </button>
      </div>

      {!loading && (
        <ProductionList
          nodes={nodes}
          onNodesChange={handleNodesChange}
          lessonFiles={files}
          onPickLessonFile={pickFile}
          moduleLessons={linkableLessons}
        />
      )}
    </div>
  )
}
