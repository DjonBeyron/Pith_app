import { useState, useEffect, useCallback, useRef } from 'react'
import { loadScript, saveLesson } from '../../shared/lib/lessonsApi.js'
import { useLessonFiles } from '../canvas/useLessonFiles.js'
import { canvasLsKey } from '../canvas/canvasStorageKeys.js'
import { dbg } from '../../shared/lib/debug.js'
import { setLastEditorMode } from '../../shared/lib/lastEditorMode.js'
import BackButton from '../../shared/ui/BackButton.jsx'
import ProductionList from './ProductionList.jsx'

// Полноэкранный линейный редактор сценария урока («продакшен»): та же модель
// данных (lessons.script.nodes[]), что и canvas-редактор, — просто другой вид
// для быстрого набора большой цепочки сообщений подряд. См. PROJECT.md.
export default function ProductionPage({ lessonId, moduleLessons = [], onBack, onOpenCanvas }) {
  const linkableLessons = moduleLessons.filter(l => l.id !== lessonId)
  // ⚙ в схеме модуля запоминает, каким редактором пользовались последним,
  // и в следующий раз открывает сразу его (см. lastEditorMode.js)
  useEffect(() => { setLastEditorMode('production') }, [])
  const [title,   setTitle]   = useState('')
  const [loading, setLoading] = useState(!!lessonId)
  const [isSaving, setIsSaving] = useState(false)
  const [nodes, setNodes] = useState([])
  // Всё, что лежит в script кроме nodes (lessonXp, настройки учителя...) —
  // сохраняем как есть, чтобы «Сохранить» из списка их не стёрло
  const scriptExtraRef = useRef({})
  // Скролл-контейнер списка (ProductionList) — кнопка «В начало» скроллит его наверх
  const scrollRef = useRef(null)

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
      // У canvas-редактора свой localStorage-черновик этого урока (canvasLsKey) —
      // при следующем открытии он имеет приоритет над данными сервера (см.
      // CanvasBoard.jsx). Без этой строки canvas показал бы старый черновик
      // вместо только что сохранённого отсюда порядка/правок — независимо от
      // того, каким путём его потом откроют (кнопка «Граф» здесь, либо ⚙ из
      // схемы модуля напрямую)
      localStorage.removeItem(canvasLsKey(lessonId))
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

  function clearAll() {
    if (!window.confirm('Удалить ВСЕ ноды урока? Это нельзя отменить.')) return
    handleNodesChange([])
  }

  function scrollToTop() {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
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
        <button
          className="pageDangerBtn"
          onClick={clearAll}
          disabled={isSaving || loading}
          title="Удалить все ноды урока"
        >Очистить</button>
        <button
          className="pageTabBtn"
          onClick={scrollToTop}
          disabled={isSaving || loading}
          title="Прокрутить список к первой ноде"
        >В начало</button>
        {/* Тройка всегда в этом порядке: Сохранить → Граф → Продакшен.
            «Продакшен» — текущая страница (подсвечена), клик просто сохраняет */}
        <button className="productionPageSave" onClick={handleSave} disabled={isSaving || loading}>
          {isSaving ? 'Сохраняю…' : 'Сохранить'}
        </button>
        <button className="pageTabBtn" onClick={switchToCanvas} disabled={isSaving || loading}>
          Граф
        </button>
        <button className="pageTabBtn pageTabBtnActive" onClick={handleSave} disabled={isSaving || loading}>
          Продакшен
        </button>
      </div>

      {!loading && (
        <ProductionList
          nodes={nodes}
          onNodesChange={handleNodesChange}
          lessonFiles={files}
          onPickLessonFile={pickFile}
          moduleLessons={linkableLessons}
          scrollRef={scrollRef}
        />
      )}
    </div>
  )
}
