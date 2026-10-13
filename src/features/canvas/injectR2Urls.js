// Вписывает r2Url загруженных файлов прямо в ноды — плеер берёт медиа по
// ссылке из ноды, без запроса к таблице files. Нужен и сохранению урока
// (useCanvasSave.js), и сохранению колоды карточек (reviewCards)
export function injectR2Urls(nodes, files) {
  return nodes.map(node => {
    // photo_choice: у каждой фотографии свой файл
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
}

/** Ноды, у которых указан файл (file_id / fileId варианта), а ссылки r2Url нет: пользователь такое медиа не получит. Возвращает «тип#seq» */
export function findUnlinkedMedia(nodes) {
  const out = []
  for (const n of nodes ?? []) {
    if (n.type === 'photo_choice') {
      const bad = (n.typeData?.photo_choice?.photos ?? []).some(p => p.fileId && !p.photoUrl)
      if (bad) out.push(`${n.type}#${n.seq}`)
      continue
    }
    const d = n.typeData?.[n.type]
    if (d?.file_id && !d.r2Url) out.push(`${n.type}#${n.seq}`)
  }
  return out
}

/**
 * Почему у нод нет рабочего файла — для окна файлов: [{ nodeId, seq, type, reason }].
 * Не найден в списке (потерян), «локальный», но самой копии нет (не восстановилась из браузера — загружать нечего), на сервере без ссылки.
 */
export function diagnoseMedia(nodes, files) {
  const out = []
  for (const n of nodes ?? []) {
    const d = n.typeData?.[n.type]
    if (!d?.file_id) continue
    const f = (files ?? []).find(x => x.id === d.file_id)
    let reason = null
    if (!f) reason = 'файл не найден в списке файлов урока (потерян)'
    else if (f.status === 'local' && !f.localFile) reason = 'локальная копия потеряна (не восстановилась в браузере), загружать нечего'
    else if (f.status === 'synced' && !f.r2Url) reason = 'на сервере у файла нет ссылки'
    if (reason) out.push({ nodeId: n.id, seq: n.seq, type: n.type, reason })
  }
  return out
}
