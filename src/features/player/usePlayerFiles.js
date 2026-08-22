import { useState, useEffect, useMemo } from 'react'
import { getFilesByIds } from '../../shared/lib/filesApi.js'

// Все id файлов, на которые ссылаются ноды урока (у photo_choice файл — у
// каждого варианта отдельно)
function fileIdsOf(nodes) {
  const single = nodes.map(n => n.typeData?.[n.type]?.file_id).filter(Boolean)
  const photos = nodes
    .filter(n => n.type === 'photo_choice')
    .flatMap(n => (n.typeData?.photo_choice?.photos ?? []).map(p => p.fileId).filter(Boolean))
  return [...new Set([...single, ...photos])]
}

// Файлы урока для плеера: то, что пришло пропом, плюс догруженное с сервера
// (урок мог открыться из ленты, где файлы отдельно не передавались).
//
// live=true — плеер запущен из канваса в режиме правки: админ может догрузить
// медиа прямо во время прохождения, и список файлов обязан обновляться на
// ходу. В обычном плеере берём снимок на момент открытия — как было раньше:
// новая ссылка propFiles на каждый рендер родителя иначе дёргала бы
// предзагрузку без причины.
export function usePlayerFiles(nodes, propFiles, live = false) {
  const [extraFiles, setExtraFiles] = useState([])
  // Снимок списка на момент открытия урока (для обычного плеера)
  const [snapshot] = useState(propFiles)

  useEffect(() => {
    const missing = fileIdsOf(nodes).filter(id => !propFiles.some(f => f.id === id))
    if (!missing.length) return
    getFilesByIds(missing)
      .then(fetched => setExtraFiles(prev => {
        const known = new Set(prev.map(f => f.id))
        const add = fetched.filter(f => !known.has(f.id))
        return add.length ? [...prev, ...add] : prev
      }))
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => {
    const base = live ? propFiles : snapshot
    if (!extraFiles.length) return base
    return [...base, ...extraFiles.filter(f => !base.some(b => b.id === f.id))]
  }, [live, propFiles, snapshot, extraFiles])
}
