// Авто-ответ админа в «выбери фото» (SolveCorrectButton): исходный индекс
// первого верного фото — тот же idx, что уходит в onPick при тапе по плитке
// галереи (PhotoChoicePanel.handlePick). Индекс за пределами списка фото
// (автор удалил фото, а correctIndexes не подчистил) пропускаем; нет ни
// одного верного — null.
export function correctPhotoIndex(photos = [], correctIndexes = []) {
  const idx = correctIndexes.find(i => Number.isInteger(i) && i >= 0 && i < photos.length)
  return idx ?? null
}
