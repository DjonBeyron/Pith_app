import { thresholdTable, recommend } from './controlSeries.js'

// Простая таблица «порог → поймали ошибок / ложных тревог» по всем прогонам языка (режимы «с ошибкой» и «контроль») + совет простыми словами.
// Ложная тревога = правило признало ошибкой ПРАВИЛЬНУЮ речь, потому что ошибочная форма мелькнула и в ней.
export default function ThresholdTable({ state, lang }) {
  const tab = thresholdTable(state, lang)
  const rec = recommend(tab)
  return (
    <div className="apThreshold" data-testid="threshold-table">
      <b className="apCardHead">Пороги мелькания · {lang}</b>
      <p className="aspHint">Прогонов с ошибкой: <b data-testid="n-err">{tab.nErr}</b> · контрольных (говорил правильно): <b data-testid="n-ctl">{tab.nCtl}</b>. Чем больше прогонов в каждом режиме, тем надёжнее вывод.</p>
      <div className="aspTableWrap"><table className="aspTable" aria-label="Пороги мелькания">
        <thead><tr><th>Порог, мс</th><th>Поймали ошибок</th><th>Ложных тревог</th></tr></thead>
        <tbody>{tab.rows.map(r => (
          <tr key={r.d} className={rec.d === r.d ? 'apHit' : ''} data-testid={`thr-${r.d}`}>
            <td>{r.d}</td><td>{r.caught} из {tab.nErr}</td><td className={r.falseAlarms ? 'aspBad' : ''}>{r.falseAlarms} из {tab.nCtl}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <p className="apVerdict apV-ok" data-testid="thr-advice">{rec.text}</p>
    </div>
  )
}
