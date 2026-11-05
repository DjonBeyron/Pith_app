// Итог сессии «Мини-игры 2.0» (стенд: без памяти и XP): сколько слов поймано в «Ловлю» и залито в «Тени», «По памяти» и «Скорости». Чистые функции.
export const emptyScore = () => ({ catch: { hit: 0, total: 0 }, shadow: { hit: 0, total: 0 }, recall: { hit: 0, total: 0 }, speed: { hit: 0, total: 0 } })

/** Результат режима записывается поверх прежнего (повтор «Ловлю» заменяет попытку, а не складывается с ней); лучшая попытка не теряется */
export function withResult(score, mode, hit, total) {
  const prev = score[mode]
  if (!prev) return score
  const better = !prev.total || hit / Math.max(1, total) >= prev.hit / Math.max(1, prev.total)
  return { ...score, [mode]: better ? { hit, total } : prev }
}

const ROWS = [['catch', 'Поймано слов'], ['shadow', 'В «Тени» залито'], ['recall', 'По памяти залито'], ['speed', 'На скорости залито']]

/** Строки плашки итога: [{ id, label, text }] — режимы без слов (нет слов «к повтору» → «Ловлю» пропущено) показывают «—» */
export function summaryRows(score) {
  return ROWS.map(([id, label]) => {
    const r = score?.[id]
    return { id, label, text: r?.total ? `${r.hit} из ${r.total}` : '—' }
  })
}
