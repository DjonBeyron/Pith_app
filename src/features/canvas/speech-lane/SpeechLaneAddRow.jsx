import { useState } from 'react'

// Строка «+ Дорожка» под таймлайном тренажёра: текст и кто это — диктор,
// ученик или перевод (отдельная дорожка, висит поверх круга на длину клипа).
// Новый вылет встаёт у плейхеда (SpeechLaneTimelineEditor передаёт время).
// Enter — добавить; после добавления поле очищается, роль остаётся — обычно
// подряд заводят несколько дорожек одной роли.
export default function SpeechLaneAddRow({ onAdd }) {
  const [text, setText] = useState('')
  const [role, setRole] = useState('coach')

  function add() {
    if (!text.trim()) return
    onAdd({ text, role })
    setText('')
  }

  return (
    <div className="tlAddTrack slAddRow">
      <input className="slAddText" value={text} placeholder={role === 'translation' ? 'текст перевода' : 'слово / фраза'}
        onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
      <select className="tlCellSelect" value={role} onChange={e => setRole(e.target.value)} title="Что это за дорожка">
        <option value="coach">🟢 диктор</option>
        <option value="user">🔴 ученик</option>
        <option value="translation">💬 перевод</option>
      </select>
      <button className="tlAddTrackBtn" onClick={add} disabled={!text.trim()}>+ Дорожка</button>
    </div>
  )
}
