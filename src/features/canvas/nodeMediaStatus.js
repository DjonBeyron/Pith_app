// Загружен ли в ноду медиа-файл — для метки в углу ноды и фильтра
// «не загруженные» в шапке канваса.
//
// Автор часто собирает весь сценарий текстом заранее, а голос/видео/фото
// прикладывает потом. На графе из сотни нод глазами уже не найти, где
// файла ещё нет — метка и фильтр отвечают ровно на этот вопрос.

// Типы, где файл обязателен: без него ноду нечем показать
const SINGLE_FILE_TYPES = new Set(['audio', 'photo', 'video', 'circle', 'sticker'])
// table хранит file_id тоже, но там аудио — необязательное дополнение
// к таблице, поэтому его отсутствие ошибкой не считаем.

// 'ok' — все файлы на месте, 'partial' — часть вариантов без фото
// (только photo_choice), 'missing' — файла нет вовсе,
// null — типу медиа не нужно (текст, системное, регистрация и т.п.)
export function getNodeMediaState(node) {
  if (node.type === 'photo_choice') {
    const photos = node.typeData?.photo_choice?.photos ?? []
    if (!photos.length) return 'missing'
    const withFile = photos.filter(p => p.fileId).length
    if (!withFile) return 'missing'
    return withFile === photos.length ? 'ok' : 'partial'
  }
  if (!SINGLE_FILE_TYPES.has(node.type)) return null
  return node.typeData?.[node.type]?.file_id ? 'ok' : 'missing'
}

// Ноду нужно догрузить: файла нет совсем или есть не у всех вариантов
export function nodeMissesMedia(node) {
  const state = getNodeMediaState(node)
  return state === 'missing' || state === 'partial'
}

// Приглушать ли ноду при текущем фильтре. Оба условия работают вместе (И):
// отмечены типы — нода должна быть одного из них; включено «не загруженные» —
// нода должна ждать файл. Позиция и связи не меняются, только яркость.
export function isNodeDimmed(node, visibleTypes, onlyMissingMedia) {
  if (visibleTypes?.size && !visibleTypes.has(node.type)) return true
  if (onlyMissingMedia && !nodeMissesMedia(node)) return true
  return false
}
