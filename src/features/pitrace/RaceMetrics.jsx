import { fmtMs } from './raceMetrics.js'

// Метрики итога гонки (RaceSummary.jsx; расчёт — raceMetrics.js, стили — race-metrics.css): две компактные строки над «Самыми слабыми словами», без таблицы (на 375 px переносятся).
// Строка 1 — точность по этапам («Разгон 5/7 · Слушай и лови 6/8»); строка 2 — время ответа («в среднем 1,2 с · дольше всего «learn» 2,1 с · ловушки 2/3»). Чего нет (этап не шёл, не было верных ответов, ловушек) — частей нет; пусто — блока нет.
export default function RaceMetrics({ metrics }) {
  if (!metrics) return null
  const { accuracy, avgMs, slowest, traps } = metrics
  const acc = [accuracy.sprint && ['sprint', 'Разгон', accuracy.sprint], accuracy.catch && ['catch', 'Слушай и лови', accuracy.catch]].filter(Boolean)
  const time = [
    avgMs != null && <span key="avg" data-testid="race-metrics-avg">в среднем <b>{fmtMs(avgMs)}</b></span>,
    slowest && <span key="slow" data-testid="race-metrics-slowest">дольше всего «{slowest.text}» <b>{fmtMs(slowest.ms)}</b></span>,
    traps.total > 0 && <span key="traps" data-testid="race-metrics-traps">ловушки <b>{traps.dodged}/{traps.total}</b></span>,
  ].filter(Boolean)
  if (!acc.length && !time.length) return null
  return (
    <section className="raceMetrics" data-testid="race-metrics">
      {acc.length > 0 && <p className="raceMetricsRow" data-testid="race-metrics-acc">{acc.map(([id, title, a]) => <span key={id} data-testid={`race-metrics-${id}`}>{title} <b>{a.hit}/{a.total}</b></span>)}</p>}
      {time.length > 0 && <p className="raceMetricsRow" data-testid="race-metrics-time">{time}</p>}
    </section>
  )
}
