import { Trash2 } from 'lucide-react'
import { VAR_LIMITS } from '../../../scene/v2/sceneVars.js'
import { MEMORY_LEVELS, levelName } from '../../../../shared/lib/memory/memoryLevels.js'
import LevelDot from '../LevelDot.jsx'
import { MAX_MEMORY_WORDS, DEFAULT_MEMORY } from './sandboxVarsModel.js'

// Редактируемая имитация памяти пользователя: слово, перевод, уровень (стандарт memoryLevels), «просрочено».
// Только для теста — хранится в sessionStorage, настоящая память (word_memory) не читается и не меняется.
export default function SandboxVarsMemory({ memory, onChange }) {
  const set = (i, patch) => onChange(memory.map((w, j) => {
    if (j !== i) return w
    const next = { ...w, ...patch }
    return next.level === 0 ? { ...next, due: false } : next
  }))
  const add = () => onChange([...memory, { text: '', translation: '', level: 1, due: false }])
  return (
    <div className="scbSbMem">
      <p className="scbFieldLabel">Имитация памяти пользователя ({memory.length} / {MAX_MEMORY_WORDS})</p>
      <ul className="scbSbMemList">
        {memory.map((w, i) => (
          <li key={i} className="scbSbMemRow">
            <LevelDot level={w.level} />
            <select className="fsNote scbSbMemSel" value={w.level} onChange={e => set(i, { level: Number(e.target.value) })} aria-label={`Уровень слова ${i + 1}`}>
              {MEMORY_LEVELS.map(l => <option key={l.id} value={l.id}>{l.id} · {l.name}</option>)}
            </select>
            <input className="fsNote scbSbMemW" value={w.text} maxLength={VAR_LIMITS.maxWord} placeholder="слово" onChange={e => set(i, { text: e.target.value })} aria-label={`Слово ${i + 1}`} />
            <input className="fsNote scbSbMemT" value={w.translation} maxLength={VAR_LIMITS.maxWord} placeholder="перевод" onChange={e => set(i, { translation: e.target.value })} aria-label={`Перевод слова ${i + 1}`} />
            <label className="scCheck scbSbMemDue" title={w.level === 0 ? 'Временные слова вне памяти — повтора у них нет' : 'Повтор просрочен'}>
              <input type="checkbox" checked={w.due} disabled={w.level === 0} onChange={e => set(i, { due: e.target.checked })} aria-label={`Просрочено: слово ${i + 1} (${levelName(w.level)})`} /> просрочено
            </label>
            <button type="button" className="scbIcon scbIconDanger scbSbMemDel" onClick={() => onChange(memory.filter((_, j) => j !== i))} aria-label={`Убрать слово ${i + 1} из имитации`} title="Убрать"><Trash2 size={14} /></button>
          </li>
        ))}
      </ul>
      <div className="scbCtlRow">
        <button type="button" className="fsBtn fsBtnSmall" onClick={add} disabled={memory.length >= MAX_MEMORY_WORDS}>Добавить слово</button>
        <button type="button" className="fsBtn fsBtnSmall" onClick={() => onChange(DEFAULT_MEMORY.map(w => ({ ...w })))}>Вернуть пример по уровням</button>
      </div>
    </div>
  )
}
