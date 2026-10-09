import { KIND_LABEL, rowsOf, rulesText } from './contextSeries.js'

const pct = c => (typeof c === 'number' ? `${c}%` : '—')

// Широкие таблицы серии «длина контекста» — только внутри «Подробнее» (ContextSeriesBlock): результаты языка и сравнение языков
export function ResultTable({ rows }) {
  return (
    <div className="aspTableWrap"><table className="aspTable" aria-label="Результаты серии">
      <thead><tr><th>Слов</th><th>Эталон</th><th>Top-1</th><th>Вид</th><th>Conf.</th><th>Правила</th><th>Литерально</th></tr></thead>
      <tbody>{rows.map(r => (
        <tr key={r.step} className={r.kind === 'ref' ? 'apHit' : ''}>
          <td>{r.n}</td><td>{r.ref}</td><td>{r.top1}</td>
          <td>{KIND_LABEL[r.kind]}{r.fixed ? ' · interim исправлен' : ''}</td><td>{pct(r.conf)}</td>
          <td className="apWrap">{rulesText(r.verdicts)}</td><td className="apWrap">{r.literal.length ? r.literal.join(', ') : 'нет'}</td>
        </tr>
      ))}</tbody>
    </table></div>
  )
}

// Языки рядом: по строке на длину контекста, в ячейке «вид · уверенность»
export function CompareTable({ state, langs }) {
  const ns = [...new Set(langs.flatMap(l => rowsOf(state, l).map(r => r.n)))].sort((a, b) => a - b)
  const cell = (l, n) => { const r = rowsOf(state, l).find(x => x.n === n); return r ? `${KIND_LABEL[r.kind]} ${pct(r.conf)}` : '—' }
  return (
    <div className="aspTableWrap"><table className="aspTable" aria-label="Сравнение языков">
      <thead><tr><th>Слов</th>{langs.map(l => <th key={l}>{l}</th>)}</tr></thead>
      <tbody>{ns.map(n => <tr key={n}><td>{n}</td>{langs.map(l => <td key={l}>{cell(l, n)}</td>)}</tr>)}</tbody>
    </table></div>
  )
}
