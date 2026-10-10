import { condLabel } from './voskSeries.js'
import { verdictOf } from './voskClassify.js'
import { sec } from '../../../shared/lib/vosk/voskTiming.js'

// Широкая таблица всех прогонов (только внутри «Подробнее»): тип, условие, что сказали, что услышали, уверенность, итог, время
export default function VoskRunsTable({ runs }) {
  if (!runs.length) return <p className="aspHint">Прогонов пока нет.</p>
  return (
    <div className="aspTableWrap"><table className="aspTable vkTable" aria-label="Все прогоны Vosk">
      <thead><tr><th>№</th><th>Тип</th><th>Условие</th><th>Сказали</th><th>Услышали</th><th>Увер.</th><th>Вывод</th><th>partial</th><th>итог</th></tr></thead>
      <tbody>{runs.map((r, i) => (
        <tr key={r.t + '-' + i}><td>{i + 1}</td><td>{r.tag}{r.mode === 'control' ? ' (контр.)' : r.mode === 'error' ? ' (ошибка)' : ''}</td><td>{condLabel(r.cond)}</td>
          <td>{r.said || '—'}</td><td>{r.heard || '—'}</td><td>{r.kc ?? '—'}</td><td>{verdictOf(r).text}</td><td>{sec(r.tm?.fp)}</td><td>{sec(r.tm?.res)}</td></tr>
      ))}</tbody>
    </table></div>
  )
}
