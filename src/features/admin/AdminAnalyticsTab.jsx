import { useState, useEffect } from 'react'
import { fetchAnalyticsReport } from '../../shared/api/analyticsApi.js'

const PERIODS = [7, 14, 30]

const FUNNEL = [
  ['devices', 'Открыли приложение'],
  ['feed_view', 'Смотрели ленту'],
  ['feed_learn', 'Нажали «Изучить фразу»'],
  ['lesson_start', 'Начали урок'],
  ['lesson_finish', 'Прошли урок'],
  ['signup', 'Зарегистрировались'],
]

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—')
const day = d => d.slice(8, 10) + '.' + d.slice(5, 7)

// Админ → Аналитика: отчёт по журналу app_events (analytics/track.js) за
// 7/14/30 дней. Считаются устройства (anon_id); устройства, где хоть раз
// был админ, исключены сервером. Первую неделю после запуска журнала
// удержание завышает «новых»: старые пользователи впервые попадают в журнал.
export default function AdminAnalyticsTab() {
  const [days, setDays] = useState(14)
  const [res, setRes] = useState(null) // null — загрузка; { data, error }

  useEffect(() => {
    let cancelled = false
    fetchAnalyticsReport(days).then(r => { if (!cancelled) setRes(r) })
    return () => { cancelled = true }
  }, [days])

  function pick(d) {
    setRes(null)
    setDays(d)
  }

  function reload() {
    setRes(null)
    fetchAnalyticsReport(days).then(setRes)
  }

  const r = res?.data
  const f = r?.funnel

  return (
    <div className="anWrap">
      <div className="aeHead">
        <span className="aeTitle">Аналитика</span>
        <div className="anPeriods">
          {PERIODS.map(p => (
            <button key={p} className={p === days ? 'anPeriod anPeriodActive' : 'anPeriod'} onClick={() => pick(p)}>
              {p} дн
            </button>
          ))}
          <button className="aeRefresh" onClick={reload}>Обновить</button>
        </div>
      </div>

      {res === null && <p className="aeHint">Загрузка...</p>}
      {res?.error && (
        <p className="aeError">
          Не удалось загрузить: {res.error}. Если функции нет — применить миграцию
          20260924130000_app_events.sql.
        </p>
      )}

      {f && (
        <section className="anBlock">
          <div className="anBlockTitle">Воронка за {r.days} дн (устройства)</div>
          {FUNNEL.map(([key, label]) => (
            <div key={key} className="anFunnelRow">
              <span className="anFunnelLabel">{label}</span>
              <span className="anFunnelBar"><span style={{ width: f.devices ? `${(f[key] / f.devices) * 100}%` : 0 }} /></span>
              <span className="anNum">{f[key]}</span>
              <span className="anPct">{pct(f[key], f.devices)}</span>
            </div>
          ))}
          <div className="anNote">
            Пуш открыт: {f.push_open} · Пейволл показан: {f.paywall_view} · нажата оплата: {f.paywall_click}
          </div>
        </section>
      )}

      {r && (
        <AnTable
          title="Удержание: вернулись на следующий день (D1) и через неделю (D7)"
          head={['Первый день', 'Новых', 'D1', 'D7']}
          rows={r.retention.map(c => [day(c.day), c.size,
            c.d1 == null ? '…' : pct(c.d1, c.size), c.d7 == null ? '…' : pct(c.d7, c.size)])}
        />
      )}

      {r && (
        <AnTable
          title="Активные устройства по дням"
          head={['День', 'Устройств']}
          rows={r.daily.map(d => [day(d.day), d.devices])}
        />
      )}

      {r && (
        <AnTable
          title="Уроки: где бросают"
          head={['Урок', 'Старт', 'Прошли', 'Бросили', 'Бросают на']}
          rows={r.lessons.map(l => [l.title, l.starts, pct(l.finishes, l.starts), l.abandons,
            l.abandon_pct == null ? '—' : `${l.abandon_pct}%`])}
        />
      )}

      {r && (
        <AnTable
          title="Лента: фразы (пролистал = меньше 2 с)"
          head={['Фраза', 'Показов', 'Медиана', 'Пролистали', '«Изучить»']}
          rows={r.feed.map(m => [m.title, m.views,
            m.median_ms == null ? '—' : `${(m.median_ms / 1000).toFixed(1)} с`,
            pct(m.skips, m.views), pct(m.learns, m.views)])}
        />
      )}
    </div>
  )
}

function AnTable({ title, head, rows }) {
  return (
    <section className="anBlock">
      <div className="anBlockTitle">{title}</div>
      {rows.length === 0 ? <p className="aeHint">Пока нет данных</p> : (
        <table className="anTable">
          <thead><tr>{head.map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>{row.map((c, j) => <td key={j}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
