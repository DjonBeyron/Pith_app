// Поля ноды «Реакция на сообщение»: какое эмодзи и к чьему сообщению его
// прилепить. Отдельный файл, а не блок в NodeContentEditor.jsx — тот уже
// у потолка размера (см. CLAUDE.md).

// Частые реакции под рукой; своё эмодзи можно вписать в поле рядом
const QUICK = ['👍', '🔥', '👏', '❤️', '😍', '💪', '🤯', '😎']

export default function NodeReactionPicker({ tData, onChange }) {
  const emoji  = tData.emoji ?? '👍'
  const target = tData.target ?? 'student'

  const stop = e => e.stopPropagation()

  return (
    <div className="nodeReactionBox" onClick={stop} onMouseDown={stop}>
      <div className="nodeReactionQuick">
        {QUICK.map(e => (
          <button
            key={e}
            type="button"
            className={`nodeReactionChip${emoji === e ? ' nodeReactionChipOn' : ''}`}
            onClick={() => onChange({ emoji: e })}
          >
            {e}
          </button>
        ))}
        <input
          className="nodeReactionInput"
          value={emoji}
          onChange={e => onChange({ emoji: e.target.value })}
          maxLength={4}
          title="Своё эмодзи"
        />
      </div>
      <label className="nodeReactionTarget">
        <span>Реакция на:</span>
        <select value={target} onChange={e => onChange({ target: e.target.value })}>
          <option value="student">ответ ученика (справа)</option>
          <option value="teacher">своё сообщение (слева)</option>
        </select>
      </label>
    </div>
  )
}
