import { useState, useEffect } from 'react'
import { fetchPromptGroups } from '../../shared/api/analyticsApi.js'

// Сколько человек нужно в КАЖДОЙ группе, чтобы увидеть разницу возврата на 2-й день в 5 п.п. (например, 25% против 30%)
// при мощности 80% и уровне значимости 5% (PLAN_NEW_USER.md, раздел 7 «Контрольная группа»). Пока в любой группе меньше —
// цифры в таблице только копятся, выводов из них делать нельзя.
export const MIN_GROUP = 1250

const LABELS = { control: 'Без вопросов (контроль)', prompts: 'С вопросами Пита' }

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—')

// Таблица разреза по группам (чистая — без запросов, проверяется в тестах). groups — из RPC analytics_prompt_groups.
// Возврат считается от базы «срок уже наступил» (d2_base / d7_base); нет поля (старый ответ) — от всех устройств
export function AnalyticsGroupsView({ groups }) {
  const list = Array.isArray(groups) ? groups : []
  const small = list.length === 0 || list.some(g => (g.devices ?? 0) < MIN_GROUP)
  return (
    <>
      {list.length === 0 ? <p className="aeHint">Пока нет данных</p> : (
        <table className="anTable">
          <thead><tr>{['Группа', 'Людей', 'Возврат D2', 'D7', 'Показов', 'Закрытий'].map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {list.map(g => (
              <tr key={g.group}>
                <td>{LABELS[g.group] ?? g.group}</td>
                <td>{g.devices}</td>
                <td>{pct(g.ret_d2, g.d2_base ?? g.devices)}</td>
                <td>{pct(g.ret_d7, g.d7_base ?? g.devices)}</td>
                <td>{g.prompt_shown}</td>
                <td>{pct(g.prompt_dismiss, g.prompt_shown)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {small && <div className="anLowData">Мало данных — выводов нет (нужно ~{MIN_GROUP} человек в каждой группе)</div>}
    </>
  )
}

// Админ → Аналитика: разрез по группе «вопросы Пита» за выбранный период (новые устройства периода)
export default function AnalyticsGroups({ days, reloadKey }) {
  const [done, setDone] = useState(null) // { key, res } — ответ вместе с тем, для какого периода он получен
  const key = `${days}:${reloadKey ?? 0}`
  const res = done?.key === key ? done.res : null // ответ не от текущего периода — снова «Загрузка»

  useEffect(() => {
    let cancelled = false
    fetchPromptGroups(days).then(r => { if (!cancelled) setDone({ key, res: r }) })
    return () => { cancelled = true }
  }, [days, key])

  return (
    <section className="anBlock">
      <div className="anBlockTitle">Группы «вопросы Пита» за {days} дн (новые устройства)</div>
      {res === null && <p className="aeHint">Загрузка...</p>}
      {res?.error && <p className="aeError">Не удалось загрузить: {res.error}. Если функции нет — применить миграцию 20261027141000_analytics_prompt_groups.sql.</p>}
      {res?.data && <AnalyticsGroupsView groups={res.data.groups} />}
    </section>
  )
}
