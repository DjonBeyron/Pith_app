import { attemptFields } from './speechReportAttempts.js'

// Раскрытая строка журнала: тексты попытки (эталон, «что я сказал», top-1, N-best, interim-история, изменения, вердикты).
// Данные из записи журнала (`tx`), хранятся только в этом браузере.
export default function AttemptDetails({ entry }) {
  const tx = entry.tx
  if (!tx) return <p className="aspHint">Текстов у этой попытки нет (нет итога и interim, либо запись сделана до появления текстов в журнале).</p>
  const rows = attemptFields(entry).filter(f => f[2] && f[0] !== 'lang' && f[0] !== 'modes')
  return (
    <div className="apDet">
      <div className="aspHint">{tx.lang} · {tx.modes?.length ? tx.modes.join('+') : 'обычный'}{tx.series ? ` · серия, шаг ${tx.series.step + 1}` : ''}</div>
      {tx.alts?.length > 0 && (
        <ol className="aspAlts" aria-label="N-best">
          {tx.alts.map((a, i) => <li key={i}>{a.text} <span className="aspHint">({a.conf == null ? 'нет' : `${a.conf}%`})</span></li>)}
        </ol>
      )}
      <ul className="apDetList">
        {rows.filter(f => f[0] !== 'alts').map(([k, label, text]) => <li key={k}><b>{label}:</b> {text.replace(/^[a-z0-9-]+=/i, '').replace(/^interim-история: |^final-vs-interim: |^вердикты: |^литерально: /, '')}</li>)}
        {tx.lastInterim && <li><b>последний interim:</b> «{tx.lastInterim}»</li>}
      </ul>
    </div>
  )
}
