// Особые триггеры по вариантам ответа: у нод с проверкой ответа (word_choice,
// phrase_assembly, photo_choice, table) помимо общих Верно/Неверно у КАЖДОГО
// отдельного варианта (слово, фото, слово-ловушка) можно задать свой особый
// переход — он замещает общий верно/неверно именно для этого варианта.
// Хранится в том же node.triggers[]: базовая пара (if = <type>_correct/_wrong)
// + по одному триггеру на вариант (if = id самого варианта — он уже уникален
// в пределах ноды, отдельная схема ключей не нужна).

// Список вариантов ноды в порядке отображения — тот же порядок, в котором
// строятся триггеры (порядок массива triggers завязан на измерение Y-координат
// портов канваса, см. пикеры).
export function getVariantList(type, tData) {
  if (type === 'word_choice') return (tData.options ?? []).map(o => ({ id: o.id, label: o.text }))
  if (type === 'photo_choice') return (tData.photos ?? []).map(p => ({ id: p.id, label: p.label }))
  if (type === 'phrase_assembly' || type === 'table') {
    return (tData.distractors ?? []).map(d => ({ id: d.id, label: d.text }))
  }
  return []
}

// phrase_assembly/table хранили distractors как массив голых строк — без id
// не к чему привязать особый триггер. Переводим на объекты {id, text} при
// первом обращении (пишется обратно через onDistractorsChange вызывающим).
// Возвращает тот же массив без изменений, если миграция уже не нужна —
// чтобы не плодить лишние onChange на каждый рендер.
export function migrateDistractors(distractors) {
  if (!distractors?.length || typeof distractors[0] !== 'string') return distractors
  return distractors.map(text => ({ id: crypto.randomUUID(), text }))
}

// Канонический порядок ключей триггеров для текущего состава вариантов.
function canonicalIfs(baseIfPair, variantList) {
  return [baseIfPair[0], baseIfPair[1], ...variantList.map(v => v.id)]
}

// true, если triggers уже соответствуют канонической форме (тот же порядок
// if-ключей) — используется, чтобы не перезаписывать triggers на каждый
// рендер (эффект нормализации вызывает onTriggersChange только когда реально
// нужно).
export function triggersNeedSync(baseIfPair, variantList, triggers) {
  const want = canonicalIfs(baseIfPair, variantList)
  const have = (triggers ?? []).map(t => t.if)
  return want.length !== have.length || want.some((k, i) => k !== have[i])
}

// Строит канонический массив триггеров: базовая пара + по одному на вариант,
// в порядке getVariantList. Существующие id/then сохраняются по совпадению
// if — переставили/удалили вариант, сменили тип — лишнее отбрасывается,
// недостающее создаётся пустым (then: null).
export function syncTriggers(baseIfPair, variantList, triggers) {
  const byIf = new Map((triggers ?? []).map(t => [t.if, t]))
  const build = ifVal => {
    const existing = byIf.get(ifVal)
    return { id: existing?.id ?? crypto.randomUUID(), if: ifVal, then: existing?.then ?? null }
  }
  return canonicalIfs(baseIfPair, variantList).map(build)
}
