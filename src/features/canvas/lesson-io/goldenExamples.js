// Образцы из золотого набора (окно «Разбор» → «⭐ Набор» → examples.json, формат pithy-golden-set, см. review/lessonExamples.js) для промпта
// автора: не все примеры, а по нескольку лучших на тип ноды — few-shot по выборке вместо ещё одного правила. Чистые функции, без React.
// Приоритет: пары «до → после» (самый сильный сигнал), затем «хорошо», затем «плохо»; свежие раньше
const KIND_RANK = { pair: 0, good: 1, bad: 2 }

/** Читает файл набора (объект {format, examples} или массив) → массив примеров. Мусор → [] */
export function parseGoldenSet(json) {
  const list = Array.isArray(json) ? json : Array.isArray(json?.examples) ? json.examples : []
  return list.filter(e => e && typeof e === 'object' && (e.before || e.after))
}

/** До perType примеров на каждый тип ноды, лучшие первыми */
export function pickExamples(examples, { perType = 3 } = {}) {
  const byType = new Map()
  const sorted = [...examples].sort((a, b) => (KIND_RANK[a.kind] ?? 3) - (KIND_RANK[b.kind] ?? 3) || String(b.at ?? '').localeCompare(String(a.at ?? '')))
  for (const e of sorted) {
    const t = e.type || 'text'
    const list = byType.get(t) ?? []
    if (list.length < perType) { list.push(e); byType.set(t, list) }
  }
  return [...byType.entries()]
}

function one(e) {
  const why = [e.ruleTitle, ...(Array.isArray(e.comments) ? e.comments : [])].filter(Boolean).join('; ')
  if (e.kind === 'pair') return `❌ ${e.before}\n✅ ${e.after}${why ? `\n   (${why})` : ''}`
  if (e.kind === 'bad') return `❌ ${e.before || e.after}${why ? `\n   (${why})` : ''}`
  return `✅ ${e.after || e.before}${why ? `\n   (${why})` : ''}`
}

/** Раздел промпта «ОБРАЗЦЫ ИЗ ЗОЛОТОГО НАБОРА» по типам нод. Пусто без примеров */
export function examplesSection(examples, opts) {
  const picked = pickExamples(parseGoldenSet(examples), opts)
  if (!picked.length) return ''
  return `ОБРАЗЦЫ ИЗ ЗОЛОТОГО НАБОРА (из разборов принятых уроков; ❌ как было → ✅ как стало; пиши в духе ✅):\n\n${picked.map(([t, list]) => `### ${t}\n${list.map(one).join('\n\n')}`).join('\n\n')}`
}
