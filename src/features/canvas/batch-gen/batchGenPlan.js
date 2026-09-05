// Что можно сгенерировать одним запуском («⚡ Генерация» в шапке холста):
// проходит по всем нодам и делит их на готовые к генерации (есть исходный
// текст, файла ещё нет) и пропущенные — с причиной и номером ноды, чтобы
// автор мог найти и починить руками (например дописать промпт).
//
// audio (озвучка) и photo/sticker/photo_choice (картинки) считаются
// отдельно — см. useBatchGenerate.js, показывается два независимых счётчика.

function auditAudio(node) {
  const d = node.typeData?.audio ?? {}
  if (d.file_id) return null
  const text = (d.text ?? '').trim()
  if (!text) return { skip: { seq: node.seq, type: 'audio', reason: 'нет текста' } }
  return { item: { key: node.id, nodeId: node.id, seq: node.seq, kind: 'audio', text } }
}

function auditImageNode(node) {
  const d = node.typeData?.[node.type] ?? {}
  if (d.file_id) return null
  const prompt = (d.imagePrompt ?? '').trim()
  if (!prompt) return { skip: { seq: node.seq, type: node.type, reason: 'нет промпта' } }
  return { item: { key: node.id, nodeId: node.id, seq: node.seq, kind: 'photo', text: prompt } }
}

// photo_choice — несколько вариантов в одной ноде (обычно до 4 — верный +
// пара отвлекающих), у каждого свой промпт (imagePrompt, а не label — label
// видит ученик, это разные поля, см. lessonSchema.js) и свой fileId. Если
// imagePrompt не задан явно — используем label как разумный дефолт (короткие
// подписи вроде «She tries yoga» часто и так годятся описанием сцены),
// см. promptFor() в NodePhotoChoicePicker.jsx — та же логика фолбэка.
function auditPhotoChoice(node) {
  const photos = node.typeData?.photo_choice?.photos ?? []
  const items = []
  const skipped = []
  photos.forEach((p, idx) => {
    if (p.fileId) return
    const prompt = (p.imagePrompt ?? p.label ?? '').trim()
    if (!prompt) { skipped.push({ seq: node.seq, type: 'photo_choice', reason: `нет промпта/подписи у варианта ${idx + 1}` }); return }
    items.push({ key: `${node.id}:${p.id}`, nodeId: node.id, photoId: p.id, seq: node.seq, kind: 'photo', text: prompt })
  })
  return { items, skipped }
}

export function buildBatchPlan(nodes) {
  const items = []
  const skipped = []

  for (const node of [...nodes].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))) {
    if (node.type === 'audio') {
      const r = auditAudio(node)
      if (r?.item) items.push(r.item)
      if (r?.skip) skipped.push(r.skip)
    } else if (node.type === 'photo' || node.type === 'sticker') {
      const r = auditImageNode(node)
      if (r?.item) items.push(r.item)
      if (r?.skip) skipped.push(r.skip)
    } else if (node.type === 'photo_choice') {
      const r = auditPhotoChoice(node)
      items.push(...r.items)
      skipped.push(...r.skipped)
    }
  }

  return {
    items,
    skipped,
    audioTotal: items.filter(i => i.kind === 'audio').length,
    photoTotal: items.filter(i => i.kind === 'photo').length,
  }
}
