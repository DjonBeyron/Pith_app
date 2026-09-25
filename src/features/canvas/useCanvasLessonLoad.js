import { useState, useEffect } from 'react'
import { dbg } from '../../shared/lib/debug.js'
import { loadScript } from '../../shared/lib/lessonsApi.js'
import { setLastEditedLesson } from '../../shared/lib/lastEditedLesson.js'

// Загрузка урока с сервера для канваса и состояния, которые она заполняет:
// название, XP урока, ноды/зоны сервера (initialNodes/initialZones для
// CanvasBoard) и строка статуса синхронизации. Вынесено из CanvasPage.jsx
// (тот упирался в потолок 400 строк). applyServerData — из useTeacherSettings:
// настройки учителя приходят в том же script
export function useCanvasLessonLoad(lessonId, module, applyServerData) {
  const [title,       setTitle]       = useState('')
  const [loading,     setLoading]     = useState(!!lessonId)
  const [serverNodes, setServerNodes] = useState(null)
  const [serverZones, setServerZones] = useState([])
  const [lessonXp,    setLessonXp]    = useState(0)
  // Видимая на любом устройстве строка статуса синхронизации (без включения
  // «Активировать дебаг» — на свежем компьютере без кэша дебаг тоже выключен
  // по умолчанию). Помогает увидеть расхождение id/числа нод между
  // компьютерами прямо в интерфейсе, без консоли разработчика
  const [syncStatus,  setSyncStatus]  = useState('')

  useEffect(() => {
    if (!lessonId) return
    loadScript(lessonId)
      .then(data => {
        const nodes = data?.script?.nodes ?? []
        dbg('[CANVAS] loaded lesson', lessonId, nodes.length, 'nodes, title:', data?.title)
        if (nodes.length) dbg('[CANVAS] node types:', nodes.map(n => n.type).join(', '))
        setTitle(data?.title ?? '')
        // Запоминаем урок для всплывашки «продолжить редактирование» при
        // следующем запуске приложения (ResumeEditingToast.jsx)
        setLastEditedLesson({ id: lessonId, title: data?.title, module })
        setLessonXp(data?.script?.lessonXp ?? 0)
        applyServerData(data?.script)
        if (nodes.length) setServerNodes(nodes)
        setServerZones(data?.script?.zones ?? [])
        const stamp = new Date().toTimeString().slice(0, 8)
        setSyncStatus(`Загружено с сервера: ${nodes.length} нод · id ${lessonId.slice(0, 8)} · ${stamp}`)
      })
      .catch(e => {
        dbg('[CANVAS ERROR] loadScript', e?.message)
        setSyncStatus('✗ Ошибка загрузки: ' + (e?.message ?? '?'))
      })
      .finally(() => setLoading(false))
  // applyServerData is stable (defined outside render), safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId])

  return { title, setTitle, loading, serverNodes, serverZones, lessonXp, setLessonXp, syncStatus, setSyncStatus }
}
