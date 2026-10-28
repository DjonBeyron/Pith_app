// Строки отчёта «Запуск»: фабрики формы { id, title, kind, have, need, missing, ok, status, why, items, ... }.
// Чистые функции, без React и supabase. status: 'ok' | 'fail' | 'nodata' (источник не прочитался) | 'info' (справочно, без порога).

const base = (t, id, extra) => ({
  id, title: t.title, why: t.why, items: [], itemsLabel: 'Что исправить', hint: '', note: '', ...extra,
})

const verdict = ok => ({ ok, status: ok ? 'ok' : 'fail' })

// Счётчик: есть `have`, нужно не меньше `need` (limit:'max' — не больше, как у «сложность не задана»)
export function countRow(t, id, have, { items, itemsLabel, hint, note, limit = 'min' } = {}) {
  const ok = limit === 'max' ? have <= t.need : have >= t.need
  return base(t, id, {
    kind: 'count', have, need: t.need, limit,
    missing: limit === 'max' ? Math.max(0, have - t.need) : Math.max(0, t.need - have),
    ...verdict(ok), ...(items && { items }), ...(itemsLabel && { itemsLabel }), ...(hint && { hint }), ...(note && { note }),
  })
}

// Доля: `count` из `total` фраз/слов, нужно не меньше t.need процентов. have — процент (округлён вниз до десятых)
export function percentRow(t, id, count, total, { items, itemsLabel, hint, note } = {}) {
  const ok = total > 0 && count * 100 >= t.need * total
  return base(t, id, {
    kind: 'percent', have: total ? Math.floor((count / total) * 1000) / 10 : 0, need: t.need, count, total,
    missing: total ? Math.max(0, Math.ceil((t.need * total) / 100) - count) : 0,
    ...verdict(ok), ...(items && { items }), ...(itemsLabel && { itemsLabel }), ...(hint && { hint }), ...(note && { note }),
  })
}

// Да/нет: have — выполнено ли, items — чего не хватает
export function boolRow(t, id, have, { items, itemsLabel, hint, note } = {}) {
  return base(t, id, {
    kind: 'bool', have, need: true, missing: items?.length ?? (have ? 0 : 1),
    ...verdict(have), ...(items && { items }), ...(itemsLabel && { itemsLabel }), ...(hint && { hint }), ...(note && { note }),
  })
}

// Справочная строка без порога
export function infoRow(t, id, have, { items, itemsLabel, note } = {}) {
  return base(t, id, {
    kind: 'count', have, need: null, missing: 0, ok: null, status: 'info',
    ...(items && { items }), ...(itemsLabel && { itemsLabel }), ...(note && { note }),
  })
}

// Источник не прочитался (нет прав, сеть, таблицы нет) — вместо падения всего отчёта
export function noDataRow(t, id, kind, reason) {
  return base(t, id, {
    kind, have: null, need: t.need, missing: null, ok: null, status: 'nodata', note: reason,
  })
}
