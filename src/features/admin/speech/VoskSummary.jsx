import { summaryLines } from './voskSummary.js'
import { thresholdTable, recommend, confSpread, spreadText } from './voskThreshold.js'

// Сводка Vosk-серии простыми строками (A, B, C, условия, задержки) и таблица порога уверенности слова: порог → принято правильных /
// отвергнуто неверных / ложных отказов + совет. Таблица узкая (4 столбца), строки сводки переносятся.
export default function VoskSummary({ state }) {
  const lines = summaryLines(state)
  const tab = thresholdTable(state.runs)
  const rec = recommend(tab)
  return (
    <div className="vkBox" data-testid="vk-summary">
      <b className="apCardHead">Сводка</b>
      {lines.length ? <ul className="vkSum">{lines.map(l => <li key={l.key} data-testid={`vk-sum-${l.key}`}>{l.text}</li>)}</ul> : <p className="aspHint">Пока нет прогонов: пройдите шаги A, B, C.</p>}
      <b className="apCardHead">Порог уверенности слова</b>
      <p className="aspHint" data-testid="vk-spread">Верных прогонов (контроль): <b>{tab.nRight}</b> · неверных (ошибка, ловушки, тишина): <b>{tab.nWrong}</b>. {spreadText(confSpread(state.runs))}.</p>
      <div className="aspTableWrap"><table className="aspTable vkTable" aria-label="Порог уверенности слова" data-testid="vk-thr">
        <thead><tr><th>Порог</th><th>Верных принято</th><th>Неверных отвергнуто</th><th>Ложных отказов</th></tr></thead>
        <tbody>{tab.rows.map(r => (
          <tr key={r.t} className={rec.t === r.t ? 'apHit' : ''} data-testid={`vk-thr-${r.t}`}>
            <td>{r.t}</td><td>{r.accepted} из {tab.nRight}</td><td>{r.rejected} из {tab.nWrong}</td><td className={r.refused ? 'aspBad' : ''}>{r.refused} из {tab.nRight}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <p className="apVerdict apV-ok" data-testid="vk-thr-advice">{rec.text}</p>
    </div>
  )
}
