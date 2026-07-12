import { useState, useEffect } from 'react'
import {
  fetchStreakMilestonesAdmin, saveStreakMilestone, deleteStreakMilestone,
} from '../../shared/api/streakMilestonesApi.js'

const BLANK = { day_number: '', xp_reward: 0, ticket_reward: 0, special: false, label: '' }

// Админ-вкладка «Стрик»: редактор вех streak_milestones прямо из приложения
// (день, XP, билеты, «спецокно», подпись). Защита от обычных пользователей —
// на уровне RLS (streak_milestones_write_admin), не только скрытие кнопки.
export default function AdminStreakTab() {
  const [rows, setRows] = useState(null)
  const [draft, setDraft] = useState({ ...BLANK })
  const [busy, setBusy] = useState(false)

  function refresh() {
    fetchStreakMilestonesAdmin().then(setRows)
  }
  useEffect(refresh, [])

  async function handleSaveRow(row) {
    setBusy(true)
    try { await saveStreakMilestone(row); refresh() } finally { setBusy(false) }
  }

  async function handleDelete(dayNumber) {
    if (!window.confirm(`Удалить веху дня ${dayNumber}?`)) return
    setBusy(true)
    try { await deleteStreakMilestone(dayNumber); refresh() } finally { setBusy(false) }
  }

  async function handleAdd() {
    const day = parseInt(draft.day_number, 10)
    if (!day || day < 1) return
    setBusy(true)
    try {
      await saveStreakMilestone({
        day_number: day,
        xp_reward: parseInt(draft.xp_reward, 10) || 0,
        ticket_reward: parseInt(draft.ticket_reward, 10) || 0,
        special: !!draft.special,
        label: draft.label || `${day} дней`,
      })
      setDraft({ ...BLANK })
      refresh()
    } finally { setBusy(false) }
  }

  function patchRow(day, patch) {
    setRows(rs => rs.map(r => r.day_number === day ? { ...r, ...patch } : r))
  }

  return (
    <div className="amScreen">
      <div className="asAddForm">
        <input className="asInput asInputSm" type="number" placeholder="День" value={draft.day_number}
          onChange={e => setDraft(d => ({ ...d, day_number: e.target.value }))} />
        <input className="asInput asInputSm" type="number" placeholder="XP" value={draft.xp_reward}
          onChange={e => setDraft(d => ({ ...d, xp_reward: e.target.value }))} />
        <input className="asInput asInputSm" type="number" placeholder="Билеты" value={draft.ticket_reward}
          onChange={e => setDraft(d => ({ ...d, ticket_reward: e.target.value }))} />
        <input className="asInput" placeholder="Подпись" value={draft.label}
          onChange={e => setDraft(d => ({ ...d, label: e.target.value }))} />
        <label className="asSpecialLabel">
          <input type="checkbox" checked={draft.special}
            onChange={e => setDraft(d => ({ ...d, special: e.target.checked }))} /> спецокно
        </label>
        <button className="amCreateBtn" onClick={handleAdd} disabled={busy}>+ Добавить веху</button>
      </div>

      {rows === null ? (
        <div className="amEmpty">Загрузка...</div>
      ) : rows.length === 0 ? (
        <div className="amEmpty">Вех пока нет — дни без вехи получают 5 XP по умолчанию</div>
      ) : rows.map(r => (
        <div key={r.day_number} className="amRow asRow">
          <span className="asDayLabel">День {r.day_number}</span>
          <input className="asInput asInputSm" type="number" value={r.xp_reward}
            onChange={e => patchRow(r.day_number, { xp_reward: parseInt(e.target.value, 10) || 0 })} />
          <input className="asInput asInputSm" type="number" value={r.ticket_reward}
            onChange={e => patchRow(r.day_number, { ticket_reward: parseInt(e.target.value, 10) || 0 })} />
          <input className="asInput" value={r.label}
            onChange={e => patchRow(r.day_number, { label: e.target.value })} />
          <label className="asSpecialLabel">
            <input type="checkbox" checked={!!r.special}
              onChange={e => patchRow(r.day_number, { special: e.target.checked })} /> спецокно
          </label>
          <button className="amChip amChipOk amChipBtn" disabled={busy} onClick={() => handleSaveRow(r)}>
            Сохранить
          </button>
          <button className="amDel" onClick={() => handleDelete(r.day_number)} disabled={busy} title="Удалить веху">✕</button>
        </div>
      ))}
    </div>
  )
}
