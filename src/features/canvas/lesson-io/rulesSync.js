// План синхронизации базы правил со стандартным набором (rules/*.js): что обновить, что создать, что убрать. Чистая функция, без сети.
// Совпадение — по названию (title), запасной путь — по началу текста (40 знаков, как в миграциях правил). Правила, которых нет
// в наборе и нет в списке снятых (RETIRED_TITLES), не трогаем — это правила, добавленные автором в окне или из «Разбора».
const FIELDS = ['text', 'title', 'group', 'checker', 'severity', 'bad', 'good', 'category']
const head = s => String(s ?? '').slice(0, 40)

function findMatch(dbRules, seed, taken) {
  const byTitle = dbRules.find(r => !taken.has(r.id) && r.title && r.title.trim() === seed.title)
  if (byTitle) return byTitle
  return dbRules.find(r => !taken.has(r.id) && head(r.text) === head(seed.text)) ?? null
}

/** { patch: [{ id, fields }], create: [seed], remove: [{ id, title }] } */
export function planSync(dbRules, seed, retiredTitles = []) {
  const taken = new Set()
  const patch = [], create = []
  for (const s of seed) {
    const r = findMatch(dbRules, s, taken)
    if (!r) { create.push(s); continue }
    taken.add(r.id)
    const fields = {}
    for (const f of FIELDS) if ((r[f] ?? '') !== (s[f] ?? '')) fields[f] = s[f] ?? ''
    if (Object.keys(fields).length) patch.push({ id: r.id, fields })
  }
  const retired = new Set(retiredTitles)
  const remove = dbRules.filter(r => !taken.has(r.id) && retired.has((r.title ?? '').trim())).map(r => ({ id: r.id, title: r.title }))
  return { patch, create, remove }
}

export const syncIsEmpty = plan => !plan.patch.length && !plan.create.length && !plan.remove.length

/** Короткая сводка плана для кнопки: «обновить 12 · добавить 3 · убрать 90» */
export function syncSummary(plan) {
  return [plan.patch.length && `обновить ${plan.patch.length}`, plan.create.length && `добавить ${plan.create.length}`, plan.remove.length && `убрать ${plan.remove.length}`].filter(Boolean).join(' · ')
}
