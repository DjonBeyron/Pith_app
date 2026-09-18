// Мелкие чистые хелперы карточки запуска (LessonLaunchCard.jsx) — вынесены,
// чтобы сама карточка не упиралась в потолок 400 строк

// Все file_id сценария: одиночные файлы нод + фото у photo_choice
export function extractFileIds(nodes) {
  const single = nodes.map(n => n.typeData?.[n.type]?.file_id).filter(Boolean)
  const photos  = nodes
    .filter(n => n.type === 'photo_choice')
    .flatMap(n => (n.typeData?.photo_choice?.photos ?? []).map(p => p.fileId).filter(Boolean))
  return [...new Set([...single, ...photos])]
}

// Detect slow/low-memory devices to use a smaller in-memory buffer.
// Falls back to false on browsers that don't expose these APIs (e.g. iOS Safari).
export function isWeakDevice() {
  const mem  = navigator.deviceMemory          // GB, Chrome/Android only
  const cpu  = navigator.hardwareConcurrency
  const conn = navigator.connection?.effectiveType  // '2g' | 'slow-3g' | '3g' | '4g'
  if (mem  && mem  < 2)                        return true
  if (cpu  && cpu  < 4)                        return true
  if (conn && (conn === '2g' || conn === 'slow-3g')) return true
  return false
}
