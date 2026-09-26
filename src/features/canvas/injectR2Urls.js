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
