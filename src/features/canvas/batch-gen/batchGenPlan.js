// Что можно сгенерировать одним запуском («⚡ Генерация» в шапке холста):
// проходит по всем нодам и делит их на готовые к генерации (есть исходный
// текст, файла ещё нет) и пропущенные — с причиной и номером ноды, чтобы
// автор мог найти и починить руками (например дописать промпт).
//
// audio (озвучка) и photo/sticker/photo_choice (картинки) считаются
// отдельно — см. useBatchGenerate.js, показывается два независимых счётчика.
//
// Режим «только сломанные» (scope — строки списка сломанных нод, health/lessonHealth.js): в план попадают ТОЛЬКО эти ноды, а их
// битый файл считается отсутствующим (у photo_choice — только битые варианты, без списка — все). Ссылки в самих нодах при этом
// не трогаем: пока автор не нажал «Начать», ничего не меняется, список сломанных остаётся; генерация просто перезапишет file_id.

// scope → Map nodeId → Set(photoId) | 'all' (что считать отсутствующим); null — обычный режим (все ноды без файла)
export function scopeOf(rows) {
  if (!rows) return null
  const m = new Map()
  for (const r of rows) {
    const ids = (r.badFiles ?? []).map(b => b.photoId).filter(Boolean)
    m.set(r.id, r.type === 'photo_choice' && ids.length ? new Set(ids) : 'all')
  }
  return m
}
const forced = (scope, node, photoId = null) => {
  const f = scope?.get(node.id)
  return !!f && (f === 'all' || (photoId != null && f.has(photoId)))
}

function auditAudio(node, scope) {
  const d = node.typeData?.audio ?? {}
  if (d.file_id && !forced(scope, node)) return null
  const text = (d.text ?? '').trim()
  if (!text) return { skip: { seq: node.seq, type: 'audio', reason: 'нет текста' } }
  return { item: { key: node.id, nodeId: node.id, seq: node.seq, kind: 'audio', text } }
}

// Авто-таблица (dictator) со сценарием озвучки, но без записи: озвучка + автомонтаж по таймингам слов
function auditTable(node, scope) {
  const d = node.typeData?.table ?? {}
  if (d.mode !== 'dictator') return scope?.has(node.id) ? { skip: { seq: node.seq, type: 'table', reason: 'не авто-таблица: озвучка только у режима «диктор»' } } : null
  if (d.file_id && !forced(scope, node)) return null
  const text = (d.script ?? '').trim()
  if (!text) return scope?.has(node.id) ? { skip: { seq: node.seq, type: 'table', reason: 'нет сценария озвучки' } } : null
  return { item: { key: node.id, nodeId: node.id, seq: node.seq, kind: 'audio', isTable: true, text } }
}

function auditImageNode(node, scope) {
  const d = node.typeData?.[node.type] ?? {}
  if (d.file_id && !forced(scope, node)) return null
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
function auditPhotoChoice(node, scope) {
  const photos = node.typeData?.photo_choice?.photos ?? []
  const items = []
  const skipped = []
  photos.forEach((p, idx) => {
    if (p.fileId && !forced(scope, node, p.id)) return
    const prompt = (p.imagePrompt ?? p.label ?? '').trim()
    if (!prompt) { skipped.push({ seq: node.seq, type: 'photo_choice', reason: `нет промпта/подписи у варианта ${idx + 1}` }); return }
    items.push({ key: `${node.id}:${p.id}`, nodeId: node.id, photoId: p.id, seq: node.seq, kind: 'photo', text: prompt })
  })
  return { items, skipped }
}

export function buildBatchPlan(nodes, scope = null) {
  const items = []
  const skipped = []

  for (const node of [...nodes].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))) {
    if (scope && !scope.has(node.id)) continue
    if (node.type === 'audio') {
      const r = auditAudio(node, scope)
      if (r?.item) items.push(r.item)
      if (r?.skip) skipped.push(r.skip)
    } else if (node.type === 'table') {
      const r = auditTable(node, scope)
      if (r?.item) items.push(r.item)
      if (r?.skip) skipped.push(r.skip)
    } else if (node.type === 'photo' || node.type === 'sticker') {
      const r = auditImageNode(node, scope)
      if (r?.item) items.push(r.item)
      if (r?.skip) skipped.push(r.skip)
    } else if (node.type === 'photo_choice') {
      const r = auditPhotoChoice(node, scope)
      items.push(...r.items)
      skipped.push(...r.skipped)
    } else if (scope) {
      skipped.push({ seq: node.seq, type: node.type, reason: node.type === 'scene' ? 'сцены озвучиваются в сборщике сцены' : 'этот тип массовая генерация не умеет' })
    }
  }

  return {
    items,
    skipped,
    audioTotal: items.filter(i => i.kind === 'audio').length,
    photoTotal: items.filter(i => i.kind === 'photo').length,
  }
}
