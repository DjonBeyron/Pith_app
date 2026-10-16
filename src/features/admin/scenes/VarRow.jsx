import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { VAR_LIMITS } from '../../scene/v2/sceneVars.js'
import { cleanVarName, PICK_LABEL } from './varsOps.js'
import ScTip from './ScTip.jsx'

// Одна переменная шаблона в блоке «Слова-переменные»: имя, тип отбора слов, запасное слово и его перевод.
// Имя пока вводят — хранится локально и применяется, когда непустое и не занято (иначе при уходе поля возвращается прежнее).
// id полей — f-vars-<имя>-… для подсветки замечаний линтера (lintFieldMap.js).
export default function VarRow({ index, name, def, actions, taken, lock = false }) {
  const [typed, setTyped] = useState(null) // null — показываем имя из сцены
  const p = `f-vars-${name}`
  const commit = v => {
    const clean = cleanVarName(v)
    setTyped(clean)
    if (clean && clean !== name && !taken.includes(clean)) actions.renameVar(index, clean)
  }
  return (
    <li className="scbVarRow" id={p}>
      <div className="scbVarHead">
        <label className="scbField scbVarName">
          <span className="scbFieldLabel">Имя</span>
          <input
            id={`${p}-name`} className="fsNote" value={typed ?? name} maxLength={VAR_LIMITS.maxName} disabled={lock} spellCheck={false}
            onChange={e => commit(e.target.value)} onBlur={() => setTyped(null)} aria-label={`Имя переменной ${index + 1}`}
          />
        </label>
        <label className="scbField">
          <span className="scbFieldLabel">Какие слова <ScTip help="vars_pick" /></span>
          <select id={`${p}-pick`} className="fsNote" value={def.pick} disabled={lock} onChange={e => actions.updateVar(name, { pick: e.target.value })}>
            {Object.entries(PICK_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <button type="button" className="scbIcon scbIconDanger" onClick={() => actions.removeVar(name)} disabled={lock} aria-label={`Удалить переменную ${name}`} title="Удалить (в репликах {name} заменится запасным словом)"><Trash2 size={14} /></button>
      </div>
      <div className="scbVarFb">
        <label className="scbField">
          <span className="scbFieldLabel">Запасное слово <ScTip help="vars_fallback" /></span>
          <input id={`${p}-fallback-text`} className="fsNote" value={def.fallback?.text ?? ''} maxLength={VAR_LIMITS.maxWord} disabled={lock} onChange={e => actions.updateVar(name, { text: e.target.value })} placeholder="слово на языке оригинала" />
        </label>
        <label className="scbField">
          <span className="scbFieldLabel">Его перевод</span>
          <input id={`${p}-fallback-translation`} className="fsNote" value={def.fallback?.translation ?? ''} maxLength={VAR_LIMITS.maxWord} disabled={lock} onChange={e => actions.updateVar(name, { translation: e.target.value })} placeholder="по-русски, для {имя:ru}" />
        </label>
      </div>
    </li>
  )
}
