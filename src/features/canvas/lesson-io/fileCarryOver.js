// Экспорт JSON не несёт файлов (см. exportLesson.js — FILE_FIELDS вырезаны)
// и внутренних id: при «Заменить урок» ноды получают совсем новые id, так что
// связь со старым файлом теряется просто по построению импорта. Без этого
// модуля результат был бы одинаковым независимо от того, что реально
// изменилось: старые файлы либо всегда осиротевали бы молча, либо их
// пришлось бы удалять поголовно — а часть нод в реимпортированном уроке
// (например, после правки структуры сценария в текстовом виде или через LLM)
// может остаться ТЕМИ ЖЕ по смыслу: тот же текст озвучки, тот же промпт фото.
//
// Правило пользователя: старый файл удаляется, только если исходный текст,
// из которого он был бы сделан, изменился; если текст тот же — файл
// переносится на новую ноду вместо повторной генерации/загрузки.
//
// Сопоставление старой и новой ноды — по позиции в сценарии (сортировка по
// seq) и типу: точного id, переживающего экспорт/импорт, не существует, а
// порядок в сценарии — единственный стабильный ориентир. Для типов без
// понятия «исходный текст» (video/circle — файл не из текста) сравнивать
// нечего, поведение для них не меняется.

const TEXT_FIELD = { audio: 'text', photo: 'imagePrompt', sticker: 'imagePrompt' }

const CARRY_FIELDS = {
  audio:   ['file_id', 'waveformData', 'wordTimings', 'duration'],
  photo:   ['file_id', 'crop'],
  sticker: ['file_id', 'crop', 'isVideo'],
}

function bySeq(nodes) {
  return [...nodes].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
}

// removeFile — та же функция, что onRemoveLessonFile у NodeAudioTts/
// NodeImageGen (см. useLessonFiles.js): помечает файл к удалению при синке,
// не удаляет ничего мгновенно и необратимо.
export function carryOverFiles(prevNodes, nextNodes, removeFile) {
  const textField = { ...TEXT_FIELD }
  const prevSorted = bySeq(prevNodes)
  const nextSorted = bySeq(nextNodes)
  const patchById = new Map()

  const len = Math.min(prevSorted.length, nextSorted.length)
  for (let i = 0; i < len; i++) {
    const prev = prevSorted[i]
    const next = nextSorted[i]
    if (prev.type !== next.type) continue
    const field = textField[prev.type]
    if (!field) continue

    const prevData = prev.typeData?.[prev.type] ?? {}
    const nextData = next.typeData?.[next.type] ?? {}
    const oldFileId = prevData.file_id
    if (!oldFileId) continue

    const sameText = (prevData[field] ?? '').trim() === (nextData[field] ?? '').trim()
    if (sameText) {
      const carry = {}
      for (const f of CARRY_FIELDS[prev.type]) carry[f] = prevData[f]
      patchById.set(next.id, carry)
    } else {
      removeFile?.(oldFileId)
    }
  }

  if (!patchById.size) return nextNodes
  return nextNodes.map(n => {
    const carry = patchById.get(n.id)
    if (!carry) return n
    return { ...n, typeData: { ...n.typeData, [n.type]: { ...n.typeData[n.type], ...carry } } }
  })
}
