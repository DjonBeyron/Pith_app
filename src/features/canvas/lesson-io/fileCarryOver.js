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
//
// Сопоставление идёт в два прохода: сначала «нода на той же позиции с тем же
// текстом», затем по тексту где угодно в новом уроке (позиции съезжают, когда
// в сценарии добавили/убрали ноды, и файл нельзя терять только из-за сдвига).
// Файл, на который новый урок ссылается по r2Url из JSON обмена, не удаляется
// никогда: иначе озвучка в плеере отдаёт 404 (случай урока «To», 2026-10-19).
const urlOf = n => n.typeData?.[n.type]?.r2Url

export function carryOverFiles(prevNodes, nextNodes, removeFile) {
  const textField = { ...TEXT_FIELD }
  const prevSorted = bySeq(prevNodes)
  const nextSorted = bySeq(nextNodes)
  const patchById = new Map()
  const usedPrev = new Set()
  const keepUrls = new Set(nextSorted.map(urlOf).filter(Boolean))
  const textOf = (n) => (n.typeData?.[n.type]?.[textField[n.type]] ?? '').trim()
  const carryFrom = (prev, next) => {
    const prevData = prev.typeData?.[prev.type] ?? {}
    const carry = {}
    for (const f of CARRY_FIELDS[prev.type]) carry[f] = prevData[f]
    patchById.set(next.id, carry)
    usedPrev.add(prev.id)
  }
  const hasFile = n => !!n.typeData?.[n.type]?.file_id

  const len = Math.min(prevSorted.length, nextSorted.length)
  for (let i = 0; i < len; i++) {
    const prev = prevSorted[i]
    const next = nextSorted[i]
    if (prev.type !== next.type || !textField[prev.type] || !hasFile(prev)) continue
    if (textOf(prev) === textOf(next)) carryFrom(prev, next)
  }
  for (const prev of prevSorted) {
    if (usedPrev.has(prev.id) || !textField[prev.type] || !hasFile(prev)) continue
    const next = nextSorted.find(n => n.type === prev.type && !patchById.has(n.id) && !hasFile(n) && textOf(n) === textOf(prev))
    if (next) carryFrom(prev, next)
  }
  for (const prev of prevSorted) {
    if (usedPrev.has(prev.id) || !textField[prev.type] || !hasFile(prev)) continue
    removeFile?.(prev.typeData[prev.type].file_id, keepUrls)
  }

  if (!patchById.size) return nextNodes
  return nextNodes.map(n => {
    const carry = patchById.get(n.id)
    if (!carry) return n
    return { ...n, typeData: { ...n.typeData, [n.type]: { ...n.typeData[n.type], ...carry } } }
  })
}
